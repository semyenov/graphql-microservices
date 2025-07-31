import { z } from 'zod';

/**
 * Base domain event interface
 */
export interface DomainEvent {
  /** Unique event identifier */
  readonly id: string;

  /** Type of the event (e.g., 'UserCreated', 'OrderShipped') */
  readonly type: string;

  /** Aggregate ID this event belongs to */
  readonly aggregateId: string;

  /** Aggregate type (e.g., 'User', 'Order', 'Product') */
  readonly aggregateType: string;

  /** Event payload/data */
  readonly data: Record<string, unknown>;

  /** Event metadata */
  readonly metadata: EventMetadata;

  /** Timestamp when the event occurred */
  readonly occurredAt: Date;

  /** Version of the aggregate when this event was created */
  readonly version: number;
}

/**
 * Event metadata for tracing and auditing
 */
export interface EventMetadata {
  /** User ID who triggered the event */
  readonly userId?: string;

  /** Correlation ID for request tracing */
  readonly correlationId?: string;

  /** Causation ID (ID of the command that caused this event) */
  readonly causationId?: string;

  /** Service that generated the event */
  readonly source: string;

  /** Additional context information */
  readonly context?: Record<string, unknown>;
}

/**
 * Event stream position
 */
export interface StreamPosition {
  /** Global position in the event store */
  readonly globalPosition: bigint;

  /** Position within the aggregate stream */
  readonly streamPosition: number;
}

/**
 * Stored event with position information
 */
export interface StoredEvent extends DomainEvent {
  /** Position in the event stream */
  readonly position: StreamPosition;

  /** When the event was stored */
  readonly storedAt: Date;
}

/**
 * Event store query options
 */
export interface EventStoreQuery {
  /** Filter by aggregate ID */
  aggregateId?: string;

  /** Filter by aggregate type */
  aggregateType?: string;

  /** Filter by event type */
  eventType?: string;

  /** Start from this position */
  fromPosition?: bigint;

  /** Maximum number of events to return */
  limit?: number;

  /** Filter by time range */
  timeRange?: {
    from?: Date;
    to?: Date;
  };
}

/**
 * Aggregate root base class
 */
export abstract class AggregateRoot {
  protected readonly _id: string;
  protected _version: number = 0;
  protected readonly _uncommittedEvents: DomainEvent[] = [];

  constructor(id: string, version: number = 0) {
    this._id = id;
    this._version = version;
  }

  get id(): string {
    return this._id;
  }

  get version(): number {
    return this._version;
  }

  get uncommittedEvents(): readonly DomainEvent[] {
    return this._uncommittedEvents;
  }

  /**
   * Apply an event to this aggregate
   */
  protected applyEvent(event: DomainEvent): void {
    this._uncommittedEvents.push(event);
    this._version++;
    this.applyEventData(event);
  }

  /**
   * Apply event data to aggregate state (to be implemented by subclasses)
   */
  protected abstract applyEventData(event: DomainEvent): void;

  /**
   * Load aggregate from historical events
   */
  public static fromEvents<T extends AggregateRoot>(
    AggregateConstructor: new (id: string, version: number) => T,
    events: DomainEvent[]
  ): T {
    if (events.length === 0) {
      throw new Error('Cannot create aggregate from empty event stream');
    }

    const firstEvent = events[0];
    if (!firstEvent) {
      throw new Error('Cannot create aggregate from empty event stream');
    }
    const aggregate = new AggregateConstructor(firstEvent.aggregateId, 0);

    for (const event of events) {
      aggregate.applyEventData(event);
      aggregate._version = event.version;
    }

    return aggregate;
  }

  /**
   * Mark all uncommitted events as committed
   */
  public markEventsAsCommitted(): void {
    this._uncommittedEvents.length = 0;
  }
}

/**
 * Event validation schemas
 */
export const eventMetadataSchema = z.object({
  userId: z.string().optional(),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
  source: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const domainEventSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  aggregateId: z.string().uuid(),
  aggregateType: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  metadata: eventMetadataSchema,
  occurredAt: z.date(),
  version: z.number().positive(),
});

export const storedEventSchema = domainEventSchema.extend({
  position: z.object({
    globalPosition: z.bigint(),
    streamPosition: z.number().positive(),
  }),
  storedAt: z.date(),
});

/**
 * Type guards and utilities
 */
export function isDomainEvent(obj: unknown): obj is DomainEvent {
  return domainEventSchema.safeParse(obj).success;
}

export function isStoredEvent(obj: unknown): obj is StoredEvent {
  return storedEventSchema.safeParse(obj).success;
}

/**
 * Event factory for creating events with proper metadata
 */
export const EventFactory = {
  create(
    type: string,
    aggregateId: string,
    aggregateType: string,
    data: Record<string, unknown>,
    metadata: Partial<EventMetadata>,
    version: number,
    id?: string,
    occurredAt?: Date
  ): DomainEvent {
    return {
      id: id || crypto.randomUUID(),
      type,
      aggregateId,
      aggregateType,
      data,
      metadata: {
        source: metadata.source || 'unknown',
        ...metadata,
      },
      occurredAt: occurredAt || new Date(),
      version,
    };
  },
};
