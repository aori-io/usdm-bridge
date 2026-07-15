import type { GetNotificationsParams } from '../../types';

export const orderKeys = {
  all: ['orders'] as const,
  paginated: (params: GetNotificationsParams) => [...orderKeys.all, 'paginated', params] as const,
  infinite: (params: Omit<GetNotificationsParams, 'page'>) => [...orderKeys.all, 'infinite', params] as const,
  search: (params: { offerer?: string; recipient?: string; orderHash?: string }) => [...orderKeys.all, 'search', params] as const,
  details: (orderHash: string) => [...orderKeys.all, 'details', orderHash] as const,
  scannerTx: (txHash: string) => [...orderKeys.all, 'scannerTx', txHash] as const,
};
