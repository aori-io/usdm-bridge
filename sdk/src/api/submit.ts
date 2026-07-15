import type { Aori, SwapRequest, SwapResponse } from '@aori/aori-ts';

export interface SubmitSwapParams {
  orderHash: string;
  signature: string;
}

/**
 * Submits a signed ERC20 order to the Aori API (`POST /swap`) for settlement.
 * Returns the Aori `SwapResponse`. Throws when the API returns an error.
 */
export async function submitSwap(
  params: SubmitSwapParams,
  aori: Aori,
  options?: { signal?: AbortSignal },
): Promise<SwapResponse> {
  const request: SwapRequest = {
    orderHash: params.orderHash,
    signature: params.signature,
  };
  return aori.submitSwap(request, options);
}
