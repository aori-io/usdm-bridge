export function parseExplorerHash(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/');
    const last = parts[parts.length - 1];
    return last && last.startsWith('0x') ? last : null;
  } catch {
    return null;
  }
}

export interface AoriOrderDetails {
  orderHash: string;
  offerer: string;
  recipient: string;
  inputToken: string;
  inputAmount: string;
  inputChain: string;
  inputTokenValueUsd: string;
  outputToken: string;
  outputAmount: string;
  outputChain: string;
  outputTokenValueUsd: string;
  startTime: number;
  endTime: number;
  timestamp: number;
  srcTx: string | null;
  dstTx: string | null;
  events: Array<{
    event: string;
    timestamp: number;
  }>;
}

export interface SwapCompleteData {
  quoteId: string;
  aoriOrderHash: string;
  explorerUrl: string;
  details: AoriOrderDetails;
}
