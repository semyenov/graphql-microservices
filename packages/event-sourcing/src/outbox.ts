import type { DomainEvent } from './types';

/**
 * Outbox event status
 */
export enum OutboxEventStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
}

/**
 * Outbox event entry
 */
export interface OutboxEvent {
  /** Unique identifier for the outbox entry */
  readonly id: string;

  /** The domain event to be published */
  readonly event: DomainEvent;

  /** Current status of the event */
  readonly status: OutboxEventStatus;

  /** Number of retry attempts */
  readonly retryCount: number;

  /** Maximum number of retries allowed */
  readonly maxRetries: number;

  /** When the event was created */
  readonly createdAt: Date;

  /** When the event was last updated */
  readonly updatedAt: Date;

  /** When to next attempt processing (for failed events) */
  readonly nextRetryAt?: Date;

  /** Last error message (if failed) */
  readonly lastError?: string;

  /** Event routing key for message brokers */
  readonly routingKey?: string;

  /** Additional metadata for publishing */
  readonly publishMetadata?: Record<string, unknown>;
}

/**
 * Outbox configuration
 */
export interface OutboxConfig {
  /** Maximum number of retry attempts */
  maxRetries?: number;

  /** Initial retry delay in milliseconds */
  initialRetryDelay?: number;

  /** Exponential backoff multiplier */
  retryBackoffMultiplier?: number;

  /** Maximum retry delay in milliseconds */
  maxRetryDelay?: number;

  /** Batch size for processing events */
  batchSize?: number;

  /** Processing interval in milliseconds */
  processingInterval?: number;
}

/**
 * Event publisher interface
 */
export interface EventPublisher {
  /**
   * Publish a domain event
   * @param event The domain event to publish
   * @param routingKey Optional routing key for message brokers
   * @param metadata Additional metadata for publishing
   * @returns Promise resolving when the event is published
   */
  publish(
    event: DomainEvent,
    routingKey?: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;

  /**
   * Publish multiple events in a batch
   * @param events The events to publish
   * @returns Promise resolving when all events are published
   */
  publishBatch(events: OutboxEvent[]): Promise<void>;
}

/**
 * Outbox store interface for persisting outbox events
 */
export interface OutboxStore {
  /**
   * Add events to the outbox
   * @param events Events to add
   * @returns Promise resolving when events are stored
   */
  addEvents(events: DomainEvent[], routingKey?: string): Promise<void>;

  /**
   * Get pending events for processing
   * @param limit Maximum number of events to retrieve
   * @returns Promise resolving to pending events
   */
  getPendingEvents(limit?: number): Promise<OutboxEvent[]>;

  /**
   * Mark events as processing
   * @param eventIds Event IDs to mark as processing
   * @returns Promise resolving when events are updated
   */
  markAsProcessing(eventIds: string[]): Promise<void>;

  /**
   * Mark events as published
   * @param eventIds Event IDs to mark as published
   * @returns Promise resolving when events are updated
   */
  markAsPublished(eventIds: string[]): Promise<void>;

  /**
   * Mark events as failed
   * @param eventIds Event IDs to mark as failed
   * @param error Error message
   * @returns Promise resolving when events are updated
   */
  markAsFailed(eventIds: string[], error: string): Promise<void>;

  /**
   * Get failed events that are ready for retry
   * @param limit Maximum number of events to retrieve
   * @returns Promise resolving to failed events ready for retry
   */
  getFailedEventsForRetry(limit?: number): Promise<OutboxEvent[]>;

  /**
   * Clean up old published events
   * @param olderThan Delete events published before this date
   * @returns Promise resolving to the number of deleted events
   */
  cleanupPublishedEvents(olderThan: Date): Promise<number>;
}

/**
 * Outbox processor for reliably publishing events
 */
export class OutboxProcessor {
  private readonly config: Required<OutboxConfig>;
  private readonly outboxStore: OutboxStore;
  private readonly eventPublisher: EventPublisher;
  private processingInterval?: NodeJS.Timeout;
  private isProcessing = false;

