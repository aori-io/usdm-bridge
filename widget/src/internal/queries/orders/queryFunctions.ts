import type { GetNotificationsParams } from '../../types';
import type { PaginatedOrdersResponse } from './types';

export async function fetchOrdersPaginated(
  _params: GetNotificationsParams & { skipNativeDepositFilter?: boolean },
  _options?: { pageSize?: number; signal?: AbortSignal },
): Promise<PaginatedOrdersResponse> {
  return {
    events: [],
    totalEvents: 0,
    pagination: { totalRecords: 0, page: 0, limit: 0 },
    hasMore: false,
  };
}
