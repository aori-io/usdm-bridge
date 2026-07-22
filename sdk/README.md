# usdm-bridge-sdk

Headless TypeScript SDK for the [Aori](https://aori.io) API that powers the [`usdm-bridge-widget`](https://www.npmjs.com/package/usdm-bridge-widget). Same quote → sign → submit → status flow as the widget — without React, wagmi, or any UI. Built on [`@aori/aori-ts`](https://www.npmjs.com/package/@aori/aori-ts).

Use this when you want to bridge to/from USDM on MegaETH (or any other Aori-supported pair) from a backend job, a CLI, a custom UI, or a non-React framework.

## Install

```bash
npm install usdm-bridge-sdk viem
# or
bun add usdm-bridge-sdk viem
```

`viem` is a required peer **whether or not you use the ethers adapter** — see [Using ethers v6](#using-ethers-v6-as-an-integrator-side-adapter). `ethers` is an optional peer; install it only if you want your application code to construct the wallet client through the ethers adapter:

```bash
npm install usdm-bridge-sdk viem ethers
```

## Configure

`UsdmBridgeConfig` mirrors the widget's `aori.config.ts` shape, minus the theme/appearance/wallet-modal fields. The example below binds the **output** side of every pair to USDM on MegaETH (chain `4326`), the canonical "USDM bridge" setup.

```ts
import type { UsdmBridgeConfig } from 'usdm-bridge-sdk';

export const usdmBridgeConfig: UsdmBridgeConfig = {
  aoriApiBaseUrl: '/api/aori',
  rpcOverrides: {
    1: '/api/rpc/1',
    8453: '/api/rpc/8453',
    42161: '/api/rpc/42161',
    4326: '/api/rpc/4326',
  },
  tokens: {
    defaultBase: { chainId: 1, address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' }, // USDC Ethereum
    defaultQuote: { chainId: 4326, address: '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7' }, // USDM MegaETH
    supportedOutputTokens: [
      { chainId: 4326, address: '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7' },
    ],
    supportedOutputChains: [4326],
  },
  walletScreening: {
    enabled: true,
    useChainalysisOracle: true,
    screeningUrl: '/api/screening',
  },
  settings: {
    pollingIntervalMs: 4000,
    statusTimeoutMs: 300_000,
  },
};
```

`getQuote` rejects any pair whose input or output isn't in the configured `supported*` lists with `UnsupportedPairError` — that's how you keep one side of every quote bound to USDM.

## One-shot bridge (recommended)

`sdk.bridge(...)` runs the entire flow — `executeSwap`, the deposit-chain settle delay (native only), and `pollStatus` — and resolves only after the order reaches a terminal state. Use the `onSuccess` / `onFailure` / `onSettled` hooks to trigger code in your application when the swap completes. All three are awaited before the returned promise resolves, so you can `await` side effects (analytics, crediting an account, sending a push notification, …) inline:

```ts
import { UsdmBridgeSdk } from 'usdm-bridge-sdk';

const sdk = new UsdmBridgeSdk(usdmBridgeConfig);

const quote = await sdk.getQuote({ /* … */ });

const result = await sdk.bridge({
  quote,
  walletClient,
  onStep:         (step)   => console.log('step:', step.kind),
  onStatusChange: (status) => console.log('status:', status.status),

  onSuccess: async (r) => {
    await fetch('/api/credit-user', {
      method: 'POST',
      body: JSON.stringify({ userId, settlementTxHash: r.txHash, amount: r.quote.outputAmount }),
    });
  },
  onFailure: (r) => sentry.captureMessage('bridge failed', { extra: r }),
  onSettled: (r) => analytics.track('bridge_settled', { outcome: r.outcome, orderHash: r.orderHash }),
});

if (result.outcome === 'success') {
  console.log('Settled:', result.txHash, result.txUrl);
} else {
  console.warn('Did not settle:', result.status.status);
}
```

`bridge()` resolves regardless of outcome — `result.outcome` is `'success'` for `completed` and `'failure'` for `failed`/`cancelled`. The promise only **rejects** for actual errors: network failures, user-rejected signing, abort, or anything thrown from your hooks.

Cancel a bridge in flight with an `AbortSignal`:

```ts
const ac = new AbortController();
const promise = sdk.bridge({ quote, walletClient, abortSignal: ac.signal, onSuccess });
// later…
ac.abort();
```

If you'd rather drive `executeSwap` and `pollStatus` separately (e.g. to render distinct "submitting" vs "settling" UI states), the lower-level flow below still works.

## Quote → Swap → Status (low-level)

```ts
import { UsdmBridgeSdk } from 'usdm-bridge-sdk';
import { createWalletClient, custom } from 'viem';
import { mainnet } from 'viem/chains';
import { usdmBridgeConfig } from './usdm-bridge.config';

const sdk = new UsdmBridgeSdk(usdmBridgeConfig);

const walletClient = createWalletClient({
  account: '0xYourAddress',
  chain: mainnet,
  transport: custom(window.ethereum!),
});

// 1. Fetch a quote
const quote = await sdk.getQuote({
  srcChainId: 1,
  dstChainId: 4326,
  srcTokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC Ethereum
  dstTokenAddress: '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7', // USDM MegaETH
  amount: '100',           // decimal human amount (100 USDC)
  srcTokenDecimals: 6,     // required for string/number `amount`
  // or: amount: 100_000_000n   // bigint = raw on-chain units (no decimals needed)
  srcWalletAddress: '0xYourAddress',
});

console.log(`Order ${quote.orderHash}: ${quote.inputAmount} -> ${quote.outputAmount}`);

// 2. Execute (chain-switch + approval + sign + submit, or native deposit)
const result = await sdk.executeSwap({
  quote,
  walletClient,
  onStep: (step) => console.log('step:', step),
  onTxHash: (hash, kind) => console.log(`${kind} tx: ${hash}`),
});

console.log(`Submitted ${result.orderHash}, tx hashes:`, result.txHashes);

// 3. Track status to terminal state
const finalStatus = await sdk.pollStatus(result.orderHash, {
  onStatusChange: (s) => console.log('status:', s.status),
});

console.log('done:', finalStatus.status);
```

### What `executeSwap` does

Aori has two settlement paths, selected automatically from the quote:

| Quote kind    | Action                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ERC20         | Chain-switches the wallet, ensures the Aori settlement contract is approved (allowance / USDT-style reset / `maxUint256`), signs the EIP-712 order, then `POST /swap`. |
| native (ETH)  | Chain-switches the wallet, then sends the deposit transaction (`depositNative`) to the Aori contract.                                                          |

You get back `{ orderHash, signature?, txHashes, isNativeDeposit, depositChainBlockTimeMs }`. If `isNativeDeposit`, wait `2 * depositChainBlockTimeMs` before the first `pollStatus` call (or just use `bridge()`, which does this for you).

## Using ethers v6 as an integrator-side adapter

If your codebase is already on ethers and you don't want to import viem in your wallet-construction code, the SDK ships a small adapter at `usdm-bridge-sdk/ethers`:

```ts
import { UsdmBridgeSdk } from 'usdm-bridge-sdk';
import { ethersSignerToWalletClient } from 'usdm-bridge-sdk/ethers';
import { BrowserProvider } from 'ethers';

const sdk = new UsdmBridgeSdk(usdmBridgeConfig);

const provider = new BrowserProvider(window.ethereum!, 'any');
const signer = await provider.getSigner();
const walletClient = await ethersSignerToWalletClient(signer);

const quote = await sdk.getQuote(/* ... */);
await sdk.executeSwap({ quote, walletClient });
```

A working end-to-end React example is in [`examples/react-6963-ethers/`](../examples/react-6963-ethers/) — same UI as `react-6963`, but with zero `viem` imports in user code. `viem` is still the SDK's internal runtime regardless of which adapter you use.

## Status tracking only

If you've already submitted via your own pipeline and just want polling:

```ts
import { UsdmBridgeSdk } from 'usdm-bridge-sdk';

const sdk = new UsdmBridgeSdk({ aoriApiBaseUrl: '/api/aori' });

const status = await sdk.pollStatus(orderHash, {
  interval: 4000,
  timeout: 300_000,
  onStatusChange: (s) => console.log(s.status),
  onSuccess: (s) => console.log('settled'),
  onFailure: (s) => console.warn('did not settle:', s.status),
  onSettled: (s) => console.log('terminal:', s.status),
  // onComplete: (s) => …  ← legacy alias of onSettled, fires for any terminal state
});
```

Terminal statuses: `completed` (success), `failed`, `cancelled` (failure). The semantic hooks (`onSuccess` / `onFailure` / `onSettled`) are awaited before `pollStatus` resolves; throws inside them reject the promise. Helpers `isSuccessStatus`, `isFailureStatus`, and `isTerminalStatus` are exported if you want to classify a status string yourself.

## Aggregation (multiple venues)

The SDK can request quotes from **multiple venues** in parallel and let you pick
the best one — starting with **Aori** and **[Relay](https://docs.relay.link)**.
This is fully additive: with no `venues` config the SDK behaves exactly as
before (Aori only), and the single-quote methods (`getQuote`, `executeSwap`,
`bridge`, …) are unchanged.

### Enable venues

```ts
import { UsdmBridgeSdk } from 'usdm-bridge-sdk';

const sdk = new UsdmBridgeSdk({
  aoriApiBaseUrl: '/api/aori',
  venues: {
    aori: { enabled: true },                 // enabled by default; listed for clarity
    relay: { apiBaseUrl: '/api/relay' },     // proxy like Aori; `apiKey` optional
  },
  aggregation: {
    perVenueTimeoutMs: 7000,   // each venue is aborted after this window
    overallDeadlineMs: 9000,   // resolve with whatever arrived by this deadline
    // compareQuotes: (a, b) => …  // custom ranking; default = highest gross output
  },
});
```

Relay's API key is optional and proxy-able exactly like Aori's: set
`venues.relay.apiBaseUrl` to a server route and the client stops sending the key
(your proxy injects it).

### Get quotes from every venue

`getQuotes` fans out to all configured venues under bounded per-venue timeouts
and an overall deadline. It **always resolves with partial results** — a slow or
failing venue never blocks the others. Quotes come back sorted best-first (by
default: highest gross destination output, tie-broken by faster ETA).

```ts
const { quotes, errors } = await sdk.getQuotes(
  {
    srcChainId: 1,
    dstChainId: 4326,
    srcTokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC Ethereum
    dstTokenAddress: '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7', // USDM MegaETH
    amount: '100',
    srcTokenDecimals: 6,
    srcWalletAddress: '0xYourAddress',
  },
  {
    onQuote: (q) => console.log(`${q.venue}: ${q.outputAmount}`), // streamed as they arrive
  },
);

for (const q of quotes) {
  console.log(`${q.venue}  out=${q.outputAmount}  eta=${q.estimatedTimeSec}s`);
}
for (const e of errors) {
  console.warn(`${e.venue} failed: ${e.error.message}`);
}
```

`getBestQuote(input, opts)` is a convenience that returns `quotes[0]` and throws
`NoQuotesError` (carrying the per-venue errors) if nothing came back.

### Execute a selected quote

Each `NormalizedQuote` carries its originating `venue`. `executeQuote` /
`bridgeQuote` dispatch to the correct venue adapter automatically — Aori (RFQ)
and Relay (step machine) execution both surface the same normalized progress
steps and status.

```ts
const best = await sdk.getBestQuote(input);

const result = await sdk.bridgeQuote(best, {
  walletClient,
  onStep:         (step)   => console.log('step:', step.kind),
  onStatusChange: (status) => console.log('status:', status.status),
  onSuccess:      (r)      => console.log('settled:', r.txHash),
});

console.log(result.outcome); // 'success' | 'failure'
```

The normalized `QuoteExecutionStep` kinds are venue-agnostic
(`chain-switch`, `approval-sent`, `transaction-sent`, `signing`, `submitted`,
`done`), and `AggregatedStatus.status` is one of
`pending | received | completed | failed | cancelled`.

### Notes & assumptions

- **Comparator** assumes all quotes for a request share the same output
  token/decimals (true for the USDM use case). Provide `aggregation.compareQuotes`
  (or `opts.compareQuotes`) to override. `byGrossOutputDesc` is exported.
- **Native** currency is normalized to `0x0000…0000` for Relay; Aori uses its own
  native detection. Pass either the zero address or the Aori sentinel.
- **USD / fee / price-impact** fields are populated when the venue provides them
  (Relay does; Aori may not) — render them conditionally.

## Token registry & custom token sources

`getTokenRegistry()` returns venue-aggregated token metadata (+ prices where a
source can supply them), deduped by `chainId + address`. `getTokenPrice()`
resolves a single token's USD price by asking each source in priority order.

```ts
const tokens = await sdk.getTokenRegistry({ chainId: 8453 }); // TokenMetadata[]
const price = await sdk.getTokenPrice({ chainId: 8453, address: '0x…' }); // number | null
```

Built-in sources are the configured **venues** that can enumerate tokens (Aori,
Relay). Integrators can add their **own** token sources — their token API, a
hosted token-list JSON, or a static array — via `config.tokens.sources`, without
having to stand up a new quote venue.

```ts
import { UsdmBridgeSdk, type TokenMetadata } from 'usdm-bridge-sdk';

const sdk = new UsdmBridgeSdk({
  tokens: {
    sources: [
      // 1. Bring your own token API (primary pattern — POST/search-shaped, like
      //    Relay's own `useTokenList`). Mark `searchable: true` when your API
      //    searches server-side so the widget routes search-as-you-type to it.
      {
        id: 'my-token-api',
        type: 'custom',
        searchable: true,
        getTokens: async ({ chainId, term, signal }) => {
          const res = await fetch('https://tokens.example.com/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chainId, term }),
            ...(signal ? { signal } : {}),
          });
          return (await res.json()) as TokenMetadata[];
        },
        getTokenPrice: async ({ chainId, address }) => {
          // return a USD unit price, or null
          return null;
        },
      },
      // 2. Hosted Uniswap-standard token list (or a raw TokenMetadata[]). GET only.
      { id: 'my-list', type: 'tokenlist', url: 'https://tokens.example.com/list.json' },
      // 3. Inline static array.
      { id: 'house-tokens', type: 'static', tokens: [/* TokenMetadata[] */] },
    ],
    // First id wins identity on collisions; later sources only fill gaps.
    sourcePriority: ['my-token-api', 'aori', 'relay'],
    // Set true to show ONLY your sources' tokens (drop venue-derived tokens).
    replaceVenueTokens: false,
  },
});
```

Notes:
- `TokenMetadata` shape: `{ chainId, address, symbol, name, decimals, logoURI?, price?, verified?, source? }`.
- `type: 'custom'` receives the same `GetTokensParams` venues get: `chainId`,
  `term`, `verifiedOnly`, `limit`, `defaultList`, `tokens` (`"chainId:address"`),
  `useExternalSearch`, `signal`. Honor what you can; ignore the rest.
- A token from a custom source is **not** automatically quotable — it only shows
  in the picker. It's quotable only if a real venue (Aori/Relay) also supports
  the pair.
- **Relay endpoint gotcha:** use the public API `https://api.relay.link`
  (`POST /currencies/v2`). `https://relay.link/api/relay/...` is Relay's own
  website proxy and will return `403 Forbidden` for third parties.

## Server-side proxying

In production, keep your Aori API key and any private RPC URLs off the client.

### API proxy (`aoriApiBaseUrl`)

Point `aoriApiBaseUrl` at your own backend route. The SDK sends every quote/swap/status request there instead of directly to Aori. When `aoriApiBaseUrl` is set, the SDK stops sending `apiKey` from the client — your proxy injects it.

```ts
new UsdmBridgeSdk({ aoriApiBaseUrl: '/api/aori' /* no apiKey needed */ });
```

Your backend forwards to `https://api.aori.io` with the real `x-api-key` injected from env vars. See [`examples/privy-next-serverless/`](../examples/privy-next-serverless/) for a complete Next.js proxy route.

### RPC proxy (`rpcOverrides`)

The SDK uses public RPCs by default for ERC20 allowance reads, receipt waits, and the Chainalysis sanctions oracle. Override per-chain:

```ts
new UsdmBridgeSdk({
  rpcOverrides: {
    1: '/api/rpc/1',
    4326: '/api/rpc/4326',
  },
});
```

This is independent of whatever your wallet provider uses for signing/sending — the SDK only uses these for read-side calls.

## Low-level primitives

When you want full control over the orchestration, import the standalone helpers and skip `executeSwap`:

```ts
import {
  UsdmBridgeSdk,
  ChainSwitch,
  ensureApproval,
  signOrder,
  submitSwap,
  pollOrderStatus,
  getAoriClient,
  SdkEnvironment,
} from 'usdm-bridge-sdk';

const env = new SdkEnvironment({ aoriApiBaseUrl: '/api/aori' });
const aori = await getAoriClient(env);

// ERC20 path
await ensureApproval({
  tokenAddress: quote.inputToken,
  spender: aori.getChain(quote.inputChain)!.address,
  amount: BigInt(quote.inputAmount),
  ownerAddress,
  chainId,
  walletClient,
  env,
});
const { orderHash, signature } = await signOrder({ quote, walletClient, userAddress: ownerAddress, aori });
await submitSwap({ orderHash, signature }, aori);

await pollOrderStatus(orderHash, aori, { onStatusChange: (s) => console.log(s.status) });
```

## Supported chains

Built-in chain registry (extend via `rpcOverrides`):

| Chain ID | Key       |
| -------- | --------- |
| 1        | ethereum  |
| 10       | optimism  |
| 30       | rootstock |
| 56       | bsc       |
| 143      | monad     |
| 988      | stable    |
| 4326     | megaeth   |
| 8453     | base      |
| 9745     | plasma    |
| 42161    | arbitrum  |

## License

MIT
