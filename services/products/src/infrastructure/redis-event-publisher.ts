import type {
  IDomainEvent,
  IEventPublisher,
  IOutboxEvent,
} from '@graphql-microservices/event-sourcing';
import Redis from 'ioredis';

/**
 * Redis-based event publisher for Products service
 * Publishes domain events to Redis pub/sub channels
 */
export class RedisEventPublisher implements IEventPublisher {
  private redis?: Redis;
  private isConnected: boolean = false;

  constructor(private readonly redisUrl?: string) {}

  /**
   * Initialize the Redis connection
   */
  async initialize(): Promise<void> {
    if (!this.redisUrl) {
      console.warn('Redis URL not provided, event publishing will be disabled');
      return;
    }

    try {
      this.redis = new Redis(this.redisUrl, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
      });

      // Handle connection events
      this.redis.on('connect', () => {
        console.log('📡 Redis event publisher connected');
        this.isConnected = true;
      });

      this.redis.on('error', (error) => {
        console.error('❌ Redis event publisher error:', error);
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        console.log('🔌 Redis event publisher disconnected');
        this.isConnected = false;
      });

      // Test connection
      await this.redis.ping();
      this.isConnected = true;
    } catch (error) {
      console.error('Failed to initialize Redis event publisher:', error);
      throw error;
    }
  }

  /**
   * Publish a single event
   */
  async publish(event: IDomainEvent, routingKey?: string): Promise<void> {
    if (!this.redis || !this.isConnected) {
      console.warn('Redis not connected, skipping event publishing');
      return;
    }

    const channels = this.getChannelsForEvent(event, routingKey);
    const payload = JSON.stringify({
      id: event.id,
      type: event.type,
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      data: event.data,
      metadata: event.metadata,
      occurredAt: event.occurredAt,
      version: event.version,
    });

    try {
      // Publish to all relevant channels
      await Promise.all(
        channels.map((channel) =>
          this.redis!.publish(channel, payload).catch((error) => {
            console.error(`Failed to publish to channel ${channel}:`, error);
            throw error;
          })
        )
      );

      console.log(
        `📨 Published event ${event.type} (${event.id}) to channels: ${channels.join(', ')}`
      );
    } catch (error) {
      console.error('Failed to publish event:', error);
      throw error;
    }
  }

  /**
   * Publish multiple events in batch
   */
  async publishBatch(events: IOutboxEvent[]): Promise<void> {
    if (!this.redis || !this.isConnected) {
      console.warn('Redis not connected, skipping batch event publishing');
      return;
    }

    // Use Redis pipeline for better performance
    const pipeline = this.redis.pipeline();

    for (const outboxEvent of events) {
      const channels = this.getChannelsForEvent(outboxEvent.event, outboxEvent.routingKey);
      const payload = JSON.stringify({
        id: outboxEvent.event.id,
        type: outboxEvent.event.type,
        aggregateId: outboxEvent.event.aggregateId,
        aggregateType: outboxEvent.event.aggregateType,
        data: outboxEvent.event.data,
        metadata: outboxEvent.event.metadata,
        occurredAt: outboxEvent.event.occurredAt,
        version: outboxEvent.event.version,
      });

      for (const channel of channels) {
        pipeline.publish(channel, payload);
      }
    }

    try {
      await pipeline.exec();
      console.log(`📨 Published batch of ${events.length} events`);
    } catch (error) {
      console.error('Failed to publish event batch:', error);
      throw error;
    }
  }

  /**
   * Get channels to publish event to based on event type and routing key
   */
  private getChannelsForEvent(event: IDomainEvent, routingKey?: string): string[] {
    const channels: string[] = [];

    // Default channel based on routing key
    if (routingKey) {
      channels.push(routingKey);
    }

    // Service-specific channel
    channels.push('product.events');

    // Event type specific channel
    channels.push(`product.events.${event.type.toLowerCase()}`);

    // Aggregate-specific channel
    channels.push(`product.${event.aggregateId}.events`);

    // Special channels for specific event types
    switch (event.type) {
      case 'ProductCreated':
        channels.push('product.created');
        break;
      case 'ProductStockChanged':
        channels.push('product.stock.changed');
        channels.push('inventory.updates');
        break;
      case 'ProductPriceChanged':
        channels.push('product.price.changed');
        channels.push('pricing.updates');
        break;
      case 'ProductDeactivated':
      case 'ProductReactivated':
        channels.push('product.status.changed');
        break;
      case 'ProductStockReserved':
      case 'ProductStockReservationReleased':
        channels.push('product.reservations');
        channels.push('inventory.reservations');
        break;
    }

    // Cross-service integration channels
    if (event.type === 'ProductStockChanged' || event.type === 'ProductDeactivated') {
      channels.push('cross-service.product.updates');
    }

    return [...new Set(channels)]; // Remove duplicates
  }

  /**
   * Check if the publisher is healthy
   */
  async isHealthy(): Promise<boolean> {
    if (!this.redis || !this.isConnected) {
      return false;
    }

    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get publisher statistics
   */
  async getStatistics(): Promise<{
    connected: boolean;
    redisUrl?: string;
  }> {
    return {
      connected: this.isConnected,
      redisUrl: this.redisUrl ? this.redisUrl.replace(/:[^:]*@/, ':****@') : undefined,
    };
  }

  /**
   * Close the Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = undefined;
      this.isConnected = false;
      console.log('🔌 Redis event publisher closed');
    }
  }
}
