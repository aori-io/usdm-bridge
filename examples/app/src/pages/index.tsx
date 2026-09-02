import { ConnectButton, useConnectModal, useAccountModal } from '@rainbow-me/rainbowkit';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import type { NextPage } from 'next';
import { SwapWidget } from 'usdm-bridge-widget';
import { aoriConfig } from '../../aori.config';
import { useAdaptedSolanaWallet } from '../hooks/useAdaptedSolanaWallet';

const Home: NextPage = () => {
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const solanaWallet = useAdaptedSolanaWallet();

  return (
    <div className="w-screen h-screen bg-[#19191A] flex flex-col">
      <div className="flex flex-row items-center justify-end gap-3 p-8">
        <WalletMultiButton />
        <ConnectButton chainStatus="none" showBalance={false} />
      </div>
      <div id="widget-container" className="w-full flex-1 flex justify-center items-center">
        <div className="w-96 flex justify-center items-center">
          <SwapWidget
            config={aoriConfig}
            customWalletUI="provider"
            solanaWallet={solanaWallet}
            onRequestConnect={() => openConnectModal?.()}
            onRequestAccount={() => openAccountModal?.()}
          />
        </div>
      </div>
    </div>
  );
};

export default Home;
