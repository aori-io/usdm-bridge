import type { PaginatedOrdersResponse, SearchOrdersResponse } from './types';

export function transformPaginatedResponse(
  _response: unknown,
  _isFirstPage: boolean,
  _options?: { skipNativeDepositFilter?: boolean; pageSize?: number },
): PaginatedOrdersResponse {
  return {
    events: [],
    totalEvents: 0,
    pagination: { totalRecords: 0, page: 0, limit: 0 },
    hasMore: false,
  };
}

export function transformSearchResponse(_response: unknown): SearchOrdersResponse {
  return { events: [], totalEvents: 0 };
}
