import { type Address, type Hash, type PublicClient, type WalletClient, createPublicClient, custom } from 'viem';
import { sendTransaction, signMessage, signTypedData } from 'viem/actions';
import type { SdkEnvironment } from '../../api/environment';
import { QuoteStaleError } from '../../errors';
import { ChainSwitch } from '../../swap/chainSwitch';
import { getPublicClient } from '../../swap/publicClients';
import { resolveChainId } from '../../swap/walletClient';
import type { AdaptedWallet, ExecuteQuoteParams, ExecuteQuoteResult, NormalizedQuote } from '../types';
import { type RelayEnvironment, relayFetch, resolveRelayUrl } from './client';
import { RELAY_NATIVE_ADDRESS, extractRequestId } from './quotes';
import { isSolanaChain } from './solana';
import type { RelayQuoteResponse, RelaySignData, RelayStep, RelayStepItem } from './types';

export interface ExecuteRelayContext {
  sdkEnv: SdkEnvironment;
  relayEnv: RelayEnvironment;
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Relay execution aborted', 'AbortError');
}

/**
 * Resolve a viem `PublicClient` for awaiting a receipt on `chainId`. Prefers the
 * SDK's configured RPC (integrator overrides + static registry), but Relay
 * supports many chains that aren't in the SDK's registry (e.g. HyperEVM), so
 * when no RPC is configured we fall back to the connected wallet's own provider,
 * which is already on this (source) chain. Without this fallback a Relay swap on
 * an unregistered chain throws right after the deposit tx is sent, surfacing as
 * an immediate failure.
 */
function getReceiptClient(sdkEnv: SdkEnvironment, chainId: number, walletClient: WalletClient): PublicClient {
  try {
    return getPublicClient(sdkEnv, chainId);
  } catch {
    const request = (walletClient as unknown as { request?: (args: unknown) => Promise<unknown> }).request;
    if (typeof request !== 'function') throw new Error(`No RPC available to await receipt on chain ${chainId}`);
    return createPublicClient({
      transport: custom({ request: (args) => request(args) }),
    }) as PublicClient;
  }
}

/** A transaction step id that actually commits funds (as opposed to `approve`). */
function isFundingStep(step: RelayStep): boolean {
  return step.id !== 'approve';
}

/**
 * Whether a step item must be executed through a Solana wallet.
 *
 * Relay does not put a `chainId` on SVM step items — a Solana deposit arrives as
 * `{ instructions, addressLookupTableAddresses }` with no `to`/`data`/`value`.
 * So `instructions` is the primary marker; `chainId` is only consulted as a
 * secondary signal, falling back to the quote's source chain.
 */
function isSvmTransactionItem(item: RelayStepItem, srcChainId: number): boolean {
  const data = item.data;
  if (!data) return false;
  if (Array.isArray(data.instructions)) return true;
  if (data.chainId != null) return isSolanaChain(data.chainId);
  return isSolanaChain(srcChainId);
}

/** Sign a Relay signature step item per its `signatureKind`. */
async function signItem(
  walletClient: WalletClient,
  userAddress: Address,
  sign: RelaySignData,
): Promise<string> {
  if (sign.signatureKind === 'eip191') {
    const message = typeof sign.message === 'string' ? sign.message : JSON.stringify(sign.message ?? '');
    return signMessage(walletClient, { account: userAddress, message });
  }

  // EIP-712: viem reconstructs EIP712Domain from `domain`, so strip it from types.
  const rawTypes = (sign.types ?? {}) as Record<string, unknown>;
  const { EIP712Domain: _drop, ...types } = rawTypes;
  const message = (sign.value ?? sign.message ?? {}) as Record<string, unknown>;

  return signTypedData(walletClient, {
    account: userAddress,
    domain: (sign.domain ?? {}) as Record<string, unknown>,
    types: types as Record<string, readonly { name: string; type: string }[]>,
    primaryType: sign.primaryType as string,
    message,
  } as Parameters<typeof signTypedData>[1]);
}

/**
 * Bounded, best-effort poll of a step item's `check` endpoint. Never throws and
 * never hangs — used only to confirm a deposit was picked up before proceeding.
 * The authoritative terminal outcome comes from `pollStatus`.
 */
