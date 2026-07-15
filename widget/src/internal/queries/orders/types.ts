import type { GetNotificationsParams } from '../../types';

export type { GetNotificationsParams };

export interface OrderQueryResult {
  orderHash?: string;
  [key: string]: unknown;
}

export type QueryOrdersParams = Record<string, unknown>;

export interface PaginatedOrdersResponse {
  events: OrderQueryResult[];
  totalEvents: number;
  pagination: { totalRecords: number; page: number; limit: number };
  hasMore: boolean;
}

export interface SearchOrdersResponse {
  events: OrderQueryResult[];
  totalEvents: number;
}

export interface ExtendedQueryOrdersParams {
  sortBy?: string;
  minValue?: string;
  maxValue?: string;
  minTime?: number;
  maxTime?: number;
  status?: string;
  offerer?: string;
  inputChain?: string;
  outputChain?: string;
  inputToken?: string;
  outputToken?: string;
  page?: number;
  limit?: number;
  recipient?: string;
}
