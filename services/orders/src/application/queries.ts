import { z } from 'zod';
import type { Result } from '@graphql-microservices/shared-type-utils';
import type {
  Amount,
  OrderFilter,
  OrderId,
  OrderItem,
  OrderNumber,
  OrderSort,
  OrderStatus,
  Pagination,
  PaymentInfo,
  ShippingAddress,
  ShippingInfo,
  UserId,
} from './types';

/**
 * Query type literals
 */
export const QueryType = {
  GET_ORDER_BY_ID: 'GetOrderById',
  GET_ORDER_BY_NUMBER: 'GetOrderByNumber',
  GET_ORDERS_BY_USER: 'GetOrdersByUser',
  GET_ALL_ORDERS: 'GetAllOrders',
  GET_ORDERS_BY_STATUS: 'GetOrdersByStatus',
  GET_ORDERS_BY_DATE_RANGE: 'GetOrdersByDateRange',
  GET_ORDER_STATISTICS: 'GetOrderStatistics',
  GET_USER_ORDER_HISTORY: 'GetUserOrderHistory',
  SEARCH_ORDERS: 'SearchOrders',
  GET_PENDING_ORDERS: 'GetPendingOrders',
  GET_ORDERS_TO_SHIP: 'GetOrdersToShip',
} as const;

export type QueryType = (typeof QueryType)[keyof typeof QueryType];

/**
 * Query payloads
 */
export interface GetOrderByIdPayload {
  orderId: OrderId;
}

export interface GetOrderByNumberPayload {
  orderNumber: OrderNumber;
}

export interface GetOrdersByUserPayload {
  userId: UserId;
  filter?: Omit<OrderFilter, 'userId'>;
  pagination?: Pagination;
  sorting?: OrderSort;
}

export interface GetAllOrdersPayload {
  filter?: OrderFilter;
  pagination?: Pagination;
  sorting?: OrderSort;
}

export interface GetOrdersByStatusPayload {
  status: OrderStatus;
  filter?: Omit<OrderFilter, 'status'>;
  pagination?: Pagination;
  sorting?: OrderSort;
}

export interface GetOrdersByDateRangePayload {
  fromDate: Date;
  toDate: Date;
  filter?: OrderFilter;
  pagination?: Pagination;
  sorting?: OrderSort;
}

export interface GetOrderStatisticsPayload {
  userId?: UserId;
  fromDate?: Date;
  toDate?: Date;
}

export interface GetUserOrderHistoryPayload {
  userId: UserId;
  limit?: number;
  includeDetails?: boolean;
}

export interface SearchOrdersPayload {
  searchTerm: string;
  searchFields?: Array<'orderNumber' | 'customerName' | 'productName' | 'trackingNumber'>;
  filter?: OrderFilter;
  pagination?: Pagination;
}

export interface GetPendingOrdersPayload {
  olderThan?: Date;
  pagination?: Pagination;
}

export interface GetOrdersToShipPayload {
  includeDelayed?: boolean;
  pagination?: Pagination;
}

/**
 * Base query structure
 */
export interface BaseQuery<TType extends QueryType, TPayload> {
  readonly type: TType;
  readonly payload: TPayload;
}

/**
 * Query type definitions using discriminated unions
 */
export type GetOrderByIdQuery = BaseQuery<typeof QueryType.GET_ORDER_BY_ID, GetOrderByIdPayload>;
export type GetOrderByNumberQuery = BaseQuery<
  typeof QueryType.GET_ORDER_BY_NUMBER,
  GetOrderByNumberPayload
>;
export type GetOrdersByUserQuery = BaseQuery<
  typeof QueryType.GET_ORDERS_BY_USER,
  GetOrdersByUserPayload
>;
export type GetAllOrdersQuery = BaseQuery<typeof QueryType.GET_ALL_ORDERS, GetAllOrdersPayload>;
export type GetOrdersByStatusQuery = BaseQuery<
  typeof QueryType.GET_ORDERS_BY_STATUS,
  GetOrdersByStatusPayload