async function pollStepCheck(
  relayEnv: RelayEnvironment,
  endpoint: string,
  method: string,
  signal?: AbortSignal,
): Promise<void> {
  const url = resolveRelayUrl(relayEnv, endpoint);
  const deadline = Date.now() + 60_000;
  const intervalMs = 3_000;
  // Statuses that mean the intent has been observed/progressed. `unknown` and
  // `waiting` mean "not yet indexed / awaiting deposit confirmation", so we
  // keep polling through them.
  const progressed = new Set(['depositing', 'pending', 'submitted', 'success', 'delayed', 'failure', 'refund']);
  while (Date.now() < deadline) {
    if (signal?.aborted) return;
    try {
      const res = await relayFetch<{ status?: string }>(relayEnv, url, {
        method: method || 'GET',
        ...(signal ? { signal } : {}),
      });
      const status = res?.status;
      if (status && progressed.has(status)) return;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      // Transient — keep trying until the deadline.
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * Execute a Relay quote by walking its `steps` in order (approve → deposit/swap →
 * maybe sign). Transaction steps are sent via the wallet client and awaited;
 * signature steps are signed and submitted to their `post` endpoint. Reuses the
 * shared chain-switch, public-client (receipts), and RPC-override machinery so
 * Relay honors the same integrator config as Aori.
 */
export async function executeRelayQuote(
  quote: NormalizedQuote,
  params: ExecuteQuoteParams,
  ctx: ExecuteRelayContext,
): Promise<ExecuteQuoteResult> {
  const { walletClient, onStep, onTxHash, validateBeforeSubmit, skipChainSwitch, abortSignal, solanaWallet } = params;
  const { sdkEnv, relayEnv } = ctx;

  const userAddress = (params.userAddress || walletClient.account?.address) as Address | undefined;
  if (!userAddress) {
    throw new Error('userAddress is required (walletClient.account is missing)');
  }

  const raw = quote.raw as RelayQuoteResponse;
  const steps = raw.steps ?? [];

  const txHashes: string[] = [];
  let signature: string | undefined;
  let validated = false;
  let currentChainId: number | null = null;

  const ensureChain = async (chainId: number): Promise<void> => {
    if (skipChainSwitch) return;
    if (currentChainId == null) currentChainId = await resolveChainId(walletClient);
    if (currentChainId !== chainId) {
      onStep?.({ kind: 'chain-switch', chainId });
      await ChainSwitch(walletClient, chainId);
      await new Promise((r) => setTimeout(r, 800));
      currentChainId = chainId;
    }
  };

  const runValidation = (): void => {
    if (validated || !validateBeforeSubmit) return;
    const result = validateBeforeSubmit();
    if (!result.canSubmit) throw new QuoteStaleError(result.reason || 'Quote expired before submission');
    validated = true;
  };

  for (const step of steps) {
    for (const item of step.items ?? []) {
      checkAborted(abortSignal);
      if (item.status === 'complete') continue;

      if (step.kind === 'transaction') {
        if (isSvmTransactionItem(item, quote.srcChainId)) {
          await executeSolanaTransactionItem(step, item, {
            relayEnv,
            solanaWallet,
            svmChainId: item.data?.chainId ?? quote.srcChainId,
            abortSignal,
            onStep: (s) => onStep?.(s),
            onTxHash: (hash, kind) => onTxHash?.(hash, kind),
            beforeFunding: () => {
              if (isFundingStep(step)) runValidation();
            },
            pushHash: (hash) => txHashes.push(hash),
          });
        } else {
          await executeTransactionItem(step, item, {
            sdkEnv,
            relayEnv,
            walletClient,
            userAddress,
            ...(abortSignal ? { abortSignal } : {}),
            ensureChain,
            onStep: (s) => onStep?.(s),
            onTxHash: (hash, kind) => onTxHash?.(hash, kind),
            beforeFunding: () => {
              if (isFundingStep(step)) runValidation();
            },
            pushHash: (hash) => txHashes.push(hash),
          });
        }
      } else if (step.kind === 'signature') {
        const sign = item.data?.sign;
        if (!sign) continue;
        runValidation();
        onStep?.({ kind: 'signing' });

        // Solana signature steps are delegated to the adapted wallet. Note the
        // official SVM adapter does not implement message signing, so this
        // surfaces its error rather than silently signing with the EVM wallet.
        let sig: string;
        if (isSolanaChain(item.data?.chainId ?? quote.srcChainId)) {
          if (!solanaWallet) {
            throw new Error(
              'Solana signature step encountered but no solanaWallet was provided. ' +
                'Pass a Solana adapted wallet (e.g. from @relayprotocol/relay-svm-wallet-adapter) in ExecuteQuoteParams.',
            );
          }
          sig = await solanaWallet.handleSignMessageStep(item, step);
        } else {
          sig = await signItem(walletClient as WalletClient, userAddress, sign);
        }

        signature = sig;
        await submitSignature(relayEnv, item, sig, abortSignal);
        onStep?.({ kind: 'submitted', quoteId: extractRequestId(raw) || quote.quoteId });
      }
    }
  }

  const quoteId = extractRequestId(raw) || quote.quoteId;
  onStep?.({ kind: 'done', quoteId });

  const isNativeDeposit = quote.inputToken.toLowerCase() === RELAY_NATIVE_ADDRESS;

  return {
    venue: 'relay',
    quoteId,
    txHashes,
    ...(signature ? { signature } : {}),
    isNativeDeposit,
  };
}

interface ExecuteTxItemCtx {
  sdkEnv: SdkEnvironment;
  relayEnv: RelayEnvironment;
  walletClient: ExecuteQuoteParams['walletClient'];
  userAddress: Address;
  abortSignal?: AbortSignal;
  ensureChain: (chainId: number) => Promise<void>;
  onStep: (step: import('../types').QuoteExecutionStep) => void;
  onTxHash: (hash: string, kind: string) => void;
  beforeFunding: () => void;
  pushHash: (hash: string) => void;
}

async function executeTransactionItem(step: RelayStep, item: RelayStepItem, ctx: ExecuteTxItemCtx): Promise<void> {
  const data = item.data;
  if (!data?.to) return;

  const chainId = data.chainId;
  if (chainId == null) throw new Error(`Relay transaction step "${step.id}" is missing chainId`);

  await ctx.ensureChain(chainId);
  ctx.beforeFunding();
  checkAborted(ctx.abortSignal);

  const hash = (await sendTransaction(ctx.walletClient as WalletClient, {
    account: ctx.userAddress,
    chain: ctx.walletClient.chain ?? null,
    to: data.to as Address,
    data: (data.data || '0x') as `0x${string}`,
    value: BigInt(data.value || '0'),
  })) as Hash;

  ctx.pushHash(hash);
  const kind = step.id === 'approve' ? 'approval' : step.id;
  ctx.onTxHash(hash, kind);
  if (step.id === 'approve') {
    ctx.onStep({ kind: 'approval-sent', hash });
  } else {
    ctx.onStep({ kind: 'transaction-sent', hash, chainId });
  }

  await getReceiptClient(ctx.sdkEnv, chainId, ctx.walletClient as WalletClient).waitForTransactionReceipt({ hash });

  if (item.check?.endpoint) {
    await pollStepCheck(ctx.relayEnv, item.check.endpoint, item.check.method, ctx.abortSignal);
  }
}

interface ExecuteSolanaTxItemCtx {
  relayEnv: RelayEnvironment;
  solanaWallet?: AdaptedWallet;
  /** Relay omits chainId on SVM items, so this is resolved by the caller. */
  svmChainId: number;
  abortSignal?: AbortSignal;
  onStep: (step: import('../types').QuoteExecutionStep) => void;
  onTxHash: (hash: string, kind: string) => void;
  beforeFunding: () => void;
  pushHash: (hash: string) => void;
}

/**
 * Execute a Solana (SVM) transaction step via the adapted wallet. The adapter
 * compiles `item.data.instructions` into a versioned transaction, signs, and
 * broadcasts; we drive progress callbacks and poll the Relay check endpoint.
 *
 * No chain switch is performed — Solana is a separate wallet connection, not a
 * chain the EVM wallet can switch to.
 */
async function executeSolanaTransactionItem(
  step: RelayStep,
  item: RelayStepItem,
  ctx: ExecuteSolanaTxItemCtx,
): Promise<void> {
  if (!ctx.solanaWallet) {
    throw new Error(
      'Solana transaction step encountered but no solanaWallet was provided. ' +
        'Pass a Solana adapted wallet (e.g. from @relayprotocol/relay-svm-wallet-adapter) in ExecuteQuoteParams.',
    );
  }

  const chainId = ctx.svmChainId;

  ctx.beforeFunding();
  checkAborted(ctx.abortSignal);

  const hash = await ctx.solanaWallet.handleSendTransactionStep(chainId, item, step);

  ctx.pushHash(hash);
  ctx.onTxHash(hash, step.id);
  ctx.onStep({ kind: 'transaction-sent', hash, chainId });

  await ctx.solanaWallet.handleConfirmTransactionStep(hash, chainId);

  if (item.check?.endpoint) {
    await pollStepCheck(ctx.relayEnv, item.check.endpoint, item.check.method, ctx.abortSignal);
  }
}

/** Submit a signed signature step to its `post` endpoint (signature as query param). */
async function submitSignature(
  relayEnv: RelayEnvironment,
  item: RelayStepItem,
  signature: string,
  signal?: AbortSignal,
): Promise<void> {
  const post = item.data?.post;
  if (!post?.endpoint) return;
  const base = resolveRelayUrl(relayEnv, post.endpoint);
  const url = `${base}${base.includes('?') ? '&' : '?'}signature=${encodeURIComponent(signature)}`;
  await relayFetch(relayEnv, url, {
    method: post.method || 'POST',
    ...(post.body != null ? { body: post.body } : {}),
    ...(signal ? { signal } : {}),
  });
}
