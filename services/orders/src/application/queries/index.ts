import { z } from 'zod';

// Base query interface
export interface Query {
  readonly type: string;
}

// Query payloads with validation schemas

// Get Order By ID
export const getOrderByIdPayloadSchema = z.object({
  orderId: z.uuid('Invalid order ID format'),
});

export type GetOrderByIdPayload = z.infer<typeof getOrderByIdPayloadSchema>;

export interface GetOrderByIdQuery extends Query {
  readonly type: 'GetOrderById';
  readonly payload: GetOrderByIdPayload;
}

// Get Order By Order Number
export const getOrderByNumberPayloadSchema = z.object({
  orderNumber: z.string().regex(
    /^ORD-\d{4}-\d{2}-\d{2}-\d{6}$/,
    'Invalid order number format'
  ),
});

export type GetOrderByNumberPayload = z.infer<typeof getOrderByNumberPayloadSchema>;

export interface GetOrderByNumberQuery extends Query {
  readonly type: 'GetOrderByNumber';
  readonly payload: GetOrderByNumberPayload;
}

// Get Orders By Customer
export const getOrdersByCustomerPayloadSchema = z.object({
  customerId: z.uuid('Invalid customer ID format'),
  status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
  sortBy: z.enum(['createdAt', 'updatedAt', 'total', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type GetOrdersByCustomerPayload = z.infer<typeof getOrdersByCustomerPayloadSchema>;

export interface GetOrdersByCustomerQuery extends Query {
  readonly type: 'GetOrdersByCustomer';
  readonly payload: GetOrdersByCustomerPayload;
}

// Get All Orders (Admin)
export const getAllOrdersPayloadSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']).optional(),
  customerId: z.uuid().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  minTotal: z.number().positive().optional(),
  maxTotal: z.number().positive().optional(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
  sortBy: z.enum(['createdAt', 'updatedAt', 'total', 'status', 'customerName']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type GetAllOrdersPayload = z.infer<typeof getAllOrdersPayloadSchema>;

export interface GetAllOrdersQuery extends Query {
  readonly type: 'GetAllOrders';
  readonly payload: GetAllOrdersPayload;
}

// Get Order Statistics
export const getOrderStatisticsPayloadSchema = z.object({
  customerId: z.uuid().optional(),
  fromDate: z.string().datetime(),
  toDate: z.string().datetime(),
  groupBy: z.enum(['day', 'week', 'month', 'year']).default('day'),
});

export type GetOrderStatisticsPayload = z.infer<typeof getOrderStatisticsPayloadSchema>;

export interface GetOrderStatisticsQuery extends Query {
  readonly type: 'GetOrderStatistics';
  readonly payload: GetOrderStatisticsPayload;
}

// Search Orders
export const searchOrdersPayloadSchema = z.object({
  searchTerm: z.string().min(1, 'Search term is required'),
  searchFields: z.array(z.enum(['orderNumber', 'customerName', 'customerEmail', 'productName', 'trackingNumber']))
    .default(['orderNumber', 'customerName']),
  limit: z.number().int().positive().max(50).default(10),
  offset: z.number().int().nonnegative().default(0),
});

export type SearchOrdersPayload = z.infer<typeof searchOrdersPayloadSchema>;

export interface SearchOrdersQuery extends Query {
  readonly type: 'SearchOrders';
  readonly payload: SearchOrdersPayload;
}

// Get Order Count
export const getOrderCountPayloadSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']).optional(),
  customerId: z.uuid().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

export type GetOrderCountPayload = z.infer<typeof getOrderCountPayloadSchema>;

export interface GetOrderCountQuery extends Query {
  readonly type: 'GetOrderCount';
  readonly payload: GetOrderCountPayload;
}

// Get Revenue Report
export const getRevenueReportPayloadSchema = z.object({
  fromDate: z.string().datetime(),
  toDate: z.string().datetime(),
  groupBy: z.enum(['day', 'week', 'month', 'year', 'customer', 'product']).default('day'),
  includeRefunds: z.boolean().default(true),
});

export type GetRevenueReportPayload = z.infer<typeof getRevenueReportPayloadSchema>;

export interface GetRevenueReportQuery extends Query {
  readonly type: 'GetRevenueReport';
  readonly payload: GetRevenueReportPayload;
}

// Union type for all queries
export type OrderQuery =
  | GetOrderByIdQuery
  | GetOrderByNumberQuery
  | GetOrdersByCustomerQuery
  | GetAllOrdersQuery
  | GetOrderStatisticsQuery
  | SearchOrdersQuery
  | GetOrderCountQuery
  | GetRevenueReportQuery;

// Query factory functions
export function getOrderByIdQuery(payload: GetOrderByIdPayload): GetOrderByIdQuery {
  return {
    type: 'GetOrderById',
    payload: getOrderByIdPayloadSchema.parse(payload),
  };
}

export function getOrderByNumberQuery(payload: GetOrderByNumberPayload): GetOrderByNumberQuery {
  return {
    type: 'GetOrderByNumber',
    payload: getOrderByNumberPayloadSchema.parse(payload),
  };
}

export function getOrdersByCustomerQuery(payload: GetOrdersByCustomerPayload): GetOrdersByCustomerQuery {
  return {
    type: 'GetOrdersByCustomer',
    payload: getOrdersByCustomerPayloadSchema.parse(payload),
  };
}

export function getAllOrdersQuery(payload: GetAllOrdersPayload): GetAllOrdersQuery {
  return {
    type: 'GetAllOrders',
    payload: getAllOrdersPayloadSchema.parse(payload),
  };
}

export function getOrderStatisticsQuery(payload: GetOrderStatisticsPayload): GetOrderStatisticsQuery {
  return {
    type: 'GetOrderStatistics',
    payload: getOrderStatisticsPayloadSchema.parse(payload),
  };
}

export function searchOrdersQuery(payload: SearchOrdersPayload): SearchOrdersQuery {
  return {
    type: 'SearchOrders',
    payload: searchOrdersPayloadSchema.parse(payload),
  };
}

export function getOrderCountQuery(payload: GetOrderCountPayload): GetOrderCountQuery {
  return {
    type: 'GetOrderCount',
    payload: getOrderCountPayloadSchema.parse(payload),
  };
}

export function getRevenueReportQuery(payload: GetRevenueReportPayload): GetRevenueReportQuery {
  return {
    type: 'GetRevenueReport',
    payload: getRevenueReportPayloadSchema.parse(payload),
  };
}

// View models for query results
export interface OrderViewModel {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  status: string;
  items: OrderItemViewModel[];
  shippingAddress: AddressViewModel;
  billingAddress?: AddressViewModel;
  paymentMethod: string;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  currency: string;
  trackingInfo?: TrackingInfoViewModel;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  cancelledAt?: Date;
  deliveredAt?: Date;
}

export interface OrderItemViewModel {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface AddressViewModel {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface TrackingInfoViewModel {
  trackingNumber: string;
  carrier: string;
  estimatedDeliveryDate: Date;
  shippedDate: Date;
}

export interface OrderStatisticsViewModel {
  period: string;
  orderCount: number;
  totalRevenue: number;
  averageOrderValue: number;
  topProducts: Array<{
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
  }>;
  statusBreakdown: Record<string, number>;
}

export interface RevenueReportViewModel {
  period: string;
  grouping: string;
  data: Array<{
    label: string;
    orderCount: number;
    grossRevenue: number;
    refunds: number;
    netRevenue: number;
  }>;
  totals: {
    orderCount: number;
    grossRevenue: number;
    refunds: number;
    netRevenue: number;
  };
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor?: string;
    endCursor?: string;
  };
}