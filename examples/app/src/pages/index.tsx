import { ConnectButton, useConnectModal, useAccountModal } from '@rainbow-me/rainbowkit';
import type { NextPage } from 'next';
import { SwapWidget } from 'usdm-bridge-widget';
import { aoriConfig } from '../../aori.config';

const Home: NextPage = () => {
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();

  return (
    <div className="w-screen h-screen bg-[#19191A] flex flex-col">
      <div className="flex flex-row items-center justify-end p-8">
        <ConnectButton chainStatus="none" showBalance={false} />
      </div>
      <div id="widget-container" className="w-full flex-1 flex justify-center items-center">
        <div className="w-96 flex justify-center items-center">
          <SwapWidget
            config={aoriConfig}
            customWalletUI="provider"
            onRequestConnect={() => openConnectModal?.()}
            onRequestAccount={() => openAccountModal?.()}
          />
        </div>
      </div>
    </div>
  );
};

export default Home;
