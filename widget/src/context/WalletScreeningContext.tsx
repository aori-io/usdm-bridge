'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAccount } from 'wagmi';
import {
  screenWallet,
  type ScreeningResult,
  type WalletScreeningConfig,
} from '../lib/walletScreening';

type ScreeningStatus = 'idle' | 'checking' | 'allowed' | 'blocked';
type ScreeningSource = NonNullable<ScreeningResult['source']>;

export interface WalletScreeningState {
  status: ScreeningStatus;
  isBlocked: boolean;
  /** The lowercased wallet address that was screened, or null if no wallet connected. */
  address: string | null;
  /** Which check flagged the address, or null if allowed/idle/checking. */
  source: ScreeningSource | null;
}

const DEFAULT_STATE: WalletScreeningState = {
  status: 'idle',
  isBlocked: false,
  address: null,
  source: null,
};

const WalletScreeningContext = createContext<WalletScreeningState>(DEFAULT_STATE);

// Marker context used to detect a parent <WalletScreeningProvider>. When an outer
// provider exists, any nested provider becomes a pass-through so the integrator's
// app-wide screening config wins and onBlockedWallet doesn't fire twice.
const HasOuterScreeningProvider = createContext(false);

export interface BlockedWalletEvent {
  address: string;
  allowed: boolean;
  source?: ScreeningSource;
}

interface WalletScreeningProviderProps {
  config?: WalletScreeningConfig;
  onBlockedWallet?: (data: BlockedWalletEvent) => void;
  children: ReactNode;
}

// Module-level cache keyed by lowercased address. Survives provider unmount/remount
// (e.g. integrator tab-switching that unmounts the widget subtree) so we don't
// re-hit Chainalysis oracle / screeningUrl every time the user toggles tabs.
// In-flight promises are also stored here for cross-mount + same-mount dedup.
type CacheEntry =
  | { kind: 'pending'; promise: Promise<ScreeningResult>; expiresAt: number }
  | { kind: 'resolved'; result: ScreeningResult; expiresAt: number };

const SCREENING_TTL_MS = 1 * 60 * 60 * 1000; // 1 hour
const screeningCache = new Map<string, CacheEntry>();

function getOrStartScreening(
  address: string,
  config: WalletScreeningConfig | undefined,
): Promise<ScreeningResult> {
  const key = address.toLowerCase();
  const now = Date.now();
  const cached = screeningCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.kind === 'pending' ? cached.promise : Promise.resolve(cached.result);
  }
  const promise = screenWallet(address, config).then((result) => {
    screeningCache.set(key, {
      kind: 'resolved',
      result,
      expiresAt: Date.now() + SCREENING_TTL_MS,
    });
    return result;
  }).catch((err) => {
    screeningCache.delete(key);
    throw err;
  });
  screeningCache.set(key, {
    kind: 'pending',
    promise,
    expiresAt: now + SCREENING_TTL_MS,
  });
  return promise;
}

export function WalletScreeningProvider({
  config,
  onBlockedWallet,
  children,
}: WalletScreeningProviderProps) {
  // If a parent <WalletScreeningProvider> already exists, this nested instance
  // becomes a pass-through. The outer provider's config and onBlockedWallet
  // win; props passed here are ignored.
  if (useContext(HasOuterScreeningProvider)) {
    return <>{children}</>;
  }

  return (
    <ScreeningProviderImpl config={config} onBlockedWallet={onBlockedWallet}>
      {children}
    </ScreeningProviderImpl>
  );
}

function ScreeningProviderImpl({
  config,
  onBlockedWallet,
  children,
}: WalletScreeningProviderProps) {
  const { address } = useAccount();
  const [state, setState] = useState<WalletScreeningState>(DEFAULT_STATE);

  // Hold callback in a ref so an unstable (inline) onBlockedWallet from the
  // integrator does not invalidate the effect on every parent re-render.
  const onBlockedWalletRef = useRef(onBlockedWallet);
  useEffect(() => {
    onBlockedWalletRef.current = onBlockedWallet;
  }, [onBlockedWallet]);

  // Same for config — integrators commonly inline the config object. We only
  // care about `enabled` for the synchronous bail-out; the rest is consumed
  // inside the screener via the ref so a new reference doesn't refire.
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  const enabled = config?.enabled !== false;

  const lowerAddress = address?.toLowerCase() ?? null;

  useEffect(() => {
    if (!lowerAddress) {
      setState(DEFAULT_STATE);
      return;
    }
    if (!enabled) {
      setState({
        status: 'allowed',
        isBlocked: false,
        address: lowerAddress,
        source: null,
      });
      return;
    }

    let cancelled = false;
    setState({
      status: 'checking',
      isBlocked: false,
      address: lowerAddress,
      source: null,
    });

    getOrStartScreening(lowerAddress, configRef.current)
      .then((result) => {
        if (cancelled) return;
        setState({
          status: result.allowed ? 'allowed' : 'blocked',
          isBlocked: !result.allowed,
          address: lowerAddress,
          source: result.source ?? null,
        });
        onBlockedWalletRef.current?.({
          address: lowerAddress,
          allowed: result.allowed,
          source: result.source,
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Fail open — don't block users due to infra problems.
        setState({
          status: 'allowed',
          isBlocked: false,
          address: lowerAddress,
          source: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [lowerAddress, enabled]);

  // No useMemo needed — `state` already has stable identity within a render,
  // and a new object is only created when setState fires (i.e. when consumers
  // genuinely need to re-render).
  return (
    <HasOuterScreeningProvider.Provider value={true}>
      <WalletScreeningContext.Provider value={state}>
        {children}
      </WalletScreeningContext.Provider>
    </HasOuterScreeningProvider.Provider>
  );
}

export function useWalletScreening(): WalletScreeningState {
  return useContext(WalletScreeningContext);
}
