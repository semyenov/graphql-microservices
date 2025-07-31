import { z } from 'zod';
import type {
  CategoryName,
  Pagination,
  Price,
  ProductFilter,
  ProductId,
  ProductSort,
  Result,
  SKU,
  Stock,
} from './types';

/**
 * Query type literals
 */
export const QueryType = {
  GET_PRODUCT_BY_ID: 'GetProductById',
  GET_PRODUCT_BY_SKU: 'GetProductBySku',
  GET_ALL_PRODUCTS: 'GetAllProducts',
  GET_PRODUCTS_BY_IDS: 'GetProductsByIds',
  GET_PRODUCTS_BY_CATEGORY: 'GetProductsByCategory',
  SEARCH_PRODUCTS: 'SearchProducts',
  GET_LOW_STOCK_PRODUCTS: 'GetLowStockProducts',
  GET_PRODUCT_STOCK_INFO: 'GetProductStockInfo',
} as const;

export type QueryType = (typeof QueryType)[keyof typeof QueryType];

/**
 * Query payloads
 */
export interface GetProductByIdPayload {
  productId: ProductId;
}

export interface GetProductBySkuPayload {
  sku: SKU;
}

export interface GetAllProductsPayload {
  filter?: ProductFilter;
  pagination?: Pagination;
  sorting?: ProductSort;
}

export interface GetProductsByIdsPayload {
  productIds: ProductId[];
}

export interface GetProductsByCategoryPayload {
  category: CategoryName;
  filter?: Omit<ProductFilter, 'category'>;
  pagination?: Pagination;
  sorting?: ProductSort;
}

export interface SearchProductsPayload {
  searchTerm: string;
  searchFields?: Array<'name' | 'description' | 'tags' | 'sku'>;
  filter?: ProductFilter;
  pagination?: Pagination;
}

export interface GetLowStockProductsPayload {
  threshold: Stock;
  pagination?: Pagination;
}

