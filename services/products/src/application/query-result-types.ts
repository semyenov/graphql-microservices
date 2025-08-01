import type {
  PaginatedResult,
  ProductEventViewModel,
  ProductInventorySummary,
  ProductViewModel,
  QueryResult,
  StockReservationViewModel,
} from './queries';

/**
 * Type-safe query result types for Products Service
 * These provide proper typing for query bus results
 */

// Product query results
export type GetProductByIdResult = QueryResult<ProductViewModel | null>;
export type GetProductBySkuResult = QueryResult<ProductViewModel | null>;
export type GetAllProductsResult = QueryResult<PaginatedResult<ProductViewModel>>;
export type GetProductsByIdsResult = QueryResult<ProductViewModel[]>;
export type GetProductsByCategoryResult = QueryResult<PaginatedResult<ProductViewModel>>;
export type SearchProductsResult = QueryResult<PaginatedResult<ProductViewModel>>;

// Event and inventory query results
export type GetProductEventsResult = QueryResult<PaginatedResult<ProductEventViewModel>>;
export type GetProductStockReservationsResult = QueryResult<PaginatedResult<StockReservationViewModel>>;
export type GetLowStockProductsResult = QueryResult<PaginatedResult<ProductViewModel>>;
export type GetProductInventorySummaryResult = QueryResult<PaginatedResult<ProductInventorySummary>>;

/**
 * Type guard to check if query result is successful
 */
export function isSuccessResult<T>(result: QueryResult<T>): result is QueryResult<T> & { success: true; data: T } {
  return result.success === true && result.data !== undefined;
}

/**
 * Type guard to check if query result has paginated data
 */
export function hasPaginatedData<T>(
  result: QueryResult<PaginatedResult<T>>
): result is QueryResult<PaginatedResult<T>> & { success: true; data: PaginatedResult<T> } {
  return result.success === true && result.data !== undefined && 'items' in result.data;
}

/**
 * Extract data from query result or throw error
 */
export function extractQueryData<T>(result: QueryResult<T>, errorMessage?: string): T {
  if (!isSuccessResult(result)) {
    throw new Error(result.error || errorMessage || 'Query failed');
  }
  return result.data;
}