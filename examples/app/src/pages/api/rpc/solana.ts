import type { NextApiRequest, NextApiResponse } from 'next';

const DEFAULT_SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

function getSolanaRpcUrl(): string {
  return process.env.SOLANA_RPC_URL || DEFAULT_SOLANA_RPC;
}

async function fetchWithRetry(url: string, body: unknown, retries = 3): Promise<unknown> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
    }
  }
  throw new Error('Max retries exceeded');
}

function jsonRpcError(res: NextApiResponse, id: unknown, code: number, message: string) {
  return res.status(200).json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rpcUrl = getSolanaRpcUrl();

  try {
    const data = await fetchWithRetry(rpcUrl, req.body, 3);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data);
  } catch (error) {
    console.error('Solana RPC proxy error:', error);
    return jsonRpcError(res, null, -32603, error instanceof Error ? error.message : 'RPC request failed');
  }
}
