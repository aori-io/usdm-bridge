'use client';

import { useMemo } from 'react';
import { useTokenWithFallback } from '../queries/tokens/hooks';
import type { Asset } from '../types';

export interface UseTokenWithLazyLoadResult {
  token: Asset | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function useTokenWithLazyLoad(
  chainId: number | undefined,
  address: string | undefined,
): UseTokenWithLazyLoadResult {
  const isValidInput = useMemo(() => {
    return (
      chainId !== undefined &&
      typeof chainId === 'number' &&
      !Number.isNaN(chainId) &&
      address !== undefined &&
      typeof address === 'string' &&
      address.length >= 10
    );
  }, [chainId, address]);

  const { token, isLoading, isError } = useTokenWithFallback(
    isValidInput ? address : null,
    isValidInput ? chainId : null,
  );

  if (!isValidInput) {
    return { token: undefined, isLoading: false, isError: true };
  }

  return { token, isLoading, isError };
}