>;
export type GetOrdersByDateRangeQuery = BaseQuery<
  typeof QueryType.GET_ORDERS_BY_DATE_RANGE,
  GetOrdersByDateRangePayload
>;
export type GetOrderStatisticsQuery = BaseQuery<
  typeof QueryType.GET_ORDER_STATISTICS,
  GetOrderStatisticsPayload
>;
export type GetUserOrderHistoryQuery = BaseQuery<
  typeof QueryType.GET_USER_ORDER_HISTORY,
  GetUserOrderHistoryPayload
>;
export type SearchOrdersQuery = BaseQuery<typeof QueryType.SEARCH_ORDERS, SearchOrdersPayload>;
export type GetPendingOrdersQuery = BaseQuery<
  typeof QueryType.GET_PENDING_ORDERS,
  GetPendingOrdersPayload
>;
export type GetOrdersToShipQuery = BaseQuery<
  typeof QueryType.GET_ORDERS_TO_SHIP,
  GetOrdersToShipPayload
>;

/**
 * Union type for all order queries
 */
export type OrderQuery =
  | GetOrderByIdQuery
  | GetOrderByNumberQuery
  | GetOrdersByUserQuery
  | GetAllOrdersQuery
  | GetOrdersByStatusQuery
  | GetOrdersByDateRangeQuery
  | GetOrderStatisticsQuery
  | GetUserOrderHistoryQuery
  | SearchOrdersQuery
  | GetPendingOrdersQuery
  | GetOrdersToShipQuery;

/**
 * View models for query results
 */
