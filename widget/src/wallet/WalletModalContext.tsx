'use client';

import { createContext, useContext } from 'react';

interface WalletModalContextValue {
  openConnectModal: () => void;
  openAccountModal?: () => void;
}

export const WalletModalContext = createContext<WalletModalContextValue>({
  openConnectModal: () => {},
});

export const useWalletModal = () => useContext(WalletModalContext);
