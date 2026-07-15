'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { type WidgetTheme, defaultDarkTheme } from './types';

const WidgetThemeContext = createContext<WidgetTheme>(defaultDarkTheme);

interface WidgetThemeProviderProps {
  theme: WidgetTheme;
  children: ReactNode;
}

export function WidgetThemeProvider({ theme, children }: WidgetThemeProviderProps) {
  return (
    <WidgetThemeContext.Provider value={theme}>
      {children}
    </WidgetThemeContext.Provider>
  );
}

export function useWidgetTheme() {
  return useContext(WidgetThemeContext);
}
