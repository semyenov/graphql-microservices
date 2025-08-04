import { generateId } from '@graphql-microservices/shared-errors';
import type { IQuery, IQueryMetadata } from '../types/query.js';

/**
 * Default query metadata factory
 */
export function createQueryMetadata(overrides?: Partial<IQueryMetadata>): IQueryMetadata {
  return {
    correlationId: generateId(),
    timestamp: new Date(),
    source: 'unknown',
    cacheable: false,
    ...overrides,
  };
}

/**
 * Query factory for creating queries
 */
export class QueryFactory {
  /**
   * Create a query with metadata
   */
  static create<TType extends string, TPayload>(
    type: TType,
    payload: TPayload,
    metadata?: Partial<IQueryMetadata>
  ): IQuery<TType, TPayload> {
    return {
      type,
      payload,
      metadata: createQueryMetadata(metadata),
    };
  }

  /**
   * Create a cacheable query
   */
  static createCacheable<TType extends string, TPayload>(
    type: TType,
    payload: TPayload,
    cacheTTL?: number,
    metadata?: Partial<IQueryMetadata>
  ): IQuery<TType, TPayload> {
    return {
      type,
      payload,
      metadata: createQueryMetadata({
        ...metadata,
        cacheable: true,
        cacheTTL,
      }),
    };
  }

  /**
   * Create a query with custom cache key
   */
  static createWithCacheKey<TType extends string, TPayload>(
    type: TType,
    payload: TPayload,
    cacheKey: string,
    cacheTTL?: number,
    metadata?: Partial<IQueryMetadata>
  ): IQuery<TType, TPayload> {
    return {
      type,
      payload,
      metadata: createQueryMetadata({
        ...metadata,
        cacheable: true,
        cacheKey,
        cacheTTL,
      }),
    };
  }

  /**
   * Create a query from a request context
   */
  static createFromContext<TType extends string, TPayload>(
    type: TType,
    payload: TPayload,
    context: {
      userId?: string;
      correlationId?: string;
      source?: string;
      [key: string]: unknown;
    }
  ): IQuery<TType, TPayload> {
    return {
      type,
      payload,
      metadata: createQueryMetadata({
        userId: context.userId,
        correlationId: context.correlationId,
        source: context.source || 'api',
        ...context,
      }),
    };
  }
}

/**
 * Type-safe query builder
 */
export class QueryBuilder<TType extends string, TPayload> {
  private type: TType;
  private payload?: TPayload;
  private metadata: Partial<IQueryMetadata> = {};

  constructor(type: TType) {
    this.type = type;
  }

  withPayload(payload: TPayload): this {
    this.payload = payload;
    return this;
  }

  withMetadata(metadata: Partial<IQueryMetadata>): this {
    this.metadata = { ...this.metadata, ...metadata };
    return this;
  }

  withUserId(userId: string): this {
    this.metadata.userId = userId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.metadata.correlationId = correlationId;
    return this;
  }

  withSource(source: string): this {
    this.metadata.source = source;
    return this;
  }

  withCaching(ttl?: number): this {
    this.metadata.cacheable = true;
    if (ttl) {
      this.metadata.cacheTTL = ttl;
    }
    return this;
  }

  withCacheKey(key: string): this {
    this.metadata.cacheKey = key;
    this.metadata.cacheable = true;
    return this;
  }

  build(): IQuery<TType, TPayload> {
    if (this.payload === undefined) {
      throw new Error('Payload is required');
    }

    return QueryFactory.create(this.type, this.payload, this.metadata);
  }
}

/**
 * Create a query builder
 */
export function queryBuilder<TType extends string, TPayload>(
  type: TType
): QueryBuilder<TType, TPayload> {
  return new QueryBuilder<TType, TPayload>(type);
}

/**
 * Common cache TTL values (in milliseconds)
 */
export const CacheTTL = {
  SHORT: 30 * 1000, // 30 seconds
  MEDIUM: 5 * 60 * 1000, // 5 minutes
  LONG: 30 * 60 * 1000, // 30 minutes
  HOUR: 60 * 60 * 1000, // 1 hour
  DAY: 24 * 60 * 60 * 1000, // 1 day
} as const;
