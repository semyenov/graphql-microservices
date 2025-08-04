import type { z } from 'zod';

/**
 * Metadata that accompanies every query
 */
export interface IQueryMetadata {
  readonly correlationId: string;
  readonly userId?: string;
  readonly timestamp: Date;
  readonly source: string;
  readonly cacheable?: boolean;
  readonly cacheKey?: string;
  readonly cacheTTL?: number;
  readonly [key: string]: unknown;
}

/**
 * Base interface for all queries
 */
export interface IQuery<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly payload: TPayload;
  readonly metadata: IQueryMetadata;
}

/**
 * Query with validation schema
 */
export interface IValidatedQuery<
  TType extends string = string,
  TPayload = unknown,
  TSchema extends z.ZodSchema<TPayload> = z.ZodSchema<TPayload>,
> extends IQuery<TType, TPayload> {
  readonly schema: TSchema;
}

/**
 * Type for mapping query types to their corresponding query interfaces
 */
export type TypedQueryMap<T extends Record<string, IQuery>> = T;

/**
 * Extract query types from a query map
 */
export type QueryTypes<TMap extends TypedQueryMap<any>> = keyof TMap & string;

/**
 * Get a specific query type from a query map
 */
export type QueryType<
  TMap extends TypedQueryMap<any>,
  TType extends QueryTypes<TMap>,
> = TMap[TType];

/**
 * Factory function for creating queries
 */
export interface IQueryFactory<TQuery extends IQuery> {
  create(payload: TQuery['payload'], metadata: Partial<IQueryMetadata>): TQuery;
  validate?(query: TQuery): boolean;
}

/**
 * Query result with optional caching information
 */
export interface IQueryResult<TData = unknown> {
  readonly data: TData;
  readonly metadata?: {
    readonly fromCache?: boolean;
    readonly executionTime?: number;
    readonly [key: string]: unknown;
  };
}
