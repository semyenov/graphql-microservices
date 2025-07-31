/**
 * Re-export all domain types
 */

/**
 * Re-export pagination types from shared utils
 */
export {
  type OffsetPaginatedResult,
  type OffsetPagination as Pagination,
  type PaginatedResult,
  PaginationUtils,
} from '@graphql-microservices/shared-type-utils';
export * from './domain';
