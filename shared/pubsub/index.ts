import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis, { type RedisOptions } from 'ioredis';

export interface PubSubConfig {
  redisUrl?: string;
  connectionOptions?: RedisOptions;
}

/**
 * Creates a Redis-based PubSub instance for GraphQL subscriptions
 * This enables real-time communication across microservices
 */
export class PubSubService {
  private pubsub: RedisPubSub;
  private publisher: Redis;
  private subscriber: Redis;

  constructor(config: PubSubConfig = {}) {
    const redisUrl = config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    const connectionOptions = config.connectionOptions || {};

    // Create separate Redis connections for publisher and subscriber
    this.publisher = new Redis(redisUrl, {
      ...connectionOptions,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.subscriber = new Redis(redisUrl, {
      ...connectionOptions,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.pubsub = new RedisPubSub({
      publisher: this.publisher,
      subscriber: this.subscriber,
    });
  }

  /**
   * Get the PubSub instance for use in resolvers
   */
  getPubSub() {
    return this.pubsub;
  }

  /**
   * Publish an event with typed payload
   */
  async publish<T = unknown>(triggerName: string, payload: T): Promise<void> {
    await this.pubsub.publish(triggerName, payload);
  }

  /**
   * Subscribe to events (returns AsyncIterator for GraphQL subscriptions)
   */
  asyncIterator<T = unknown>(triggers: string | string[]): AsyncIterator<T> {
    return this.pubsub.asyncIterator(triggers);
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    await this.publisher.quit();
    await this.subscriber.quit();
  }
}

// Event trigger constants for type safety
export const SUBSCRIPTION_EVENTS = {
  // User events
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',

  // Product events
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_STOCK_CHANGED: 'PRODUCT_STOCK_CHANGED',
  PRODUCT_DEACTIVATED: 'PRODUCT_DEACTIVATED',

  // Order events
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  ORDER_REFUNDED: 'ORDER_REFUNDED',
} as const;

export type SubscriptionEvent = (typeof SUBSCRIPTION_EVENTS)[keyof typeof SUBSCRIPTION_EVENTS];

// Type definitions for subscription payloads
export interface UserCreatedPayload {
  userCreated: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
}

export interface ProductUpdatedPayload {
  productUpdated: {
    id: string;
    name: string;
    price: number;
    stock: number;
  };
}

export interface OrderStatusChangedPayload {
  orderStatusChanged: {
    id: string;
    orderNumber: string;
    status: string;
    userId: string;
  };
}
