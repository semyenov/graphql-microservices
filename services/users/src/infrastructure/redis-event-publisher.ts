import type { IDomainEvent, IOutboxEvent } from '@graphql-microservices/event-sourcing';
import { createLogger } from '@graphql-microservices/logger';
import { Redis } from 'ioredis';

// Create logger instance
const logger = createLogger({ service: 'redis-event-publisher' });

/**
 * Event publisher interface
 */
export interface EventPublisher {
  publish(
    event: IDomainEvent,
    routingKey?: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;
  publishBatch(events: IOutboxEvent[]): Promise<void>;
  isHealthy(): Promise<boolean>;
  close(): Promise<void>;
  initialize(): Promise<void>;
}

/**
 * Redis-based event publisher for publishing domain events
 */
export class RedisEventPublisher implements EventPublisher {
  private redis?: Redis;
  private readonly connectionString?: string;

  constructor(connectionString?: string) {
    this.connectionString = connectionString;
  }

  /**
   * Initialize the Redis connection
   */
  async initialize(): Promise<void> {
    if (!this.connectionString) {
      logger.warn('⚠️  No Redis connection string provided. Events will not be published.');
      return;
    }

    try {
      this.redis = new Redis(this.connectionString, {
        maxRetriesPerRequest: 3,
        connectTimeout: 10000,
        commandTimeout: 5000,
        enableReadyCheck: true,
        lazyConnect: true,
      });

      // Set up error handling
      this.redis.on('error', (error) => {
        logger.error('Redis connection error', error);
      });

      this.redis.on('connect', () => {
        logger.info('✅ Redis event publisher connected');
      });

      this.redis.on('disconnect', () => {
        logger.warn('⚠️  Redis event publisher disconnected');
      });

      // Connect to Redis
      await this.redis.connect();
    } catch (error) {
      logger.error('❌ Failed to initialize Redis event publisher', error);
      throw error;
    }
  }

  /**
   * Publish domain events to Redis
   */
  async publish(event: IDomainEvent, routingKey: string = 'domain.events'): Promise<void> {
    if (!this.redis) {
      logger.warn('⚠️  Redis not initialized. Skipping event publishing.');
      return;
    }

    try {
      const pipeline = this.redis.pipeline();

      const eventMessage = {
        id: event.id,
        type: event.type,
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        data: event.data,
        metadata: {
          ...event.metadata,
          publishedAt: new Date().toISOString(),
          publisher: 'users-service',
        },
        occurredAt: event.occurredAt.toISOString(),
        version: event.version,
      };

      // Publish to specific channels
      const channels = [
        routingKey, // General routing key
        `${event.aggregateType.toLowerCase()}.events`, // Aggregate-specific
        `${event.type}`, // Event-type specific
        `${event.aggregateType.toLowerCase()}.${event.aggregateId}`, // Instance-specific
      ];

      for (const channel of channels) {
        pipeline.publish(channel, JSON.stringify(eventMessage));
      }

      // Also store in a list for reliable processing
      pipeline.lpush(`events:${routingKey}`, JSON.stringify(eventMessage));

      // Set expiry on the list (7 days)
      pipeline.expire(`events:${routingKey}`, 7 * 24 * 60 * 60);

      // Execute all commands
      await pipeline.exec();

      logger.info('📡 Published event to Redis channels', {
        eventType: event.type,
        aggregateId: event.aggregateId,
      });
    } catch (error) {
      logger.error('❌ Failed to publish events to Redis', error);
      throw error;
    }
  }

  /**
   * Publish events in batch (alias for publish method)
   */
  async publishBatch(events: IOutboxEvent[]): Promise<void> {
    await Promise.all(events.map((event) => this.publish(event.event)));
  }

  /**
   * Check if Redis connection is healthy
   */
  async isHealthy(): Promise<boolean> {
    if (!this.redis) {
      return false;
    }

    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed', error);
      return false;
    }
  }

  /**
   * Close the Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
        logger.info('✅ Redis event publisher connection closed');
      } catch (error) {
        logger.error('❌ Error closing Redis connection', error);
        // Force disconnect if graceful quit fails
        this.redis.disconnect();
      } finally {
        this.redis = undefined;
      }
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus():
    | 'wait'
    | 'reconnecting'
    | 'connecting'
    | 'connect'
    | 'ready'
    | 'close'
    | 'end' {
    if (!this.redis) {
      return 'wait';
    }

    return this.redis.status;
  }

  /**
   * Get Redis instance for advanced operations (use carefully)
   */
  getRedisInstance(): Redis | undefined {
    return this.redis;
  }

  /**
   * Publish a single event (convenience method)
   */
  async publishSingle(event: IDomainEvent, routingKey?: string): Promise<void> {
    await this.publish(event, routingKey);
  }

  /**
   * Get event statistics from Redis
   */
  async getEventStatistics(): Promise<{
    totalEventsProcessed: number;
    eventsByType: Record<string, number>;
    recentEvents: Record<string, unknown>[];
  }> {
    if (!this.redis) {
      throw new Error('Redis not initialized');
    }

    try {
      // Get recent events from the general events list
      const recentEventsRaw = await this.redis.lrange('events:domain.events', 0, 9);
      const recentEvents = recentEventsRaw.map((event) => JSON.parse(event));

      // Count events by type (this would need a more sophisticated implementation in production)
      const eventsByType: Record<string, number> = {};
      recentEvents.forEach((event) => {
        eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      });

      return {
        totalEventsProcessed: recentEvents.length, // This is a simplified metric
        eventsByType,
        recentEvents,
      };
    } catch (error) {
      logger.error('Failed to get event statistics', error);
      throw error;
    }
  }
}

/**
 * Factory function to create a RedisEventPublisher
 */
export function createRedisEventPublisher(connectionString?: string): RedisEventPublisher {
  return new RedisEventPublisher(connectionString);
}

/**
 * Mock event publisher for testing
 */
export class MockEventPublisher implements EventPublisher {
  private publishedEvents: IDomainEvent[] = [];
  private healthy = true;

  async initialize(): Promise<void> {
    logger.info('Mock event publisher initialized');
  }

  async publish(event: DomainEvent, routingKey?: string): Promise<void> {
    this.publishedEvents.push(event);
    logger.info('Mock published event', { routingKey });
  }

  async publishBatch(events: IOutboxEvent[]): Promise<void> {
    await Promise.all(events.map((event) => this.publish(event.event)));
  }

  async isHealthy(): Promise<boolean> {
    return this.healthy;
  }

  async close(): Promise<void> {
    logger.info('Mock event publisher closed');
  }

  // Test helpers
  getPublishedEvents(): IDomainEvent[] {
    return [...this.publishedEvents];
  }

  clearPublishedEvents(): void {
    this.publishedEvents = [];
  }

  setHealthy(healthy: boolean): void {
    this.healthy = healthy;
  }
}
