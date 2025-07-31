import type { DomainEvent } from '@graphql-microservices/shared-event-sourcing';
import { Redis } from 'ioredis';
import type { UserEventDispatcher } from '../application/event-handlers';

/**
 * Event subscription configuration
 */
export interface EventSubscriptionConfig {
  channels: string[];
  retryAttempts?: number;
  retryDelay?: number;
  batchSize?: number;
  processingTimeout?: number;
}

/**
 * Redis event subscriber for consuming domain events
 */
export class RedisEventSubscriber {
  private subscriber?: Redis;
  private isRunning = false;
  private readonly connectionString?: string;
  private readonly config: Required<EventSubscriptionConfig>;

  constructor(
    connectionString: string | undefined,
    private readonly eventDispatcher: UserEventDispatcher,
    config: EventSubscriptionConfig
  ) {
    this.connectionString = connectionString;
    this.config = {
      channels: config.channels,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      batchSize: config.batchSize || 10,
      processingTimeout: config.processingTimeout || 30000,
    };
  }

  /**
   * Start the event subscriber
   */
  async start(): Promise<void> {
    if (!this.connectionString) {
      console.warn('⚠️  No Redis connection string provided. Event subscription disabled.');
      return;
    }

    if (this.isRunning) {
      console.warn('⚠️  Event subscriber is already running');
      return;
    }

    try {
      // Create Redis subscriber instance
      this.subscriber = new Redis(this.connectionString, {
        maxRetriesPerRequest: 3,
        connectTimeout: 10000,
        commandTimeout: 5000,
        enableReadyCheck: true,
        lazyConnect: true,
      });

      // Set up error handling
      this.subscriber.on('error', (error) => {
        console.error('Redis subscriber error:', error);
      });

      this.subscriber.on('connect', () => {
        console.log('✅ Redis event subscriber connected');
      });

      this.subscriber.on('disconnect', () => {
        console.warn('⚠️  Redis event subscriber disconnected');
      });

      // Set up message handling
      this.subscriber.on('message', async (channel, message) => {
        await this.handleMessage(channel, message);
      });

      // Connect and subscribe to channels
      await this.subscriber.connect();
      await this.subscriber.subscribe(...this.config.channels);

      this.isRunning = true;

      console.log(
        `✅ Event subscriber started, listening to channels: ${this.config.channels.join(', ')}`
      );

      // Also start processing queued events
      this.startQueueProcessing();
    } catch (error) {
      console.error('❌ Failed to start Redis event subscriber:', error);
      throw error;
    }
  }

  /**
   * Stop the event subscriber
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.subscriber) {
      try {
        await this.subscriber.unsubscribe(...this.config.channels);
        await this.subscriber.quit();
        console.log('✅ Redis event subscriber stopped');
      } catch (error) {
        console.error('❌ Error stopping Redis subscriber:', error);
        // Force disconnect if graceful quit fails
        this.subscriber.disconnect();
      } finally {
        this.subscriber = undefined;
      }
    }
  }

  /**
   * Handle incoming message from Redis
   */
  private async handleMessage(channel: string, message: string): Promise<void> {
    try {
      const event = JSON.parse(message) as DomainEvent;

      console.log(`📨 Received event ${event.type} from channel ${channel}`);

      // Validate event structure
      if (!this.isValidEvent(event)) {
        console.error('❌ Invalid event structure:', event);
        return;
      }

      // Dispatch to event handlers with retry logic
      await this.processEventWithRetry(event);
    } catch (error) {
      console.error(`❌ Failed to handle message from channel ${channel}:`, error);
      console.error('Message content:', message);
    }
  }

