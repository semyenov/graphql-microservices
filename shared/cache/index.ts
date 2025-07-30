import Redis from 'ioredis';

type CacheKey<T extends string = string> = `${T}:${string}`;

export class CacheService {
  private redis: Redis | null = null;

  constructor(redisUrl: string) {
    if (redisUrl) {
      this.redis = new Redis(redisUrl);
      this.redis.on('error', (err: Error) => {
        console.error('Redis connection error:', err);
      });
    }
  }

  async get<T>(key: CacheKey): Promise<T | null> {
    if (!this.redis) {
      return null;
    }

    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: CacheKey, value: T, ttlSeconds?: number): Promise<void> {
    if (!this.redis || !ttlSeconds) return;

    try {
      const serialized = JSON.stringify(value);
      await this.redis.setex(key, ttlSeconds, serialized);
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
    }
  }

  async delete(key: CacheKey): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.del(key);
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
    }
  }

  async invalidatePattern(pattern: CacheKey): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error(`Cache invalidate pattern error for ${pattern}:`, error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

// Cache key builders
export const cacheKeys = {
  user: (id: string) => `user:${id}`,
  userByEmail: (email: string) => `user:email:${email}`,
  userByUsername: (username: string) => `user:username:${username}`,
  product: (id: string) => `product:${id}`,
  productBySku: (sku: string) => `product:sku:${sku}`,
  order: (id: string) => `order:${id}`,
  ordersByUser: (userId: string) => `orders:user:${userId}`,
} satisfies Record<string, (...args: string[]) => CacheKey>;

// Default TTL values (in seconds)
export const cacheTTL: Record<string, number> = {
  user: 3600, // 1 hour
  product: 3600, // 1 hour
  order: 300, // 5 minutes
};