export interface OrderViewModel {
  id: OrderId;
  orderNumber: OrderNumber;
  userId: UserId;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: Amount;
  subtotal: Amount;
  tax: Amount;
  shipping: Amount;
  discount?: Amount;
  shippingAddress: ShippingAddress;
  paymentInfo: PaymentInfo;
  shippingInfo: ShippingInfo;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderSummary {
  id: OrderId;
  orderNumber: OrderNumber;
  userId: UserId;
  status: OrderStatus;
  totalAmount: Amount;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderStatistics {
  totalOrders: number;
  totalRevenue: Amount;
  averageOrderValue: Amount;
  ordersByStatus: Record<OrderStatus, number>;
  topProducts: Array<{
    productId: string;
    productName: string;
    quantity: number;
    revenue: Amount;
  }>;
  revenueByMonth?: Array<{
    month: string;
    revenue: Amount;
    orderCount: number;
  }>;
}

export interface UserOrderHistory {
  userId: UserId;
  totalOrders: number;
  totalSpent: Amount;
  firstOrderDate?: Date;
  lastOrderDate?: Date;
  recentOrders: OrderSummary[];
  favoriteProducts?: Array<{
    productId: string;
    productName: string;
    orderCount: number;
  }>;
}

/**
 * Query result type with metadata
 */
export type QueryResult<T = unknown> = Result<
  {
    data: T;
    metadata: {
      executionTime: number;
      source: 'cache' | 'database';
      cacheKey?: string;
    };
  },
  {
    code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'PERMISSION_DENIED' | 'INTERNAL_ERROR';
    message: string;
    details?: unknown;
  }
>;

/**
 * Query validation schemas
 */
export const getOrderByIdQuerySchema = z.object({
  type: z.literal(QueryType.GET_ORDER_BY_ID),
  payload: z.object({
    orderId: z.string().uuid(),
  }),
});

export const getOrderByNumberQuerySchema = z.object({
  type: z.literal(QueryType.GET_ORDER_BY_NUMBER),
  payload: z.object({
    orderNumber: z.string().regex(/^ORD-\d{8,}$/),
  }),
});

export const getOrdersByUserQuerySchema = z.object({
  type: z.literal(QueryType.GET_ORDERS_BY_USER),
  payload: z.object({
    userId: z.string().uuid(),
    filter: z
      .object({
        status: z
          .enum([
            'PENDING',
            'CONFIRMED',
            'PROCESSING',
            'SHIPPED',
            'DELIVERED',
            'CANCELLED',
            'REFUNDED',
          ])
          .optional(),
        minAmount: z.number().min(0).optional(),
        maxAmount: z.number().min(0).optional(),
        fromDate: z.date().optional(),
        toDate: z.date().optional(),
        hasShipped: z.boolean().optional(),
      })
      .optional(),
    pagination: z
      .object({
        offset: z.number().int().min(0),
        limit: z.number().int().min(1).max(100),
      })
      .optional(),
    sorting: z
      .object({
        field: z.enum(['orderNumber', 'totalAmount', 'createdAt', 'updatedAt', 'status']),
        direction: z.enum(['ASC', 'DESC']),
      })
      .optional(),
  }),
});

export const getAllOrdersQuerySchema = z.object({
  type: z.literal(QueryType.GET_ALL_ORDERS),
  payload: z.object({
    filter: z
      .object({
        userId: z.string().uuid().optional(),
        status: z
          .enum([
            'PENDING',
            'CONFIRMED',
            'PROCESSING',
            'SHIPPED',
            'DELIVERED',
            'CANCELLED',
            'REFUNDED',
          ])
          .optional(),
        minAmount: z.number().min(0).optional(),
        maxAmount: z.number().min(0).optional(),
        fromDate: z.date().optional(),
        toDate: z.date().optional(),
        hasShipped: z.boolean().optional(),
      })
      .optional(),
    pagination: z
      .object({
        offset: z.number().int().min(0),
        limit: z.number().int().min(1).max(100),
      })
      .optional(),
    sorting: z
      .object({
        field: z.enum(['orderNumber', 'totalAmount', 'createdAt', 'updatedAt', 'status']),
        direction: z.enum(['ASC', 'DESC']),
      })
      .optional(),
  }),
});

export const getOrdersByStatusQuerySchema = z.object({
  type: z.literal(QueryType.GET_ORDERS_BY_STATUS),
  payload: z.object({
    status: z.enum([
      'PENDING',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
      'REFUNDED',
    ]),
    filter: z
      .object({
        userId: z.string().uuid().optional(),
        minAmount: z.number().min(0).optional(),
        maxAmount: z.number().min(0).optional(),
        fromDate: z.date().optional(),
        toDate: z.date().optional(),
        hasShipped: z.boolean().optional(),
      })
      .optional(),
    pagination: z
      .object({
        offset: z.number().int().min(0),
        limit: z.number().int().min(1).max(100),
      })
      .optional(),
    sorting: z
      .object({
        field: z.enum(['orderNumber', 'totalAmount', 'createdAt', 'updatedAt', 'status']),
        direction: z.enum(['ASC', 'DESC']),
      })
      .optional(),
  }),
});

export const getOrdersByDateRangeQuerySchema = z.object({
  type: z.literal(QueryType.GET_ORDERS_BY_DATE_RANGE),
  payload: z.object({
    fromDate: z.date(),
    toDate: z.date(),
    filter: z
      .object({
        userId: z.string().uuid().optional(),
        status: z
          .enum([
            'PENDING',
            'CONFIRMED',
            'PROCESSING',
            'SHIPPED',
            'DELIVERED',
            'CANCELLED',
            'REFUNDED',
          ])
          .optional(),
        minAmount: z.number().min(0).optional(),
        maxAmount: z.number().min(0).optional(),
        hasShipped: z.boolean().optional(),
      })
      .optional(),
    pagination: z
      .object({
        offset: z.number().int().min(0),
        limit: z.number().int().min(1).max(100),
      })
      .optional(),
    sorting: z
      .object({
        field: z.enum(['orderNumber', 'totalAmount', 'createdAt', 'updatedAt', 'status']),
        direction: z.enum(['ASC', 'DESC']),
      })
      .optional(),
  }),
});

export const getOrderStatisticsQuerySchema = z.object({
  type: z.literal(QueryType.GET_ORDER_STATISTICS),
  payload: z.object({
    userId: z.string().uuid().optional(),
    fromDate: z.date().optional(),
    toDate: z.date().optional(),
  }),
});

export const getUserOrderHistoryQuerySchema = z.object({
  type: z.literal(QueryType.GET_USER_ORDER_HISTORY),
  payload: z.object({
    userId: z.string().uuid(),
    limit: z.number().int().min(1).max(50).optional(),
    includeDetails: z.boolean().optional(),
  }),
});

export const searchOrdersQuerySchema = z.object({
  type: z.literal(QueryType.SEARCH_ORDERS),
  payload: z.object({
    searchTerm: z.string().min(1).max(100),
    searchFields: z
      .array(z.enum(['orderNumber', 'customerName', 'productName', 'trackingNumber']))
      .optional(),
    filter: z
      .object({
        userId: z.string().uuid().optional(),
        status: z
          .enum([
            'PENDING',
            'CONFIRMED',
            'PROCESSING',
            'SHIPPED',
            'DELIVERED',
            'CANCELLED',
            'REFUNDED',
          ])
          .optional(),
        minAmount: z.number().min(0).optional(),
        maxAmount: z.number().min(0).optional(),
        fromDate: z.date().optional(),
        toDate: z.date().optional(),
        hasShipped: z.boolean().optional(),
      })
      .optional(),
    pagination: z
      .object({
        offset: z.number().int().min(0),
        limit: z.number().int().min(1).max(100),
      })
      .optional(),
  }),
});

export const getPendingOrdersQuerySchema = z.object({
  type: z.literal(QueryType.GET_PENDING_ORDERS),
  payload: z.object({
    olderThan: z.date().optional(),
    pagination: z
      .object({
        offset: z.number().int().min(0),
        limit: z.number().int().min(1).max(100),
      })
      .optional(),
  }),
});

export const getOrdersToShipQuerySchema = z.object({
  type: z.literal(QueryType.GET_ORDERS_TO_SHIP),
  payload: z.object({
    includeDelayed: z.boolean().optional(),
    pagination: z
      .object({
        offset: z.number().int().min(0),
        limit: z.number().int().min(1).max(100),
      })
      .optional(),
  }),
});

/**
 * Query validation schema map
 */
export const querySchemas = {
  [QueryType.GET_ORDER_BY_ID]: getOrderByIdQuerySchema,
  [QueryType.GET_ORDER_BY_NUMBER]: getOrderByNumberQuerySchema,
  [QueryType.GET_ORDERS_BY_USER]: getOrdersByUserQuerySchema,
  [QueryType.GET_ALL_ORDERS]: getAllOrdersQuerySchema,
  [QueryType.GET_ORDERS_BY_STATUS]: getOrdersByStatusQuerySchema,
  [QueryType.GET_ORDERS_BY_DATE_RANGE]: getOrdersByDateRangeQuerySchema,
  [QueryType.GET_ORDER_STATISTICS]: getOrderStatisticsQuerySchema,
  [QueryType.GET_USER_ORDER_HISTORY]: getUserOrderHistoryQuerySchema,
  [QueryType.SEARCH_ORDERS]: searchOrdersQuerySchema,
  [QueryType.GET_PENDING_ORDERS]: getPendingOrdersQuerySchema,
  [QueryType.GET_ORDERS_TO_SHIP]: getOrdersToShipQuerySchema,
} as const;

/**
 * Type helper to get query from type
 */
export type QueryFromType<T extends QueryType> = Extract<OrderQuery, { type: T }>;

/**
 * Type-safe query validation
 */
export function validateQuery<T extends OrderQuery>(query: T): T {
  const schema = querySchemas[query.type];
  if (!schema) {
    throw new Error(`Unknown query type: ${query.type}`);
  }

  const result = schema.safeParse(query);

  if (!result.success) {
    const messages = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Query validation failed: ${messages}`);
  }

  return result.data as T;
}

/**
 * Query factory functions for type-safe creation
 */
export const createQuery = {
  getOrderById: (orderId: OrderId): GetOrderByIdQuery => ({
    type: QueryType.GET_ORDER_BY_ID,
    payload: { orderId },
  }),

  getOrderByNumber: (orderNumber: OrderNumber): GetOrderByNumberQuery => ({
    type: QueryType.GET_ORDER_BY_NUMBER,
    payload: { orderNumber },
  }),

  getOrdersByUser: (payload: GetOrdersByUserPayload): GetOrdersByUserQuery => ({
    type: QueryType.GET_ORDERS_BY_USER,
    payload,
  }),

  getAllOrders: (payload: GetAllOrdersPayload = {}): GetAllOrdersQuery => ({
    type: QueryType.GET_ALL_ORDERS,
    payload,
  }),

  getOrdersByStatus: (
    status: OrderStatus,
    options?: Omit<GetOrdersByStatusPayload, 'status'>
  ): GetOrdersByStatusQuery => ({
    type: QueryType.GET_ORDERS_BY_STATUS,
    payload: { status, ...options },
  }),

  getOrdersByDateRange: (payload: GetOrdersByDateRangePayload): GetOrdersByDateRangeQuery => ({
    type: QueryType.GET_ORDERS_BY_DATE_RANGE,
    payload,
  }),

  getOrderStatistics: (payload: GetOrderStatisticsPayload = {}): GetOrderStatisticsQuery => ({
    type: QueryType.GET_ORDER_STATISTICS,
    payload,
  }),

  getUserOrderHistory: (payload: GetUserOrderHistoryPayload): GetUserOrderHistoryQuery => ({
    type: QueryType.GET_USER_ORDER_HISTORY,
    payload,
  }),

  searchOrders: (payload: SearchOrdersPayload): SearchOrdersQuery => ({
    type: QueryType.SEARCH_ORDERS,
    payload,
  }),

  getPendingOrders: (payload: GetPendingOrdersPayload = {}): GetPendingOrdersQuery => ({
    type: QueryType.GET_PENDING_ORDERS,
    payload,
  }),

  getOrdersToShip: (payload: GetOrdersToShipPayload = {}): GetOrdersToShipQuery => ({
    type: QueryType.GET_ORDERS_TO_SHIP,
    payload,
  }),
} as const;

/**
 * Type guard for query types
 */
export const isQuery = {
  getOrderById: (query: OrderQuery): query is GetOrderByIdQuery =>
    query.type === QueryType.GET_ORDER_BY_ID,
  getOrderByNumber: (query: OrderQuery): query is GetOrderByNumberQuery =>
    query.type === QueryType.GET_ORDER_BY_NUMBER,
  getOrdersByUser: (query: OrderQuery): query is GetOrdersByUserQuery =>
    query.type === QueryType.GET_ORDERS_BY_USER,
  getAllOrders: (query: OrderQuery): query is GetAllOrdersQuery =>
    query.type === QueryType.GET_ALL_ORDERS,
  getOrdersByStatus: (query: OrderQuery): query is GetOrdersByStatusQuery =>
    query.type === QueryType.GET_ORDERS_BY_STATUS,
  getOrdersByDateRange: (query: OrderQuery): query is GetOrdersByDateRangeQuery =>
    query.type === QueryType.GET_ORDERS_BY_DATE_RANGE,
  getOrderStatistics: (query: OrderQuery): query is GetOrderStatisticsQuery =>
    query.type === QueryType.GET_ORDER_STATISTICS,
  getUserOrderHistory: (query: OrderQuery): query is GetUserOrderHistoryQuery =>
    query.type === QueryType.GET_USER_ORDER_HISTORY,
  searchOrders: (query: OrderQuery): query is SearchOrdersQuery =>
    query.type === QueryType.SEARCH_ORDERS,
  getPendingOrders: (query: OrderQuery): query is GetPendingOrdersQuery =>
    query.type === QueryType.GET_PENDING_ORDERS,
  getOrdersToShip: (query: OrderQuery): query is GetOrdersToShipQuery =>
    query.type === QueryType.GET_ORDERS_TO_SHIP,
} as const;

/**
 * Helper function to create paginated results
 */
import { PaginationUtils } from '@graphql-microservices/shared-type-utils';

export const createPaginatedResult = PaginationUtils.offsetResult;

/**
 * Re-export PaginatedResult type
 */
export type { PaginatedResult } from '@graphql-microservices/shared-type-utils';
