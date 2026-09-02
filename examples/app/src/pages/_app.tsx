import '../globals.css';
import '@rainbow-me/rainbowkit/styles.css';
import '@solana/wallet-adapter-react-ui/styles.css';
import 'usdm-bridge-widget/styles.css';
import type { AppProps } from 'next/app';

import { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletScreeningProvider } from 'usdm-bridge-widget';

import { config } from '../wagmi';
import { aoriConfig } from '../../aori.config';
import { getSolanaRpcEndpoint, SOLANA_WALLETS } from '../solana';
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
  const solanaEndpoint = useMemo(() => getSolanaRpcEndpoint(), []);
  return (
    <ConnectionProvider endpoint={solanaEndpoint}>
      <WalletProvider wallets={SOLANA_WALLETS} autoConnect>
        <WagmiProvider config={config}>
          <QueryClientProvider client={client}>
            <RainbowKitProvider>
              <ScreeningLogProvider>
                <ScreenedApp {...props} />
              </ScreeningLogProvider>
            </RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default MyApp;
