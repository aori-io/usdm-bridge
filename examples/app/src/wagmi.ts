import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { wagmiChains, buildTransports } from 'usdm-bridge-widget';
import { aoriConfig } from '../aori.config';

const wagmiConfig = getDefaultConfig({
  appName: 'MegaETH Rabbithole',
  projectId: 'b56e18d47c72ab683b10814fe9495694',
  chains: wagmiChains,
  // Route wagmi's RPC through the same proxy overrides as the widget so private
  // RPC URLs stay server-side (matches the reference integration).
  transports: buildTransports(aoriConfig.rpcOverrides),
  ssr: false,
});

export const config = wagmiConfig;
