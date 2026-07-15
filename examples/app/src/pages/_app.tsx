import '../globals.css';
import '@rainbow-me/rainbowkit/styles.css';
import 'usdm-bridge-widget/styles.css';
import type { AppProps } from 'next/app';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WalletScreeningProvider } from 'usdm-bridge-widget';

import { config } from '../wagmi';
import { aoriConfig } from '../../aori.config';
import { ScreeningLogProvider, useScreeningLog } from '../screeningLog';

const client = new QueryClient();

function ScreenedApp({ Component, pageProps }: AppProps) {
  const { addEntry } = useScreeningLog();
  return (
    <WalletScreeningProvider
      config={aoriConfig.walletScreening}
      onBlockedWallet={({ address, allowed, source }) =>
        addEntry({
          address,
          source: source ?? null,
          result: allowed ? 'allowed' : 'blocked',
          timestamp: Date.now(),
        })
      }
    >
      <Component {...pageProps} />
    </WalletScreeningProvider>
  );
}

function MyApp(props: AppProps) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={client}>
        <RainbowKitProvider>
          <ScreeningLogProvider>
            <ScreenedApp {...props} />
          </ScreeningLogProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default MyApp;
