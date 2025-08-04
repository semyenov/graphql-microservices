import {
  type AsyncResult,
  type DomainError,
  domainError,
  Result,
  validationError,
} from '@graphql-microservices/shared-result';
import { z } from 'zod';
import { addSpanAttributes, createSpan, recordQueryMetrics } from './tracing-utils';
import type { IQuery, IQueryHandler, QueryMetadata } from './types';

/**
 * Type-safe query map for compile-time safety
 */
export type TypedQueryMap<T extends Record<string, IQuery<unknown>>> = T;

/**
 * Helper to define query maps
 */
export type DefineQueryMap<T extends Record<string, IQuery<unknown>>> = {
  [K in keyof T]: T[K] extends IQuery<unknown> ? T[K] : never;
};

/**
 * Extract query types from query map
 */
export type QueryMapTypes<T extends TypedQueryMap<any>> = keyof T;

/**
 * Extract query union from query map
 */
export type QueryMapUnion<T extends TypedQueryMap<any>> = T[keyof T];

/**
 * Query middleware interface
 */
export interface QueryMiddleware<
  TQueryMap extends TypedQueryMap<Record<string, IQuery<unknown>>> = TypedQueryMap<
    Record<string, IQuery<unknown>>
  >,
> {
  /**
   * Called before query execution
   */
  preExecute?: <K extends keyof TQueryMap>(
    query: TQueryMap[K],
    queryType: K
  ) => AsyncResult<void, DomainError>;

  /**
   * Called after successful query execution
   */
  postExecute?: <K extends keyof TQueryMap, TResult = unknown>(
    query: TQueryMap[K],
    queryType: K,
    result: TResult
  ) => AsyncResult<void, DomainError>;

  /**
   * Called when query execution fails
   */
  onError?: <K extends keyof TQueryMap>(
    query: TQueryMap[K],
    queryType: K,
    error: DomainError
  ) => AsyncResult<void, DomainError>;
}

/**
 * Query execution context
 */
export interface QueryContext {
  queryId: string;
  queryType: string;
  userId?: string;
  correlationId?: string;
  startTime: number;
  cacheKey?: string;
  cacheTtl?: number;
}

/**
 * Query caching configuration
 */
export interface QueryCacheConfig {
  /**
   * Default TTL in milliseconds
   */
  defaultTtl: number;

  /**
   * Maximum cache size (number of entries)
   */
  maxSize: number;

  /**
   * Cache key generator
   */
  keyGenerator?: <K extends keyof any>(queryType: K, query: any) => string;

  /**
   * Enable cache warming
   */
  enableWarming?: boolean;
}

/**
 * Query bus options
 */
export interface QueryBusOptions {
  /**
   * Enable query validation
   */
  validateQueries?: boolean;

  /**
   * Enable tracing
   */
  enableTracing?: boolean;

  /**
   * Enable metrics
   */
  enableMetrics?: boolean;

  /**
   * Query timeout in milliseconds
   */
  queryTimeout?: number;

  /**
   * Service name for tracing
   */
  serviceName?: string;

  /**
   * Enable query caching
   */
  enableCaching?: boolean;

  /**
   * Cache configuration
   */
  cacheConfig?: QueryCacheConfig;

  /**
   * Enable pagination support
   */
  enablePagination?: boolean;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
  cursor?: string;
}

/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
  data: T[];
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextCursor?: string;
  previousCursor?: string;
}

/**
 * Type-safe query bus for dispatching queries to their handlers
 */
export class QueryBus<
  TQueryMap extends TypedQueryMap<Record<string, IQuery<unknown>>> = TypedQueryMap<
    Record<string, IQuery<unknown>>
  >,
