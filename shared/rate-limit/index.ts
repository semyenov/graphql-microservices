import type { GraphQLFieldResolver, OperationDefinitionNode } from 'graphql';
import { GraphQLError } from 'graphql';
import Redis from 'ioredis';
import { type IRateLimiterRedisOptions, RateLimiterRedis } from 'rate-limiter-flexible';

export interface RateLimitConfig {
  redisUrl?: string;
  defaultPoints?: number; // Number of requests
  defaultDuration?: number; // Per duration in seconds
  defaultBlockDuration?: number; // Block duration in seconds
}

export interface RateLimitOptions {
  points?: number;
  duration?: number;
  blockDuration?: number;
  keyPrefix?: string;
  skipIf?: (context: unknown) => boolean;
}

export class RateLimitService {
  private redis: Redis;
  private limiters: Map<string, RateLimiterRedis>;
  private defaultConfig: Required<Omit<RateLimitConfig, 'redisUrl'>>;

  constructor(config: RateLimitConfig = {}) {
    const redisUrl = config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl);
    this.limiters = new Map();

    this.defaultConfig = {
      defaultPoints: config.defaultPoints || 100,
      defaultDuration: config.defaultDuration || 60, // 1 minute
      defaultBlockDuration: config.defaultBlockDuration || 60, // 1 minute
    };
  }

  /**
   * Create or get a rate limiter instance
   */
  private getLimiter(key: string, options: RateLimitOptions): RateLimiterRedis {
    const limiterKey = `${key}:${options.points}:${options.duration}`;

    if (!this.limiters.has(limiterKey)) {
      const limiterOptions: IRateLimiterRedisOptions = {
        storeClient: this.redis,
        keyPrefix: options.keyPrefix || 'rl',
        points: options.points || this.defaultConfig.defaultPoints,
        duration: options.duration || this.defaultConfig.defaultDuration,
        blockDuration: options.blockDuration || this.defaultConfig.defaultBlockDuration,
      };

      this.limiters.set(limiterKey, new RateLimiterRedis(limiterOptions));
    }

    return this.limiters.get(limiterKey) as RateLimiterRedis;
  }

  /**
   * Rate limit directive for GraphQL schemas
   */
  get directive() {
    return `directive @rateLimit(
      points: Int
      duration: Int
      blockDuration: Int
      keyPrefix: String
    ) on FIELD_DEFINITION`;
  }

  /**
   * Create a rate limit wrapper for resolvers
   */
  createWrapper(options: RateLimitOptions = {}) {
    return <TSource, TContext, TArgs>(
      resolver: GraphQLFieldResolver<TSource, TContext, TArgs>
    ): GraphQLFieldResolver<TSource, TContext, TArgs> => {
      return async (source, args, context, info) => {
        // Skip rate limiting if condition is met
        if (options.skipIf && options.skipIf(context)) {
          return resolver(source, args, context, info);
        }

        // Determine the key for rate limiting
        const key = this.getKey(
          context as {
            user?: { userId: string };
            req?: { ip: string; headers: Record<string, string> };
          },
          info as { fieldName: string; operation: OperationDefinitionNode }
        );
        const limiter = this.getLimiter(info.fieldName, options);

        try {
          await limiter.consume(key);
          return resolver(source, args, context, info);
        } catch (rejRes) {
          throw new GraphQLError(
            `Too many requests. Please retry after ${Math.round((rejRes as { msBeforeNext: number }).msBeforeNext / 1000)} seconds.`,
            {
              extensions: {
                code: 'RATE_LIMITED',
                retryAfter: (rejRes as { msBeforeNext: number }).msBeforeNext,
                limit: options.points || this.defaultConfig.defaultPoints,
                remaining: (rejRes as { remainingPoints: number }).remainingPoints || 0,
                resetAt: new Date(
                  Date.now() + (rejRes as { msBeforeNext: number }).msBeforeNext
                ).toISOString(),
              },
            }
          );
        }
      };
    };
  }

  /**
   * Get the rate limit key based on context
   */
  private getKey(
    context: { user?: { userId: string }; req?: { ip: string; headers: Record<string, string> } },
    info: { fieldName: string; operation: OperationDefinitionNode }
  ): string {
    // Use user ID if authenticated
    if (context.user?.userId) {
      return `user:${context.user.userId}:${info.fieldName}:${info.operation.name?.value}`;
    }

    // Use IP address if available
    if (context.req?.ip) {
      return `ip:${context.req.ip}:${info.fieldName}:${info.operation.name?.value}`;
    }

    // Use a combination of headers as fallback
    const forwarded = context.req?.headers?.['x-forwarded-for'];
    const realIp = context.req?.headers?.['x-real-ip'];
    const cfIp = context.req?.headers?.['cf-connecting-ip'];

    return `anon:${forwarded || realIp || cfIp || 'unknown'}:${info.fieldName}:${info.operation.name?.value}`;
  }

  /**
   * Apply rate limiting to specific operations
   */
  async checkLimit(key: string, operation: string, options: RateLimitOptions = {}): Promise<void> {
    const limiter = this.getLimiter(operation, options);

    try {
      await limiter.consume(key);
    } catch (rejRes) {
      throw new GraphQLError(
        `Rate limit exceeded for ${operation}. Retry after ${Math.round((rejRes as { msBeforeNext: number }).msBeforeNext / 1000)} seconds.`,
        {
          extensions: {
            code: 'RATE_LIMITED',
            operation,
            retryAfter: (rejRes as { msBeforeNext: number }).msBeforeNext,
          },
        }
      );
    }
  }

  /**
   * Get current rate limit status for a key
   */
  async getStatus(
    key: string,
    operation: string,
    options: RateLimitOptions = {}
  ): Promise<{
    limit: number;
    remaining: number;
    resetAt: string | null;
  }> {
    const limiter = this.getLimiter(operation, options);
    const res = await limiter.get(key);

    return {
      limit: options.points || this.defaultConfig.defaultPoints,
      remaining: res ? res.remainingPoints : options.points || this.defaultConfig.defaultPoints,
      resetAt: res ? new Date(Date.now() + res.msBeforeNext).toISOString() : null,
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  async reset(key: string, operation: string): Promise<void> {
    const limiter = this.getLimiter(operation, {});
    await limiter.delete(key);
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}

// Preset rate limit configurations
export const RATE_LIMIT_PRESETS = {
  // Strict limits for sensitive operations
  AUTH: {
    points: 5,
    duration: 300, // 5 attempts per 5 minutes
    blockDuration: 900, // Block for 15 minutes
  },

  // Moderate limits for mutations
  MUTATION: {
    points: 30,
    duration: 60, // 30 requests per minute
    blockDuration: 300, // Block for 5 minutes
  },

  // Relaxed limits for queries
  QUERY: {
    points: 100,
    duration: 60, // 100 requests per minute
    blockDuration: 60, // Block for 1 minute
  },

  // Very relaxed limits for public queries
  PUBLIC: {
    points: 200,
    duration: 60, // 200 requests per minute
    blockDuration: 30, // Block for 30 seconds
  },

  // Strict limits for expensive operations
  EXPENSIVE: {
    points: 10,
    duration: 300, // 10 requests per 5 minutes
    blockDuration: 600, // Block for 10 minutes
  },
};

// Helper function to apply rate limiting to resolver maps
export function applyRateLimiting(
  resolvers: Record<string, Record<string, unknown>>,
  rateLimitService: RateLimitService,
  config: Record<string, RateLimitOptions> = {}
): Record<string, Record<string, unknown>> {
  const wrappedResolvers = { ...resolvers };

  // Apply to Query resolvers
  if (wrappedResolvers.Query) {
    Object.keys(wrappedResolvers.Query).forEach((field) => {
      const fieldConfig = config[`Query.${field}`] || RATE_LIMIT_PRESETS.QUERY;
      if (wrappedResolvers.Query) {
        wrappedResolvers.Query[field] = rateLimitService.createWrapper(fieldConfig)(
          wrappedResolvers.Query[field] as GraphQLFieldResolver<unknown, unknown, unknown>
        );
      }
    });
  }

  // Apply to Mutation resolvers
  if (wrappedResolvers.Mutation) {
    Object.keys(wrappedResolvers.Mutation).forEach((field) => {
      const fieldConfig = config[`Mutation.${field}`] || RATE_LIMIT_PRESETS.MUTATION;
      if (wrappedResolvers.Mutation) {
        wrappedResolvers.Mutation[field] = rateLimitService.createWrapper(fieldConfig)(
          wrappedResolvers.Mutation[field] as GraphQLFieldResolver<unknown, unknown, unknown>
        );
      }
    });
  }

  // Apply to Subscription resolvers
  if (wrappedResolvers.Subscription) {
    Object.keys(wrappedResolvers.Subscription).forEach((field) => {
      const fieldConfig = config[`Subscription.${field}`] || RATE_LIMIT_PRESETS.QUERY;
      const fieldResolver = wrappedResolvers.Subscription?.[field];
      const originalSubscribe =
        (fieldResolver as Record<string, unknown>)?.subscribe ||
        (fieldResolver as GraphQLFieldResolver<unknown, unknown, unknown>);

      if (wrappedResolvers.Subscription) {
        wrappedResolvers.Subscription[field] = {
          ...(fieldResolver as Record<string, unknown>),
          subscribe: rateLimitService.createWrapper(fieldConfig)(
            originalSubscribe as GraphQLFieldResolver<unknown, unknown, unknown>
          ),
        };
      }
    });
  }

  return wrappedResolvers;
}
