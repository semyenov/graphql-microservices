import { z } from 'zod';

/**
 * Query result wrapper
 */
export interface QueryResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    executionTime: number;
    source: string;
    cacheHit?: boolean;
  };
}

/**
 * Base query interface
 */
export interface Query {
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  offset?: number;
  limit?: number;
}

/**
 * Sorting options
 */
export interface SortingOptions {
  field: string;
  direction: 'ASC' | 'DESC';
}

/**
 * Filter options
 */
export interface ProductFilterOptions {
  category?: string;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  isActive?: boolean;
  tags?: string[];
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Product view model
 */
export interface ProductViewModel {
  id: string;
  name: string;
  description: string;
  price: { amount: number; currency: string };
  stock: number;
  availableStock: number;
  sku: string;
  category: string;
  tags: string[];
  imageUrl?: string;
  isActive: boolean;
  isLowStock: boolean;
  isAvailableForPurchase: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Product event view model
 */
export interface ProductEventViewModel {
  id: string;
  type: string;
  aggregateId: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  occurredAt: Date;
  version: number;
}

/**
 * Stock reservation view model
 */
export interface StockReservationViewModel {
  id: string;
  productId: string;
  quantity: number;
  reservedFor: string;
  createdAt: Date;
  expiresAt?: Date;
  status: 'active' | 'expired' | 'fulfilled' | 'cancelled';
}

/**
 * Product inventory summary
 */
export interface ProductInventorySummary {
  productId: string;
  productName: string;
  sku: string;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
  pendingOrders: number;
  lowStockThreshold: number;
  isLowStock: boolean;
}

/**
 * Product Queries
 */

// Get Product By ID
export interface GetProductByIdQuery extends Query {
  type: 'GetProductById';
  payload: {
    productId: string;
  };
}

// Get Product By SKU
export interface GetProductBySkuQuery extends Query {
  type: 'GetProductBySku';
  payload: {
    sku: string;
  };
}

// Get All Products
export interface GetAllProductsQuery extends Query {
  type: 'GetAllProducts';
  payload: {
    filter?: ProductFilterOptions;
    pagination?: PaginationOptions;
    sorting?: SortingOptions;
  };
}

// Get Products By IDs (for batch loading)
export interface GetProductsByIdsQuery extends Query {
  type: 'GetProductsByIds';
  payload: {
    productIds: string[];
  };
}

// Get Products By Category
export interface GetProductsByCategoryQuery extends Query {
  type: 'GetProductsByCategory';
  payload: {
    category: string;
    filter?: Omit<ProductFilterOptions, 'category'>;
    pagination?: PaginationOptions;
    sorting?: SortingOptions;
  };
}

// Search Products
export interface SearchProductsQuery extends Query {
  type: 'SearchProducts';
  payload: {
    searchTerm: string;
    searchFields?: Array<'name' | 'description' | 'sku' | 'tags'>;
    filter?: ProductFilterOptions;
    pagination?: PaginationOptions;
  };
}

// Get Product Events
export interface GetProductEventsQuery extends Query {
  type: 'GetProductEvents';
  payload: {
    productId: string;
    eventTypes?: string[];
    fromDate?: Date;
    toDate?: Date;
    pagination?: PaginationOptions;
  };
}

// Get Product Stock Reservations
export interface GetProductStockReservationsQuery extends Query {
  type: 'GetProductStockReservations';
  payload: {
    productId: string;
    status?: 'active' | 'expired' | 'fulfilled' | 'cancelled';
    pagination?: PaginationOptions;
  };
}

// Get Low Stock Products
export interface GetLowStockProductsQuery extends Query {
  type: 'GetLowStockProducts';
  payload: {
    threshold?: number;
    category?: string;
    pagination?: PaginationOptions;
  };
}

// Get Product Inventory Summary
export interface GetProductInventorySummaryQuery extends Query {
  type: 'GetProductInventorySummary';
  payload: {
    productIds?: string[];
    category?: string;
    onlyLowStock?: boolean;
    pagination?: PaginationOptions;
  };
}

// Union type for all product queries
export type ProductQuery =
  | GetProductByIdQuery
  | GetProductBySkuQuery
  | GetAllProductsQuery
  | GetProductsByIdsQuery
  | GetProductsByCategoryQuery
  | SearchProductsQuery
  | GetProductEventsQuery
  | GetProductStockReservationsQuery
  | GetLowStockProductsQuery
  | GetProductInventorySummaryQuery;

/**
 * Query validation schemas
 */

export const getProductByIdQuerySchema = z.object({
  type: z.literal('GetProductById'),
  payload: z.object({
    productId: z.string().uuid(),
  }),
});

export const getProductBySkuQuerySchema = z.object({
  type: z.literal('GetProductBySku'),
  payload: z.object({
    sku: z.string().regex(/^[A-Z]{2,10}-\d{4,10}$/),
  }),
});

export const getProductsByIdsQuerySchema = z.object({
  type: z.literal('GetProductsByIds'),
  payload: z.object({
    productIds: z.array(z.string().uuid()).min(1).max(100),
  }),
});

export const paginationOptionsSchema = z.object({
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export const sortingOptionsSchema = z.object({
  field: z.string(),
  direction: z.enum(['ASC', 'DESC']),
});

export const productFilterOptionsSchema = z.object({
  category: z.string().optional(),
  priceMin: z.number().positive().optional(),
  priceMax: z.number().positive().optional(),
  inStock: z.boolean().optional(),
  isActive: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export const getAllProductsQuerySchema = z.object({
  type: z.literal('GetAllProducts'),
  payload: z.object({
    filter: productFilterOptionsSchema.optional(),
    pagination: paginationOptionsSchema.optional(),
    sorting: sortingOptionsSchema.optional(),
  }),
});

export const getProductsByCategoryQuerySchema = z.object({
  type: z.literal('GetProductsByCategory'),
  payload: z.object({
    category: z.string(),
    filter: productFilterOptionsSchema.omit({ category: true }).optional(),
    pagination: paginationOptionsSchema.optional(),
    sorting: sortingOptionsSchema.optional(),
  }),
});

export const searchProductsQuerySchema = z.object({
  type: z.literal('SearchProducts'),
  payload: z.object({
    searchTerm: z.string().min(1),
    searchFields: z.array(z.enum(['name', 'description', 'sku', 'tags'])).optional(),
    filter: productFilterOptionsSchema.optional(),
    pagination: paginationOptionsSchema.optional(),
  }),
});

export const getProductEventsQuerySchema = z.object({
  type: z.literal('GetProductEvents'),
  payload: z.object({
    productId: z.string().uuid(),
    eventTypes: z.array(z.string()).optional(),
    fromDate: z.date().optional(),
    toDate: z.date().optional(),
    pagination: paginationOptionsSchema.optional(),
  }),
});

export const getProductStockReservationsQuerySchema = z.object({
  type: z.literal('GetProductStockReservations'),
  payload: z.object({
    productId: z.string().uuid(),
    status: z.enum(['active', 'expired', 'fulfilled', 'cancelled']).optional(),
    pagination: paginationOptionsSchema.optional(),
  }),
});

export const getLowStockProductsQuerySchema = z.object({
  type: z.literal('GetLowStockProducts'),
  payload: z.object({
    threshold: z.number().int().positive().optional(),
    category: z.string().optional(),
    pagination: paginationOptionsSchema.optional(),
  }),
});

export const getProductInventorySummaryQuerySchema = z.object({
  type: z.literal('GetProductInventorySummary'),
  payload: z.object({
    productIds: z.array(z.string().uuid()).optional(),
    category: z.string().optional(),
    onlyLowStock: z.boolean().optional(),
    pagination: paginationOptionsSchema.optional(),
  }),
});

/**
 * Query validation function
 */
export function validateQuery(query: ProductQuery): void {
  const schemas: Record<ProductQuery['type'], z.ZodSchema> = {
    GetProductById: getProductByIdQuerySchema,
    GetProductBySku: getProductBySkuQuerySchema,
    GetAllProducts: getAllProductsQuerySchema,
    GetProductsByIds: getProductsByIdsQuerySchema,
    GetProductsByCategory: getProductsByCategoryQuerySchema,
    SearchProducts: searchProductsQuerySchema,
    GetProductEvents: getProductEventsQuerySchema,
    GetProductStockReservations: getProductStockReservationsQuerySchema,
    GetLowStockProducts: getLowStockProductsQuerySchema,
    GetProductInventorySummary: getProductInventorySummaryQuerySchema,
  };

  const schema = schemas[query.type];
  if (!schema) {
    throw new Error(`Unknown query type: ${query.type}`);
  }

  schema.parse(query);
}

/**
 * Query factory functions
 */

export function getProductByIdQuery(productId: string): GetProductByIdQuery {
  return {
    type: 'GetProductById',
    payload: { productId },
  };
}

export function getProductBySkuQuery(sku: string): GetProductBySkuQuery {
  return {
    type: 'GetProductBySku',
    payload: { sku },
  };
}

export function getAllProductsQuery(
  filter?: ProductFilterOptions,
  pagination?: PaginationOptions,
  sorting?: SortingOptions
): GetAllProductsQuery {
  return {
    type: 'GetAllProducts',
    payload: { filter, pagination, sorting },
  };
}

export function getProductsByIdsQuery(productIds: string[]): GetProductsByIdsQuery {
  return {
    type: 'GetProductsByIds',
    payload: { productIds },
  };
}

export function getProductsByCategoryQuery(
  category: string,
  filter?: Omit<ProductFilterOptions, 'category'>,
  pagination?: PaginationOptions,
  sorting?: SortingOptions
): GetProductsByCategoryQuery {
  return {
    type: 'GetProductsByCategory',
    payload: { category, filter, pagination, sorting },
  };
}

export function searchProductsQuery(
  searchTerm: string,
  searchFields?: Array<'name' | 'description' | 'sku' | 'tags'>,
  filter?: ProductFilterOptions,
  pagination?: PaginationOptions
): SearchProductsQuery {
  return {
    type: 'SearchProducts',
    payload: { searchTerm, searchFields, filter, pagination },
  };
}

export function getProductEventsQuery(
  productId: string,
  eventTypes?: string[],
  fromDate?: Date,
  toDate?: Date,
  pagination?: PaginationOptions
): GetProductEventsQuery {
  return {
    type: 'GetProductEvents',
    payload: { productId, eventTypes, fromDate, toDate, pagination },
  };
}

export function getProductStockReservationsQuery(
  productId: string,
  status?: 'active' | 'expired' | 'fulfilled' | 'cancelled',
  pagination?: PaginationOptions
): GetProductStockReservationsQuery {
  return {
    type: 'GetProductStockReservations',
    payload: { productId, status, pagination },
  };
}

export function getLowStockProductsQuery(
  threshold?: number,
  category?: string,
  pagination?: PaginationOptions
): GetLowStockProductsQuery {
  return {
    type: 'GetLowStockProducts',
    payload: { threshold, category, pagination },
  };
}

export function getProductInventorySummaryQuery(
  productIds?: string[],
  category?: string,
  onlyLowStock?: boolean,
  pagination?: PaginationOptions
): GetProductInventorySummaryQuery {
  return {
    type: 'GetProductInventorySummary',
    payload: { productIds, category, onlyLowStock, pagination },
  };
}
