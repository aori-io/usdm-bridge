'use client';

import { useWalletModal } from './WalletModalContext';
import { useWalletState } from './useWalletState';

export function ConnectButton() {
  const { openConnectModal } = useWalletModal();
  const { isConnected, address } = useWalletState();

  const label = isConnected && address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : 'Connect';

  return (
    <button
      type="button"
      onClick={() => openConnectModal()}
      className="h-8 cursor-pointer px-3 text-xs font-bold uppercase tracking-wide transition-colors duration-150 border border-border rounded-sm bg-card text-foreground hover:bg-secondary hover:border-foreground/20"
    >
      {label}
    </button>
  );
}
