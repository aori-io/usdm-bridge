import { useMemo } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { adaptSolanaWallet } from '@relayprotocol/relay-svm-wallet-adapter';
import { createClient, MAINNET_RELAY_API } from '@relayprotocol/relay-sdk';
import type { AdaptedWallet } from 'usdm-bridge-sdk';

const SOLANA_CHAIN_ID = 792703809;

// The SVM adapter calls `getClient().log(...)` after broadcasting, and that
// singleton is only populated by `createClient`. usdm-bridge-sdk drives the
// Relay REST API itself and never creates one, so without this the transaction
// would be signed and sent and *then* throw on an undefined client.
createClient({ baseApiUrl: MAINNET_RELAY_API, source: 'usdm-bridge-app-example' });

/**
 * Returns a Relay-compatible adapted Solana wallet when one is connected, or
 * `null` otherwise. Memoized so the reference is stable across renders.
 */
export function useAdaptedSolanaWallet(): AdaptedWallet | null {
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();

  return useMemo(() => {
    if (!connected || !publicKey || !connection) return null;

    const walletAddress = publicKey.toBase58();

    return adaptSolanaWallet(
      walletAddress,
      SOLANA_CHAIN_ID,
      connection,
      async (tx) => {
        const signature = await sendTransaction(tx, connection);
        return { signature };
      },
    ) as AdaptedWallet;
  }, [connected, publicKey, connection, sendTransaction]);
}
