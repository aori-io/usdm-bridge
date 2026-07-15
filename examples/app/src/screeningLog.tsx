import React, { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { BlockedWalletEvent } from 'usdm-bridge-widget';

export interface ScreeningLogEntry {
  address: string;
  source: BlockedWalletEvent['source'] | null;
  result: 'allowed' | 'blocked';
  timestamp: number;
}

interface ScreeningLogContextValue {
  log: ScreeningLogEntry[];
  addEntry: (entry: ScreeningLogEntry) => void;
}

const ScreeningLogContext = createContext<ScreeningLogContextValue | null>(null);

/**
 * Holds the screening-log history so the panel keeps working with the
 * `WalletScreeningProvider` hoisted to `_app.tsx` (its `onBlockedWallet` feeds
 * this store; the page reads it via `useScreeningLog`).
 */
export function ScreeningLogProvider({ children }: { children: ReactNode }) {
  const [log, setLog] = useState<ScreeningLogEntry[]>([]);
  const addEntry = useCallback((entry: ScreeningLogEntry) => {
    setLog((prev) => [entry, ...prev]);
  }, []);
  return <ScreeningLogContext.Provider value={{ log, addEntry }}>{children}</ScreeningLogContext.Provider>;
}

export function useScreeningLog(): ScreeningLogContextValue {
  return useContext(ScreeningLogContext) ?? { log: [], addEntry: () => {} };
}
