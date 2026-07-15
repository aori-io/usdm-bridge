'use client';

import type { Aori } from '@aori/aori-ts';
import { createContext, useContext, useEffect, useState } from 'react';
import { getAoriClient } from './aoriClient';

const AoriClientContext = createContext<Aori | null>(null);

/** Returns the resolved Aori SDK client, or null until it has initialized. */
export const useAori = (): Aori | null => useContext(AoriClientContext);

export const AoriContext = AoriClientContext;

export const AoriClientProvider = ({ children }: { children: React.ReactNode }) => {
  const [client, setClient] = useState<Aori | null>(null);

  useEffect(() => {
    let active = true;
    getAoriClient()
      .then((c) => {
        if (active) setClient(c);
      })
      .catch(() => {
        /* surfaced by the consuming flow when aori is null */
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AoriClientContext.Provider value={client}>{children}</AoriClientContext.Provider>
  );
};
