'use client';

import type { AdaptedWallet } from 'usdm-bridge-sdk';
import React, { createContext, useContext } from 'react';

const SolanaWalletCtx = createContext<AdaptedWallet | null>(null);

export function useSolanaWallet(): AdaptedWallet | null {
  return useContext(SolanaWalletCtx);
}

export function SolanaWalletProvider({
  wallet,
  children,
}: {
  wallet: AdaptedWallet | null;
  children: React.ReactNode;
}) {
  return <SolanaWalletCtx.Provider value={wallet}>{children}</SolanaWalletCtx.Provider>;
}
