import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';

const SOLANA_RPC_PROXY_PATH = '/api/rpc/solana';

/**
 * Solana's `Connection` rejects relative URLs (unlike wagmi's `http()`
 * transport), so the proxy path is resolved against the current origin in the
 * browser. During SSR there is no origin to resolve against; Solana reads only
 * happen client-side, so the public endpoint is a never-used placeholder that
 * satisfies the absolute-URL requirement.
 */
export function getSolanaRpcEndpoint(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${SOLANA_RPC_PROXY_PATH}`;
  }
  return 'https://api.mainnet-beta.solana.com';
}

export const SOLANA_WALLETS = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
];