> {
  private readonly handlers = new Map<keyof TQueryMap, IQueryHandler<any, any>>();
  private readonly middlewares: QueryMiddleware<TQueryMap>[] = [];
  private readonly options: Required<QueryBusOptions>;
  private readonly querySchemas = new Map<keyof TQueryMap, z.ZodSchema>();
  private readonly cache = new Map<string, { data: unknown; expiry: number }>();

  constructor(options: QueryBusOptions = {}) {
    this.options = {
      validateQueries: true,
      enableTracing: true,
      enableMetrics: true,
      queryTimeout: 30000, // 30 seconds default
      serviceName: 'query-bus',
      enableCaching: false,
      enablePagination: true,
      cacheConfig: {
        defaultTtl: 300000, // 5 minutes
        maxSize: 1000,
        enableWarming: false,
      },
      ...options,
    };
  }

  /**
   * Register a query handler with type safety
   */
  register<K extends keyof TQueryMap, TResult = unknown>(
    queryType: K,
    handler: IQueryHandler<TQueryMap[K], TResult>,
    schema?: z.ZodSchema
  ): this {
    if (this.handlers.has(queryType)) {
      throw new Error(`Handler already registered for query type: ${String(queryType)}`);
    }

    this.handlers.set(queryType, handler);

    if (schema) {
      this.querySchemas.set(queryType, schema);
    }

    return this;
  }

  /**
   * Register a query handler using builder pattern
   */
  withHandler<K extends keyof TQueryMap, TResult = unknown>(
    queryType: K,
    handler: IQueryHandler<TQueryMap[K], TResult>,
    schema?: z.ZodSchema
  ): this {
    return this.register(queryType, handler, schema);
  }

  /**
   * Add middleware
   */
  use(middleware: QueryMiddleware<TQueryMap>): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Execute a query with Result type
   */
  async execute<K extends keyof TQueryMap, TResult = unknown>(
    queryType: K,
    query: TQueryMap[K]
  ): AsyncResult<TResult, DomainError> {
    const q = query as unknown as IQuery<unknown>;
    const context: QueryContext = {
      queryId: this.generateQueryId(),
      queryType: String(queryType),
      userId: q.metadata?.userId,
      correlationId: q.metadata?.correlationId,
      startTime: Date.now(),
    };

    // Generate cache key if caching is enabled
    if (this.options.enableCaching) {
      context.cacheKey = this.generateCacheKey(queryType, query);

      // Check cache first
      const cached = this.getFromCache<TResult>(context.cacheKey);
      if (cached !== null) {
        return Result.ok(cached);
      }
    }

    // Validate query if enabled
    if (this.options.validateQueries) {
      const validationResult = this.validateQuery(queryType, query);
      if (Result.isErr(validationResult)) {
        return validationResult;
      }
    }

    // Get handler
    const handler = this.handlers.get(queryType);
    if (!handler) {
      return Result.err(
        domainError(
          'HANDLER_NOT_FOUND',
          `No handler registered for query type: ${String(queryType)}`
        )
      );
    }

    // Execute with tracing if enabled
    if (this.options.enableTracing) {
      return this.executeWithTracing(queryType, query, handler, context);
    }

    // Execute with middleware
    return this.executeWithMiddleware(queryType, query, handler, context);
  }

  /**
   * Execute multiple queries in parallel
   */
  async executeParallel<K extends keyof TQueryMap>(
    queries: Array<{ type: K; query: TQueryMap[K] }>
  ): AsyncResult<unknown[], DomainError[]> {
    const promises = queries.map(({ type, query }) => this.execute(type, query));
    const results = await Promise.all(promises);

    const errors = results.filter(Result.isErr).map((r) => r.error);
    if (errors.length > 0) {
      return Result.err(errors);
    }

    const values = results.filter(Result.isOk).map((r) => r.value);
    return Result.ok(values);
  }

  /**
   * Execute paginated query
   */
  async executePaginated<K extends keyof TQueryMap, TItem = unknown>(
    queryType: K,
    query: TQueryMap[K] & { pagination?: PaginationParams },
    totalCountQuery?: K
  ): AsyncResult<PaginatedResult<TItem>, DomainError> {
    if (!this.options.enablePagination) {
      return Result.err(domainError('PAGINATION_DISABLED', 'Pagination is not enabled'));
    }

    const pagination = query.pagination || {};
    const limit = pagination.limit || 10;
    const offset = pagination.offset || 0;

    // Execute main query
    const dataResult = await this.execute(queryType, query);
    if (Result.isErr(dataResult)) {
      return dataResult;
    }

    const data = dataResult.value as TItem[];

    // Execute count query if provided
    let totalCount = data.length;
    if (totalCountQuery) {
      const countResult = await this.execute(totalCountQuery, query);
      if (Result.isOk(countResult)) {
        totalCount = countResult.value as number;
      }
    }

    return Result.ok({
      data,
      totalCount,
      hasNextPage: offset + limit < totalCount,
      hasPreviousPage: offset > 0,
      nextCursor: offset + limit < totalCount ? String(offset + limit) : undefined,
      previousCursor: offset > 0 ? String(Math.max(0, offset - limit)) : undefined,
    });
  }

  /**
   * Warm cache for frequently accessed queries
   */
  async warmCache<K extends keyof TQueryMap>(
    queryType: K,
    queries: TQueryMap[K][]
  ): AsyncResult<void, DomainError> {
    if (!this.options.enableCaching || !this.options.cacheConfig?.enableWarming) {
      return Result.ok(undefined);
    }

    const promises = queries.map((query) => this.execute(queryType, query));
    const results = await Promise.all(promises);

    const errors = results.filter(Result.isErr);
    if (errors.length > 0) {
      return Result.err(
        domainError('CACHE_WARMING_FAILED', 'Some queries failed during cache warming')
      );
    }

    return Result.ok(undefined);
  }

  /**
   * Invalidate cache entries matching a pattern
   */
  invalidateCache(pattern: string): void {
    if (!this.options.enableCaching) return;

    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check if a handler is registered for a query type
   */
  hasHandler(queryType: keyof TQueryMap): boolean {
    return this.handlers.has(queryType);
  }

  /**
   * Get all registered query types
   */
  getRegisteredTypes(): Array<keyof TQueryMap> {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clear all handlers (useful for testing)
   */
  clearHandlers(): void {
    this.handlers.clear();
    this.querySchemas.clear();
  }

  /**
   * Clear all middleware
   */
  clearMiddleware(): void {
    this.middlewares.length = 0;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number; maxSize: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track hits/misses
      maxSize: this.options.cacheConfig!.maxSize,
    };
  }

  /**
   * Validate query structure
   */
  private validateQuery<K extends keyof TQueryMap>(
    queryType: K,
    query: TQueryMap[K]
  ): Result<void, DomainError> {
    // Check basic structure
    if (!query || typeof query !== 'object') {
      return Result.err(validationError([{ field: 'query', message: 'Query must be an object' }]));
    }

    const q = query as unknown as IQuery<unknown>;
    if (!('type' in query) || q.type !== queryType) {
      return Result.err(
        validationError([
          {
            field: 'type',
            message: `Query type mismatch. Expected ${String(queryType)}, got ${q.type}`,
          },
        ])
      );
    }

    // Check schema if available
    const schema = this.querySchemas.get(queryType);
    if (schema) {
      const parseResult = schema.safeParse(query);
      if (!parseResult.success) {
        const fieldErrors = parseResult.error.issues.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        return Result.err(validationError(fieldErrors));
      }
    }

    return Result.ok(undefined);
  }

  /**
   * Execute query with tracing
   */
  private async executeWithTracing<K extends keyof TQueryMap, TResult>(
    queryType: K,
    query: TQueryMap[K],
    handler: IQueryHandler<TQueryMap[K], TResult>,
    context: QueryContext
  ): AsyncResult<TResult, DomainError> {
    return createSpan(`query.${String(queryType)}`, async (span) => {
      // Add span attributes
      addSpanAttributes({
        'query.type': String(queryType),
        'query.id': context.queryId,
        'query.user_id': context.userId || '',
        'query.correlation_id': context.correlationId || '',
        'query.cache_key': context.cacheKey || '',
      });

      // Execute with middleware
      const result = await this.executeWithMiddleware<K, TResult>(
        queryType,
        query,
        handler,
        context
      );

      // Add result to span
      if (Result.isOk(result)) {
        span.setStatus({ code: 1 }); // OK
      } else {
        span.setStatus({ code: 2, message: result.error.message }); // ERROR
        span.recordException(new Error(result.error.message));
      }

      return result;
    });
  }

  /**
   * Execute query with middleware
   */
  private async executeWithMiddleware<K extends keyof TQueryMap, TResult>(
    queryType: K,
    query: TQueryMap[K],
    handler: IQueryHandler<TQueryMap[K], TResult>,
    context: QueryContext
  ): AsyncResult<TResult, DomainError> {
    // Pre-execution middleware
    for (const middleware of this.middlewares) {
      if (middleware.preExecute) {
        const result = await middleware.preExecute(query, queryType);
        if (Result.isErr(result)) {
          return result;
        }
      }
    }

    // Execute query with timeout
    const executionResult = await this.executeWithTimeout<TResult>(
      () => handler.execute(query),
      this.options.queryTimeout
    );

    if (Result.isErr(executionResult)) {
      // Error middleware
      for (const middleware of this.middlewares) {
        if (middleware.onError) {
          await middleware.onError(query, queryType, executionResult.error);
        }
      }
      return executionResult;
    }

    // Cache result if caching is enabled
    if (this.options.enableCaching && context.cacheKey) {
      this.setCache(context.cacheKey, executionResult.value);
    }

    // Post-execution middleware
    for (const middleware of this.middlewares) {
      if (middleware.postExecute) {
        const result = await middleware.postExecute(query, queryType, executionResult.value);
        if (Result.isErr(result)) {
          return result;
        }
      }
    }

    // Record metrics if enabled
    if (this.options.enableMetrics) {
      const duration = Date.now() - context.startTime;
      recordQueryMetrics(
        String(queryType),
        duration,
        true,
        Array.isArray(executionResult.value) ? executionResult.value.length : undefined,
        { service: this.options.serviceName }
      );
    }

    return executionResult;
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<TResult>(
    fn: () => Promise<TResult>,
    timeout: number
  ): AsyncResult<TResult, DomainError> {
    return Promise.race([
      Result.tryCatchAsync(fn, (error) =>
        domainError('QUERY_EXECUTION_ERROR', 'Query execution failed', error)
      ),
      new Promise<Result<TResult, DomainError>>((resolve) =>
        setTimeout(
          () =>
            resolve(Result.err(domainError('QUERY_TIMEOUT', `Query timed out after ${timeout}ms`))),
          timeout
        )
      ),
    ]);
  }

  /**
   * Generate query ID
   */
  private generateQueryId(): string {
    return `query_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate cache key
   */
  private generateCacheKey<K extends keyof TQueryMap>(queryType: K, query: TQueryMap[K]): string {
    if (this.options.cacheConfig?.keyGenerator) {
      return this.options.cacheConfig.keyGenerator(queryType, query);
    }

    // Default cache key generation
    const queryStr = JSON.stringify({ queryType, query });
    return `query:${String(queryType)}:${Buffer.from(queryStr).toString('base64').substring(0, 32)}`;
  }

  /**
   * Get value from cache
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set value in cache
   */
  private setCache(key: string, data: unknown, ttl?: number): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.options.cacheConfig!.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const expiry = Date.now() + (ttl || this.options.cacheConfig!.defaultTtl);
    this.cache.set(key, { data, expiry });
  }
}

/**
 * Create a typed query bus
 */
export function createQueryBus<TQueryMap extends TypedQueryMap<Record<string, IQuery<unknown>>>>(
  options?: QueryBusOptions
): QueryBus<TQueryMap> {
  return new QueryBus<TQueryMap>(options);
}

/**
 * Create a test query bus with recording capabilities
 */
export function createTestQueryBus<
  TQueryMap extends TypedQueryMap<Record<string, IQuery<unknown>>>,
>(
  options?: QueryBusOptions
): QueryBus<TQueryMap> & {
  getRecordedQueries(): Array<{ type: keyof TQueryMap; query: IQuery }>;
  clearRecordedQueries(): void;
} {
  const recordedQueries: Array<{ type: keyof TQueryMap; query: IQuery }> = [];

  const bus = new QueryBus<TQueryMap>(options);

  // Add recording middleware
  bus.use({
    preExecute: async (query, queryType) => {
      recordedQueries.push({ type: queryType, query });
      return Result.ok(undefined);
    },
  });

  return Object.assign(bus, {
    getRecordedQueries: () => [...recordedQueries],
    clearRecordedQueries: () => {
      recordedQueries.length = 0;
    },
  });
}

/**
 * Query validation schemas
 */
export const queryMetadataSchema = z.object({
  userId: z.string().optional(),
  correlationId: z.string().optional(),
  timestamp: z.date().optional(),
});

export const baseQuerySchema = z.object({
  type: z.string(),
  parameters: z.unknown(),
  metadata: queryMetadataSchema.optional(),
});

export const paginationSchema = z.object({
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  cursor: z.string().optional(),
});

/**
 * Create a validated query factory
 */
export function createValidatedQuery<T extends z.ZodSchema>(
  type: string,
  parametersSchema: T,
  parameters: z.infer<T>,
  metadata?: QueryMetadata
): Result<IQuery<z.infer<T>>, DomainError> {
  const parseResult = parametersSchema.safeParse(parameters);

  if (!parseResult.success) {
    const fieldErrors = parseResult.error.issues.map((err: any) => ({
      field: `parameters.${err.path.join('.')}`,
      message: err.message,
    }));
    return Result.err(validationError(fieldErrors));
  }

  return Result.ok({
    type,
    parameters: parseResult.data,
    metadata,
  });
}
