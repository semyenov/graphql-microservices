/**
 * Type-safe cache key templates and utilities
 */

/**
 * Template literal type for cache keys
 * Ensures consistent key format across services
 */
export type CacheKeyTemplate = `${string}:${string}`;

/**
 * Cache key builder with type safety
 */
export class CacheKeyBuilder<TPrefix extends string> {
  constructor(private readonly prefix: TPrefix) {}

  /**
   * Create a simple key with one segment
   */
  key<T extends string>(segment: T): `${TPrefix}:${T}` {
    return `${this.prefix}:${segment}`;
  }

  /**
   * Create a key with multiple segments
   */
  keys<T extends string[]>(...segments: T): `${TPrefix}:${string}` {
    return `${this.prefix}:${segments.join(':')}` as `${TPrefix}:${string}`;
  }

  /**
   * Create a key with dynamic values
   */
  template<TSegments extends readonly string[]>(
    ...segments: TSegments
  ): (...values: { [K in keyof TSegments]: string | number }) => CacheKeyTemplate {
    return (...values) => {
      const key = segments
        .map((segment, index) => {
          const value = values[index];
          return segment.includes('{}')
            ? segment.replace('{}', String(value))
            : `${segment}:${value}`;
        })
        .join(':');
      return `${this.prefix}:${key}`;
    };
  }
}

/**
 * Common cache key patterns
 */
export const CachePatterns = {
  /**
   * Entity by ID: service:entity:id
   */
  entity: <TService extends string, TEntity extends string>(
    service: TService,
    entity: TEntity,
    id: string | number
  ): CacheKeyTemplate => `${service}:${entity}:${id}`,

  /**
   * Entity by field: service:entity:field:value
   */
  entityByField: <TService extends string, TEntity extends string, TField extends string>(
    service: TService,
    entity: TEntity,
    field: TField,
    value: string | number
  ): CacheKeyTemplate => `${service}:${entity}:${field}:${value}`,

  /**
   * List with pagination: service:entities:page:limit
   */
  list: <TService extends string, TEntity extends string>(
    service: TService,
    entity: TEntity,
    page: number,
    limit: number
  ): CacheKeyTemplate => `${service}:${entity}:list:${page}:${limit}`,

  /**
   * Filtered list: service:entities:filter:hash
   */
  filteredList: <TService extends string, TEntity extends string>(
    service: TService,
    entity: TEntity,
    filterHash: string
  ): CacheKeyTemplate => `${service}:${entity}:filter:${filterHash}`,

  /**
   * Search results: service:search:query:hash
   */
  search: <TService extends string>(service: TService, queryHash: string): CacheKeyTemplate =>
    `${service}:search:${queryHash}`,

  /**
   * User-specific data: service:user:userId:resource
   */
  userResource: <TService extends string, TResource extends string>(
    service: TService,
    userId: string,
    resource: TResource
  ): CacheKeyTemplate => `${service}:user:${userId}:${resource}`,

  /**
   * Aggregated data: service:stats:type:period
   */
  stats: <TService extends string, TType extends string>(
    service: TService,
    type: TType,
    period: string
  ): CacheKeyTemplate => `${service}:stats:${type}:${period}`,
};

/**
 * Cache TTL presets in seconds
 */
export const CacheTTL = {
  /** 1 minute - for frequently changing data */
  SHORT: 60,

  /** 5 minutes - default for most queries */
  MEDIUM: 300,

  /** 15 minutes - for relatively stable data */
  LONG: 900,

  /** 1 hour - for stable reference data */
  HOUR: 3600,

  /** 1 day - for very stable data */
  DAY: 86400,

  /** 1 week - for rarely changing data */
  WEEK: 604800,
} as const;

/**
 * Cache invalidation patterns
 */
export const CacheInvalidationPatterns = {
  /**
   * Invalidate all keys matching a pattern
   */
  pattern: (pattern: string): string => `${pattern}*`,

  /**
   * Invalidate all keys for an entity
   */
  entity: <TService extends string, TEntity extends string>(
    service: TService,
    entity: TEntity,
    id: string | number
  ): string => `${service}:${entity}:${id}*`,

  /**
   * Invalidate all lists for an entity type
   */
  allLists: <TService extends string, TEntity extends string>(
    service: TService,
    entity: TEntity
  ): string => `${service}:${entity}:list:*`,

  /**
   * Invalidate all user-specific data
   */
  userAll: <TService extends string>(service: TService, userId: string): string =>
    `${service}:user:${userId}:*`,
};

/**
 * Hash function for creating cache keys from objects
 */
export function hashObject(obj: Record<string, unknown>): string {
  const sorted = Object.keys(obj)
    .sort()
    .reduce(
      (acc, key) => {
        if (obj[key] !== undefined && obj[key] !== null) {
          acc[key] = obj[key];
        }
        return acc;
      },
      {} as Record<string, unknown>
    );

  return Buffer.from(JSON.stringify(sorted)).toString('base64').replace(/[/+=]/g, '');
}