export interface GetProductStockInfoPayload {
  productId: ProductId;
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
export type GetProductByIdQuery = BaseQuery<
  typeof QueryType.GET_PRODUCT_BY_ID,
  GetProductByIdPayload
>;
export type GetProductBySkuQuery = BaseQuery<
  typeof QueryType.GET_PRODUCT_BY_SKU,
  GetProductBySkuPayload
>;
export type GetAllProductsQuery = BaseQuery<
  typeof QueryType.GET_ALL_PRODUCTS,
  GetAllProductsPayload
>;
export type GetProductsByIdsQuery = BaseQuery<
  typeof QueryType.GET_PRODUCTS_BY_IDS,
  GetProductsByIdsPayload
>;
export type GetProductsByCategoryQuery = BaseQuery<
  typeof QueryType.GET_PRODUCTS_BY_CATEGORY,
  GetProductsByCategoryPayload
>;
export type SearchProductsQuery = BaseQuery<
  typeof QueryType.SEARCH_PRODUCTS,
  SearchProductsPayload
>;
export type GetLowStockProductsQuery = BaseQuery<
  typeof QueryType.GET_LOW_STOCK_PRODUCTS,
  GetLowStockProductsPayload
>;
export type GetProductStockInfoQuery = BaseQuery<
  typeof QueryType.GET_PRODUCT_STOCK_INFO,
  GetProductStockInfoPayload
>;

/**
 * Union type for all product queries
 */
export type ProductQuery =
  | GetProductByIdQuery
  | GetProductBySkuQuery
  | GetAllProductsQuery
  | GetProductsByIdsQuery
  | GetProductsByCategoryQuery
  | SearchProductsQuery
  | GetLowStockProductsQuery
  | GetProductStockInfoQuery;

/**
 * View models for query results
 */
export interface ProductViewModel {
  id: ProductId;
  name: string;
  description: string;
  price: Price;
  stock: Stock;
  sku: SKU;
  category: CategoryName;
  tags: string[];
  imageUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductStockInfo {
  productId: ProductId;
  totalStock: Stock;
  availableStock: Stock;
  reservedStock: Stock;
  lastUpdated: Date;
  lowStockThreshold?: Stock;
  isLowStock: boolean;
}

export interface StockReservation {
  orderId: string;
  quantity: Stock;
  reservedAt: Date;
  expiresAt?: Date;
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
export const getProductByIdQuerySchema = z.object({
  type: z.literal(QueryType.GET_PRODUCT_BY_ID),
  payload: z.object({
    productId: z.string().uuid(),
  }),
});

export const getProductBySkuQuerySchema = z.object({
  type: z.literal(QueryType.GET_PRODUCT_BY_SKU),
  payload: z.object({
    sku: z.string().regex(/^[A-Z0-9-]+$/i),
  }),
});

export const getAllProductsQuerySchema = z.object({
  type: z.literal(QueryType.GET_ALL_PRODUCTS),
  payload: z.object({
    filter: z
      .object({
        category: z.string().optional(),
        minPrice: z.number().min(0).optional(),
        maxPrice: z.number().min(0).optional(),
        inStock: z.boolean().optional(),
        isActive: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
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
        field: z.enum(['name', 'price', 'createdAt', 'updatedAt', 'stock']),
        direction: z.enum(['ASC', 'DESC']),
      })
      .optional(),
  }),
});

export const getProductsByIdsQuerySchema = z.object({
  type: z.literal(QueryType.GET_PRODUCTS_BY_IDS),
  payload: z.object({
    productIds: z.array(z.string().uuid()).min(1).max(100),
  }),
});

export const getProductsByCategoryQuerySchema = z.object({
  type: z.literal(QueryType.GET_PRODUCTS_BY_CATEGORY),
  payload: z.object({
    category: z.string().min(1),
    filter: z
      .object({
        minPrice: z.number().min(0).optional(),
        maxPrice: z.number().min(0).optional(),
        inStock: z.boolean().optional(),
        isActive: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
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
        field: z.enum(['name', 'price', 'createdAt', 'updatedAt', 'stock']),
        direction: z.enum(['ASC', 'DESC']),
      })
      .optional(),
  }),
});

export const searchProductsQuerySchema = z.object({
  type: z.literal(QueryType.SEARCH_PRODUCTS),
  payload: z.object({
    searchTerm: z.string().min(1).max(100),
    searchFields: z.array(z.enum(['name', 'description', 'tags', 'sku'])).optional(),
    filter: z
      .object({
        category: z.string().optional(),
        minPrice: z.number().min(0).optional(),
        maxPrice: z.number().min(0).optional(),
        inStock: z.boolean().optional(),
        isActive: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
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

export const getLowStockProductsQuerySchema = z.object({
  type: z.literal(QueryType.GET_LOW_STOCK_PRODUCTS),
  payload: z.object({
    threshold: z.number().int().min(0),
    pagination: z
      .object({
        offset: z.number().int().min(0),
        limit: z.number().int().min(1).max(100),
      })
      .optional(),
  }),
});

export const getProductStockInfoQuerySchema = z.object({
  type: z.literal(QueryType.GET_PRODUCT_STOCK_INFO),
  payload: z.object({
    productId: z.string().uuid(),
  }),
});

/**
 * Query validation schema map
 */
export const querySchemas = {
  [QueryType.GET_PRODUCT_BY_ID]: getProductByIdQuerySchema,
  [QueryType.GET_PRODUCT_BY_SKU]: getProductBySkuQuerySchema,
  [QueryType.GET_ALL_PRODUCTS]: getAllProductsQuerySchema,
  [QueryType.GET_PRODUCTS_BY_IDS]: getProductsByIdsQuerySchema,
  [QueryType.GET_PRODUCTS_BY_CATEGORY]: getProductsByCategoryQuerySchema,
  [QueryType.SEARCH_PRODUCTS]: searchProductsQuerySchema,
  [QueryType.GET_LOW_STOCK_PRODUCTS]: getLowStockProductsQuerySchema,
  [QueryType.GET_PRODUCT_STOCK_INFO]: getProductStockInfoQuerySchema,
} as const;

/**
 * Type helper to get query from type
 */
export type QueryFromType<T extends QueryType> = Extract<ProductQuery, { type: T }>;

/**
 * Type-safe query validation
 */
export function validateQuery<T extends ProductQuery>(query: T): T {
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
  getProductById: (productId: ProductId): GetProductByIdQuery => ({
    type: QueryType.GET_PRODUCT_BY_ID,
    payload: { productId },
  }),

  getProductBySku: (sku: SKU): GetProductBySkuQuery => ({
    type: QueryType.GET_PRODUCT_BY_SKU,
    payload: { sku },
  }),

  getAllProducts: (payload: GetAllProductsPayload = {}): GetAllProductsQuery => ({
    type: QueryType.GET_ALL_PRODUCTS,
    payload,
  }),

  getProductsByIds: (productIds: ProductId[]): GetProductsByIdsQuery => ({
    type: QueryType.GET_PRODUCTS_BY_IDS,
    payload: { productIds },
  }),

  getProductsByCategory: (
    category: CategoryName,
    options?: Omit<GetProductsByCategoryPayload, 'category'>
  ): GetProductsByCategoryQuery => ({
    type: QueryType.GET_PRODUCTS_BY_CATEGORY,
    payload: { category, ...options },
  }),

  searchProducts: (payload: SearchProductsPayload): SearchProductsQuery => ({
    type: QueryType.SEARCH_PRODUCTS,
    payload,
  }),

  getLowStockProducts: (threshold: Stock, pagination?: Pagination): GetLowStockProductsQuery => ({
    type: QueryType.GET_LOW_STOCK_PRODUCTS,
    payload: { threshold, pagination },
  }),

  getProductStockInfo: (productId: ProductId): GetProductStockInfoQuery => ({
    type: QueryType.GET_PRODUCT_STOCK_INFO,
    payload: { productId },
  }),
} as const;

/**
 * Type guard for query types
 */
export const isQuery = {
  getProductById: (query: ProductQuery): query is GetProductByIdQuery =>
    query.type === QueryType.GET_PRODUCT_BY_ID,
  getProductBySku: (query: ProductQuery): query is GetProductBySkuQuery =>
    query.type === QueryType.GET_PRODUCT_BY_SKU,
  getAllProducts: (query: ProductQuery): query is GetAllProductsQuery =>
    query.type === QueryType.GET_ALL_PRODUCTS,
  getProductsByIds: (query: ProductQuery): query is GetProductsByIdsQuery =>
    query.type === QueryType.GET_PRODUCTS_BY_IDS,
  getProductsByCategory: (query: ProductQuery): query is GetProductsByCategoryQuery =>
    query.type === QueryType.GET_PRODUCTS_BY_CATEGORY,
  searchProducts: (query: ProductQuery): query is SearchProductsQuery =>
    query.type === QueryType.SEARCH_PRODUCTS,
  getLowStockProducts: (query: ProductQuery): query is GetLowStockProductsQuery =>
    query.type === QueryType.GET_LOW_STOCK_PRODUCTS,
  getProductStockInfo: (query: ProductQuery): query is GetProductStockInfoQuery =>
    query.type === QueryType.GET_PRODUCT_STOCK_INFO,
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
