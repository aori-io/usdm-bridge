'use client';

import { createContext, useContext } from 'react';

export const TransactionRegistryContext = createContext<{
  registerTransaction: (hash: string, description: string) => void;
  enabled: boolean;
}>({
  registerTransaction: () => {},
  enabled: false,
});

export const useTransactionRegistry = () => useContext(TransactionRegistryContext);
