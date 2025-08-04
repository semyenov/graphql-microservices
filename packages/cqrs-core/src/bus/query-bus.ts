import { createLogger } from '@graphql-microservices/logger';
import type { AsyncResult, DomainError } from '@graphql-microservices/shared-result';
import { domainError, Result, validationError } from '@graphql-microservices/shared-result';
import type { z } from 'zod';
import type { IBusConfig, IQueryBus } from '../types/bus.js';
import type { IHandlerContext, IQueryHandler } from '../types/handler.js';
import type { IQueryMiddleware, MiddlewareNext } from '../types/middleware.js';
import type { IQuery, IQueryResult, QueryType, QueryTypes, TypedQueryMap } from '../types/query.js';

const logger = createLogger({ service: 'query-bus' });

/**
 * Cache interface for query results
 */
export interface IQueryCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * In-memory cache implementation
 */
export class InMemoryQueryCache implements IQueryCache {
  private cache = new Map<string, { value: any; expires: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl: number = 60000): Promise<void> {
    this.cache.set(key, {
      value,
      expires: Date.now() + ttl,
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}

/**
 * Query bus configuration
 */
export interface QueryBusConfig extends IBusConfig {
  /**
   * Query cache implementation
   */
  cache?: IQueryCache;

  /**
   * Default cache TTL in milliseconds
   */
  defaultCacheTTL?: number;

  /**
   * Whether to cache errors
   */
  cacheErrors?: boolean;
}

/**
 * Default query bus configuration
 */
const defaultConfig: Required<QueryBusConfig> = {
  enableMetrics: true,
  enableTracing: true,
  enableLogging: true,
  defaultTimeout: 30000,
  maxRetries: 0,
  middleware: [],
  cache: new InMemoryQueryCache(),
  defaultCacheTTL: 60000,
  cacheErrors: false,
};

/**
 * Query handler registry entry
 */
interface HandlerEntry<TQuery extends IQuery, TResult> {
  handler: IQueryHandler<TQuery, TResult>;
  schema?: z.ZodSchema;
  metadata?: {
    name?: string;
    tags?: string[];
  };
}

/**
 * Query execution context with timing
 */
interface ExecutionContext extends IHandlerContext {
  queryType: string;
  queryId: string;
  startTime: number;
  attempt: number;
  cacheKey?: string;
}

/**
 * Type-safe query bus implementation with caching
 */
export class QueryBus<TQueryMap extends TypedQueryMap<any>> implements IQueryBus<TQueryMap> {
  private readonly handlers = new Map<QueryTypes<TQueryMap>, HandlerEntry<any, any>>();
  private readonly middleware: IQueryMiddleware[] = [];
  private readonly config: Required<QueryBusConfig>;

  constructor(config: QueryBusConfig = {}) {
    this.config = { ...defaultConfig, ...config };
    if (Array.isArray(this.config.middleware)) {
      this.middleware.push(...(this.config.middleware as IQueryMiddleware[]));
    }
  }

  /**
   * Execute a query
   */
  async execute<K extends QueryTypes<TQueryMap>, TResult = unknown>(
    type: K,
    query: QueryType<TQueryMap, K>,
    context?: IHandlerContext
  ): AsyncResult<IQueryResult<TResult>, DomainError> {
    const executionContext: ExecutionContext = {
      queryType: type,
      queryId: query.metadata.correlationId,
      correlationId: query.metadata.correlationId,
      userId: query.metadata.userId,
      source: query.metadata.source,
      startTime: Date.now(),
      attempt: 1,
      cacheKey: query.metadata.cacheKey,
    };

    if (this.config.enableLogging) {
      logger.info('Executing query', {
        type,
        correlationId: query.metadata.correlationId,
        userId: query.metadata.userId,
        cacheable: query.metadata.cacheable,
      });
    }

    // Check cache if query is cacheable
    if (query.metadata.cacheable && this.config.cache) {
      const cacheKey = this.getCacheKey(type, query);
      const cached = await this.config.cache.get<IQueryResult<TResult>>(cacheKey);

      if (cached) {
        if (this.config.enableLogging) {
          logger.info('Query result from cache', {
            type,
            cacheKey,
            duration: Date.now() - executionContext.startTime,
          });
        }

        // Return cached result with metadata
        return Result.ok({
          ...cached,
          metadata: {
            ...cached.metadata,
            fromCache: true,
            executionTime: Date.now() - executionContext.startTime,
          },
        });
      }

      executionContext.cacheKey = cacheKey;
    }

    // Validate query
    const validationResult = await this.validateQuery(type, query);
    if (Result.isErr(validationResult)) {
      if (this.config.enableLogging) {
        logger.error('Query validation failed', validationResult.error);
      }
      return validationResult;
    }

    // Get handler
    const entry = this.handlers.get(type);
    if (!entry) {
      const error = domainError(
        'HANDLER_NOT_FOUND',
        `No handler registered for query type: ${type}`
      );
      if (this.config.enableLogging) {
        logger.error('Handler not found', error);
      }
      return Result.err(error);
    }

    // Execute with middleware pipeline
    const result = await this.executeWithMiddleware(query, entry.handler, executionContext);

    // Cache successful results if cacheable
    if (
      Result.isOk(result) &&
      query.metadata.cacheable &&
      executionContext.cacheKey &&
      this.config.cache
    ) {
      const ttl = query.metadata.cacheTTL || this.config.defaultCacheTTL;
      await this.config.cache.set(executionContext.cacheKey, result.value, ttl);

      if (this.config.enableLogging) {
        logger.info('Query result cached', {
          type,
          cacheKey: executionContext.cacheKey,
          ttl,
        });
      }
    }

    // Cache errors if configured
    if (
      Result.isErr(result) &&
      this.config.cacheErrors &&
      query.metadata.cacheable &&
      executionContext.cacheKey &&
      this.config.cache
    ) {
      const ttl = Math.min(query.metadata.cacheTTL || this.config.defaultCacheTTL, 5000); // Shorter TTL for errors
      await this.config.cache.set(executionContext.cacheKey, result, ttl);
    }

    // Record metrics
    if (this.config.enableMetrics) {
      const duration = Date.now() - executionContext.startTime;
      this.recordMetrics(type, duration, Result.isOk(result), false);
    }

    if (this.config.enableLogging) {
      if (Result.isOk(result)) {
        logger.info('Query executed successfully', {
          type,
          duration: Date.now() - executionContext.startTime,
          fromCache: false,
        });
      } else {
        logger.error('Query execution failed', result.error);
      }
    }

    return result;
  }

  /**
   * Register a query handler
   */
  register<K extends QueryTypes<TQueryMap>, TResult = unknown>(
    type: K,
    handler: IQueryHandler<QueryType<TQueryMap, K>, TResult>,
    options?: {
      schema?: z.ZodSchema;
      metadata?: { name?: string; tags?: string[] };
    }
  ): void {
    if (this.handlers.has(type)) {
      throw new Error(`Handler already registered for query type: ${type}`);
    }

    this.handlers.set(type, {
      handler,
      schema: options?.schema,
      metadata: options?.metadata,
    });

    if (this.config.enableLogging) {
      logger.info('Query handler registered', { type });
    }
  }

  /**
   * Add middleware
   */
  use(middleware: IQueryMiddleware): void {
    this.middleware.push(middleware);
  }

  /**
   * Remove middleware by name
   */
  remove(middlewareName: string): void {
    const index = this.middleware.findIndex((m: any) => m.name === middlewareName);
    if (index !== -1) {
      this.middleware.splice(index, 1);
    }
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    if (this.config.cache) {
      await this.config.cache.clear();
    }
  }

  /**
   * Check if handler is registered
   */
  hasHandler(type: QueryTypes<TQueryMap>): boolean {
    return this.handlers.has(type);
  }

  /**
   * Get registered query types
   */
  getRegisteredTypes(): QueryTypes<TQueryMap>[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clear all handlers (useful for testing)
   */
  clearHandlers(): void {
    this.handlers.clear();
  }

  /**
   * Get cache key for query
   */
  private getCacheKey<K extends QueryTypes<TQueryMap>>(
    type: K,
    query: QueryType<TQueryMap, K>
  ): string {
    if (query.metadata.cacheKey) {
      return query.metadata.cacheKey;
    }

    // Generate cache key from type and payload
    const payloadKey = JSON.stringify(query.payload);
    return `query:${type}:${payloadKey}`;
  }

  /**
   * Validate query
   */
  private async validateQuery<K extends QueryTypes<TQueryMap>>(
    type: K,
    query: QueryType<TQueryMap, K>
  ): AsyncResult<void, DomainError> {
    // Check query structure
    if (!query || typeof query !== 'object') {
      return Result.err(validationError([{ field: 'query', message: 'Query must be an object' }]));
    }

    if (query.type !== type) {
      return Result.err(
        validationError([
          {
            field: 'type',
            message: `Query type mismatch. Expected ${type}, got ${query.type}`,
          },
        ])
      );
    }

    if (!query.metadata || typeof query.metadata !== 'object') {
      return Result.err(
        validationError([{ field: 'metadata', message: 'Query metadata is required' }])
      );
    }

    // Validate against schema if provided
    const entry = this.handlers.get(type);
    if (entry?.schema) {
      const parseResult = entry.schema.safeParse(query);
      if (!parseResult.success) {
        const fieldErrors = parseResult.error.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        return Result.err(validationError(fieldErrors));
      }
    }

    return Result.ok(undefined);
  }

  /**
   * Execute with middleware pipeline
   */
  private async executeWithMiddleware<TQuery extends IQuery, TResult>(
    query: TQuery,
    handler: IQueryHandler<TQuery, TResult>,
    context: ExecutionContext
  ): AsyncResult<IQueryResult<TResult>, DomainError> {
    // Build middleware chain
    const chain = this.middleware.reduceRight<MiddlewareNext<TQuery, IQueryResult<TResult>>>(
      (next, middleware) => async (qry) => {
        return middleware.execute(qry, next, context);
      },
      async (qry) => {
        // Apply timeout if configured
        if (this.config.defaultTimeout > 0) {
          return this.executeWithTimeout(
            () => handler.execute(qry, context),
            this.config.defaultTimeout
          );
        }
        return handler.execute(qry, context);
      }
    );

    // Execute chain with retry logic
    let lastError: DomainError | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (attempt > 0 && this.config.enableLogging) {
        logger.info('Retrying query execution', {
          type: query.type,
          attempt,
          maxRetries: this.config.maxRetries,
        });
      }

      const result = await chain(query);
      if (Result.isOk(result)) {
        return result;
      }

      lastError = result.error;

      // Don't retry validation errors
      if (lastError.code === 'VALIDATION_ERROR') {
        return result;
      }
    }

    return Result.err(lastError || domainError('UNKNOWN_ERROR', 'Query execution failed'));
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<TResult>(
    fn: () => AsyncResult<IQueryResult<TResult>, DomainError>,
    timeout: number
  ): AsyncResult<IQueryResult<TResult>, DomainError> {
    return Promise.race([
      fn(),
      new Promise<Result<IQueryResult<TResult>, DomainError>>((resolve) =>
        setTimeout(
          () => resolve(Result.err(domainError('TIMEOUT', `Query timed out after ${timeout}ms`))),
          timeout
        )
      ),
    ]);
  }

  /**
   * Record metrics
   */
  private recordMetrics(
    queryType: string,
    duration: number,
    success: boolean,
    fromCache: boolean
  ): void {
    // This would integrate with your metrics system
    // For now, just log in development
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Query metrics', {
        queryType,
        duration,
        success,
        fromCache,
      });
    }
  }
}

/**
 * Create a typed query bus
 */
export function createQueryBus<TQueryMap extends TypedQueryMap<any>>(
  config?: QueryBusConfig
): QueryBus<TQueryMap> {
  return new QueryBus<TQueryMap>(config);
}
