import type { DomainEvent } from '@graphql-microservices/event-sourcing';
import Redis from 'ioredis';
import type { ProductEventDispatcher } from '../application/event-handlers';

/**
 * Event subscription configuration
 */
export interface EventSubscriptionConfig {
  channels: string[];
  handler?: (event: DomainEvent) => Promise<void>;
}

/**
 * Redis-based event subscriber for Products service
 * Subscribes to domain events from Redis pub/sub channels
 */
export class RedisEventSubscriber {
  private redis?: Redis;
  private isConnected: boolean = false;
  private subscriptions: Map<string, EventSubscriptionConfig> = new Map();

  constructor(
    private readonly redisUrl: string | undefined,
    private readonly eventDispatcher: ProductEventDispatcher
  ) {}

  /**
   * Start the event subscriber
   */
  async start(): Promise<void> {
    await this.initialize();
  }

  /**
   * Stop the event subscriber
   */
  async stop(): Promise<void> {
    await this.close();
  }

  /**
   * Initialize the Redis connection and subscriptions
   */
  async initialize(): Promise<void> {
    if (!this.redisUrl) {
      console.warn('Redis URL not provided, event subscription will be disabled');
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
        console.log('📡 Redis event subscriber connected');
        this.isConnected = true;
      });

      this.redis.on('error', (error) => {
        console.error('❌ Redis event subscriber error:', error);
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        console.log('🔌 Redis event subscriber disconnected');
        this.isConnected = false;
      });

      // Set up default subscriptions
      this.setupDefaultSubscriptions();

      // Handle incoming messages
      this.redis.on('message', async (channel, message) => {
        await this.handleMessage(channel, message);
      });

      // Subscribe to channels
      await this.subscribeToChannels();

      // Test connection
      await this.redis.ping();
      this.isConnected = true;
    } catch (error) {
      console.error('Failed to initialize Redis event subscriber:', error);
      throw error;
    }
  }

  /**
   * Set up default channel subscriptions
   */
  private setupDefaultSubscriptions(): void {
    // Subscribe to product-specific events
    this.addSubscription('product.events', {
      channels: ['product.events'],
    });

    // Subscribe to specific event types
    this.addSubscription('product.created', {
      channels: ['product.created'],
    });

    this.addSubscription('product.stock', {
      channels: ['product.stock.changed', 'inventory.updates'],
    });

    this.addSubscription('product.price', {
      channels: ['product.price.changed', 'pricing.updates'],
    });

    this.addSubscription('product.status', {
      channels: ['product.status.changed'],
    });

    this.addSubscription('product.reservations', {
      channels: ['product.reservations', 'inventory.reservations'],
    });

    // Subscribe to cross-service events
    this.addSubscription('cross-service', {
      channels: [
        'cross-service.user.events',
        'cross-service.order.events',
        'cross-service.inventory.requests',
      ],
      handler: this.handleCrossServiceEvent.bind(this),
    });

    // Subscribe to order events that affect inventory
    this.addSubscription('order.events', {
      channels: ['order.created', 'order.cancelled', 'order.status.changed'],
      handler: this.handleOrderEvent.bind(this),
    });
  }

  /**
   * Add a subscription configuration
   */
  addSubscription(name: string, config: EventSubscriptionConfig): void {
    this.subscriptions.set(name, config);
  }

  /**
   * Subscribe to all configured channels
   */
  private async subscribeToChannels(): Promise<void> {
    if (!this.redis) return;

    const allChannels = new Set<string>();

    for (const config of this.subscriptions.values()) {
      config.channels.forEach((channel) => allChannels.add(channel));
    }

    const channelsArray = Array.from(allChannels);

    if (channelsArray.length > 0) {
      await this.redis.subscribe(...channelsArray);
      console.log(`📥 Subscribed to channels: ${channelsArray.join(', ')}`);
    }
  }

  /**
   * Handle incoming message from Redis
   */
  private async handleMessage(channel: string, message: string): Promise<void> {
    try {
      const event = JSON.parse(message) as DomainEvent;

      console.log(`📨 Received event ${event.type} (${event.id}) from channel ${channel}`);

      // Find subscriptions that include this channel
      const matchingSubscriptions = Array.from(this.subscriptions.values()).filter((config) =>
        config.channels.includes(channel)
      );

      // Process event with custom handlers if available
      for (const subscription of matchingSubscriptions) {
        if (subscription.handler) {
          await subscription.handler(event);
        } else {
          // Default handling: dispatch to event handlers if it's a product event
          if (event.aggregateType === 'Product') {
            await this.eventDispatcher.dispatch(event);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to handle message from channel ${channel}:`, error);
    }
  }

  /**
   * Handle cross-service events
   */
  private async handleCrossServiceEvent(event: DomainEvent): Promise<void> {
    console.log(`🔄 Handling cross-service event: ${event.type}`);

    switch (event.type) {
      case 'UserDeactivated':
        // Could trigger product review removal or other actions
        console.log(`User ${event.aggregateId} deactivated - checking for related products`);
        break;

      case 'OrderCreated':
        // Could trigger stock reservation
        console.log(`Order created - checking product availability`);
        break;

      default:
        console.log(`Unhandled cross-service event type: ${event.type}`);
    }
  }

  /**
   * Handle order events that affect inventory
   */
  private async handleOrderEvent(event: DomainEvent): Promise<void> {
    console.log(`📦 Handling order event: ${event.type}`);

    switch (event.type) {
      case 'OrderCreated':
        // Reserve stock for order items
        // This would typically trigger commands to reserve stock
        console.log(`Order ${event.aggregateId} created - reserving stock`);
        break;

      case 'OrderCancelled':
        // Release stock reservations
        console.log(`Order ${event.aggregateId} cancelled - releasing stock reservations`);
        break;

      case 'OrderStatusChanged': {
        const data = event.data as { newStatus: string; previousStatus: string };
        if (data.newStatus === 'shipped') {
          // Confirm stock reservation and reduce actual stock
          console.log(`Order ${event.aggregateId} shipped - confirming stock reduction`);
        }
        break;
      }

      default:
        console.log(`Unhandled order event type: ${event.type}`);
    }
  }

  /**
   * Check if the subscriber is healthy
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
   * Get subscriber statistics
   */
  async getStatistics(): Promise<{
    connected: boolean;
    subscriptions: string[];
    channels: string[];
  }> {
    const allChannels = new Set<string>();

    for (const config of this.subscriptions.values()) {
      config.channels.forEach((channel) => allChannels.add(channel));
    }

    return {
      connected: this.isConnected,
      subscriptions: Array.from(this.subscriptions.keys()),
      channels: Array.from(allChannels),
    };
  }

  /**
   * Unsubscribe from a specific channel
   */
  async unsubscribe(channel: string): Promise<void> {
    if (!this.redis) return;

    await this.redis.unsubscribe(channel);
    console.log(`📤 Unsubscribed from channel: ${channel}`);
  }

  /**
   * Unsubscribe from all channels
   */
  async unsubscribeAll(): Promise<void> {
    if (!this.redis) return;

    await this.redis.unsubscribe();
    console.log('📤 Unsubscribed from all channels');
  }

  /**
   * Close the Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.unsubscribeAll();
      await this.redis.quit();
      this.redis = undefined;
      this.isConnected = false;
      console.log('🔌 Redis event subscriber closed');
    }
  }
}