  /**
   * Process event with retry logic
   */
  private async processEventWithRetry(event: DomainEvent, attempt: number = 1): Promise<void> {
    try {
      // Set processing timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('Event processing timeout')),
          this.config.processingTimeout
        );
      });

      const processingPromise = this.eventDispatcher.dispatch(event);

      await Promise.race([processingPromise, timeoutPromise]);

      console.log(`✅ Successfully processed event ${event.id} (${event.type})`);
    } catch (error) {
      console.error(`❌ Failed to process event ${event.id} (attempt ${attempt}):`, error);

      if (attempt < this.config.retryAttempts) {
        console.log(`🔄 Retrying event ${event.id} in ${this.config.retryDelay}ms...`);

        await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay * attempt));
        await this.processEventWithRetry(event, attempt + 1);
      } else {
        console.error(`💀 Event ${event.id} failed after ${this.config.retryAttempts} attempts`);

        // Could send to dead letter queue here
        await this.handleFailedEvent(event, error);
      }
    }
  }

  /**
   * Start processing queued events from Redis lists
   */
  private startQueueProcessing(): void {
    if (!this.subscriber) return;

    // Process events from queues every few seconds
    const processQueues = async () => {
      if (!this.isRunning || !this.subscriber) return;

      try {
        // Process events from the general events queue
        const events = await this.subscriber.brpop('events:domain.events', 1); // 1 second timeout

        if (events && events.length === 2) {
          const [, eventJson] = events;
          await this.handleMessage('events:domain.events', eventJson);
        }
      } catch (error) {
        console.error('Error processing event queue:', error);
      }

      // Schedule next processing
      if (this.isRunning) {
        setTimeout(processQueues, 1000);
      }
    };

    // Start processing
    setTimeout(processQueues, 1000);
  }

  /**
   * Validate event structure
   */
  private isValidEvent(event: {
    id: string;
    type: string;
    aggregateId: string;
    aggregateType: string;
    data: unknown;
    metadata: unknown;
    occurredAt: Date;
    version: number;
  }): event is DomainEvent {
    return (
      event &&
      typeof event.id === 'string' &&
      typeof event.type === 'string' &&
      typeof event.aggregateId === 'string' &&
      typeof event.aggregateType === 'string' &&
      typeof event.data === 'object' &&
      typeof event.metadata === 'object' &&
      event.occurredAt instanceof Date &&
      typeof event.version === 'number'
    );
  }

  /**
   * Handle failed events (could implement dead letter queue)
   */
  private async handleFailedEvent(event: DomainEvent, error: Error | string): Promise<void> {
    // Log failed event for monitoring
    console.error('Failed event details:', {
      eventId: event.id,
      eventType: event.type,
      aggregateId: event.aggregateId,
      version: event.version,
      error: error instanceof Error ? error.message : error,
      timestamp: new Date().toISOString(),
    });

    // In a production system, you might:
    // 1. Send to a dead letter queue
    // 2. Store in a failed events table
    // 3. Send alerts to monitoring systems
    // 4. Implement manual retry mechanisms
  }

  /**
   * Get subscription status
   */
  getStatus(): {
    isRunning: boolean;
    channels: string[];
    connectionStatus: string;
  } {
    return {
      isRunning: this.isRunning,
      channels: this.config.channels,
      connectionStatus: this.subscriber?.status || 'not_initialized',
    };
  }

  /**
   * Health check
   */
  async isHealthy(): Promise<boolean> {
    if (!this.subscriber || !this.isRunning) {
      return false;
    }

    try {
      const result = await this.subscriber.ping();
      return result === 'PONG';
    } catch (_error) {
      return false;
    }
  }

  /**
   * Get subscription statistics
   */
  async getStatistics(): Promise<{
    isRunning: boolean;
    subscribedChannels: string[];
    connectionStatus: string;
    uptime: number;
  }> {
    return {
      isRunning: this.isRunning,
      subscribedChannels: this.config.channels,
      connectionStatus: this.subscriber?.status || 'not_initialized',
      uptime: this.isRunning ? Date.now() : 0, // Simplified uptime tracking
    };
  }
}

/**
 * Factory function to create event subscriber with default configuration
 */
export function createUserEventSubscriber(
  connectionString: string | undefined,
  eventDispatcher: UserEventDispatcher,
  additionalChannels: string[] = []
): RedisEventSubscriber {
  const defaultChannels = [
    'user.events', // User-specific events
    'domain.events', // General domain events
    'UserCreated', // Specific event types
    'UserUpdated',
    'UserDeactivated',
    'UserReactivated',
  ];

  return new RedisEventSubscriber(connectionString, eventDispatcher, {
    channels: [...defaultChannels, ...additionalChannels],
    retryAttempts: 3,
    retryDelay: 1000,
    batchSize: 10,
    processingTimeout: 30000,
  });
}

/**
 * Mock event subscriber for testing
 */
export class MockEventSubscriber {
  private isRunning = false;
  private receivedEvents: DomainEvent[] = [];

  constructor(private readonly eventDispatcher: UserEventDispatcher) {}

  async start(): Promise<void> {
    this.isRunning = true;
    console.log('Mock event subscriber started');
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    console.log('Mock event subscriber stopped');
  }

  async simulateEvent(event: DomainEvent): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Mock subscriber is not running');
    }

    this.receivedEvents.push(event);
    await this.eventDispatcher.dispatch(event);
  }

  getReceivedEvents(): DomainEvent[] {
    return [...this.receivedEvents];
  }

  clearReceivedEvents(): void {
    this.receivedEvents = [];
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      channels: ['mock'],
      connectionStatus: 'mock',
    };
  }

  async isHealthy(): Promise<boolean> {
    return this.isRunning;
  }
}
