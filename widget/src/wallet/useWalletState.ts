'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';

function useClientMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

export function useWalletState() {
  const mounted = useClientMounted();
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();

  return {
    mounted,
    address,
    isConnected,
    isLoading: isConnecting || isReconnecting,
  };
}