  constructor(outboxStore: OutboxStore, eventPublisher: EventPublisher, config: OutboxConfig = {}) {
    this.config = {
      maxRetries: 5,
      initialRetryDelay: 1000, // 1 second
      retryBackoffMultiplier: 2,
      maxRetryDelay: 300000, // 5 minutes
      batchSize: 10,
      processingInterval: 5000, // 5 seconds
      ...config,
    };

    this.outboxStore = outboxStore;
    this.eventPublisher = eventPublisher;
  }

  /**
   * Start the outbox processor
   */
  start(): void {
    if (this.processingInterval) {
      return; // Already started
    }

    this.processingInterval = setInterval(
      () => this.processEvents(),
      this.config.processingInterval
    );

    console.log('Outbox processor started');
  }

  /**
   * Stop the outbox processor
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
      console.log('Outbox processor stopped');
    }
  }

  /**
   * Process pending and failed events manually
   */
  async processEvents(): Promise<void> {
    if (this.isProcessing) {
      return; // Already processing
    }

    this.isProcessing = true;

    try {
      await Promise.all([this.processPendingEvents(), this.processFailedEvents()]);
    } catch (error) {
      console.error('Error processing outbox events:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process pending events
   */
  private async processPendingEvents(): Promise<void> {
    const pendingEvents = await this.outboxStore.getPendingEvents(this.config.batchSize);

    if (pendingEvents.length === 0) {
      return;
    }

    const eventIds = pendingEvents.map((e) => e.id);

    try {
      // Mark as processing
      await this.outboxStore.markAsProcessing(eventIds);

      // Publish events
      await this.eventPublisher.publishBatch(pendingEvents);

      // Mark as published
      await this.outboxStore.markAsPublished(eventIds);

      console.log(`Successfully published ${pendingEvents.length} events`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.outboxStore.markAsFailed(eventIds, errorMessage);
      console.error(`Failed to publish ${pendingEvents.length} events:`, error);
    }
  }

  /**
   * Process failed events that are ready for retry
   */
  private async processFailedEvents(): Promise<void> {
    const failedEvents = await this.outboxStore.getFailedEventsForRetry(this.config.batchSize);

    if (failedEvents.length === 0) {
      return;
    }

    console.log(`Retrying ${failedEvents.length} failed events`);

    for (const event of failedEvents) {
      try {
        // Mark as processing
        await this.outboxStore.markAsProcessing([event.id]);

        // Publish single event
        await this.eventPublisher.publish(event.event, event.routingKey, event.publishMetadata);

        // Mark as published
        await this.outboxStore.markAsPublished([event.id]);

        console.log(`Successfully republished event ${event.id}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.outboxStore.markAsFailed([event.id], errorMessage);
        console.error(`Failed to republish event ${event.id}:`, error);
      }
    }
  }

  /**
   * Calculate next retry time with exponential backoff
   */
  static calculateNextRetryTime(retryCount: number, config: Required<OutboxConfig>): Date {
    const delay = Math.min(
      config.initialRetryDelay * config.retryBackoffMultiplier ** retryCount,
      config.maxRetryDelay
    );

    return new Date(Date.now() + delay);
  }
}

/**
 * Utility class for working with the outbox pattern
 */
export const OutboxUtils = {
  /**
   * Create an outbox event from a domain event
   */
  createOutboxEvent(
    event: DomainEvent,
    routingKey?: string,
    publishMetadata?: Record<string, unknown>,
    maxRetries: number = 5
  ): Omit<OutboxEvent, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      event,
      status: OutboxEventStatus.PENDING,
      retryCount: 0,
      maxRetries,
      routingKey,
      publishMetadata,
    };
  },

  /**
   * Check if an event has exceeded maximum retries
   */
  hasExceededMaxRetries(event: OutboxEvent): boolean {
    return event.retryCount >= event.maxRetries;
  },

  /**
   * Check if a failed event is ready for retry
   */
  isReadyForRetry(event: OutboxEvent): boolean {
    if (event.status !== OutboxEventStatus.FAILED) {
      return false;
    }

    if (OutboxUtils.hasExceededMaxRetries(event)) {
      return false;
    }

    if (!event.nextRetryAt) {
      return true;
    }

    return new Date() >= event.nextRetryAt;
  },
};
