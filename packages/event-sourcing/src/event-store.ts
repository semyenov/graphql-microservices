import { type AsyncResult, type DomainError, Result } from '@graphql-microservices/shared-result';
import {
  EventSourcingErrors,
  type IDomainEvent,
  type IEventStoreQuery,
  type ISnapshot,
  type IStoredEvent,
  type IStreamPosition,
} from './types';

/**
 * Event store interface for persisting and retrieving domain events
 */
export interface IEventStore {
  /**
   * Append events to an aggregate stream
   * @param aggregateId The aggregate identifier
   * @param events Events to append
   * @param expectedVersion Expected current version of the aggregate (for optimistic concurrency)
   * @returns Result with new stream positions or error
   */
  appendToStream(
    aggregateId: string,
    events: IDomainEvent[],
    expectedVersion?: number
  ): AsyncResult<IStreamPosition[], DomainError>;

  /**
   * Read events from an aggregate stream
   * @param aggregateId The aggregate identifier
   * @param fromVersion Start reading from this version (inclusive)
   * @param toVersion Stop reading at this version (inclusive)
   * @returns Result with stored events or error
   */
  readStream(
    aggregateId: string,
    fromVersion?: number,
    toVersion?: number
  ): AsyncResult<IStoredEvent[], DomainError>;

  /**
   * Read all events matching the query
   * @param query Query parameters
   * @returns Result with stored events or error
   */
  readEvents(query: IEventStoreQuery): AsyncResult<IStoredEvent[], DomainError>;

  /**
   * Read events from the global stream
   * @param fromPosition Start reading from this global position
   * @param limit Maximum number of events to return
   * @returns Result with stored events or error
   */
  readAllEvents(fromPosition?: bigint, limit?: number): AsyncResult<IStoredEvent[], DomainError>;

  /**
   * Get the current version of an aggregate
   * @param aggregateId The aggregate identifier
   * @returns Result with current version (0 if not found) or error
   */
  getCurrentVersion(aggregateId: string): AsyncResult<number, DomainError>;

  /**
   * Check if an aggregate exists
   * @param aggregateId The aggregate identifier
   * @returns Result with existence status or error
   */
  aggregateExists(aggregateId: string): AsyncResult<boolean, DomainError>;

  /**
   * Create a snapshot of an aggregate
   * @param snapshot The snapshot to save
   * @returns Result indicating success or error
   */
  saveSnapshot(snapshot: ISnapshot): AsyncResult<void, DomainError>;

  /**
   * Load the latest snapshot for an aggregate
   * @param aggregateId The aggregate identifier
   * @returns Result with snapshot or null if not found, or error
   */
  loadSnapshot(aggregateId: string): AsyncResult<ISnapshot | null, DomainError>;

  /**
   * Load snapshot at specific version
   * @param aggregateId The aggregate identifier
   * @param version The version to load
   * @returns Result with snapshot or null if not found, or error
   */
  loadSnapshotAtVersion(
    aggregateId: string,
    version: number
  ): AsyncResult<ISnapshot | null, DomainError>;

  /**
   * Subscribe to new events
   * @param callback Function to call when new events are available
   * @param query Optional query to filter events
   * @returns Result with subscription or error
   */
  subscribe(
    callback: (events: IStoredEvent[]) => Promise<void>,
    query?: IEventStoreQuery
  ): AsyncResult<EventSubscription, DomainError>;

  /**
   * Get stream metadata
   * @param aggregateId The aggregate identifier
   * @returns Result with metadata or error
   */
  getStreamMetadata(aggregateId: string): AsyncResult<IStreamMetadata | null, DomainError>;

  /**
   * Bulk operations for efficiency
   */
  bulkAppend(
    operations: Array<{
      aggregateId: string;
      events: IDomainEvent[];
      expectedVersion?: number;
    }>
  ): AsyncResult<IStreamPosition[][], DomainError>;
}

/**
 * Stream metadata
 */
export interface IStreamMetadata {
  aggregateId: string;
  aggregateType: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  eventCount: number;
  isDeleted: boolean;
}

/**
 * Event subscription interface
 */
export interface EventSubscription {
  /**
   * Subscription ID
   */
  readonly id: string;

  /**
   * Close the subscription
   */
  close(): Promise<void>;

  /**
   * Check if the subscription is active
   */
  isActive(): boolean;

  /**
   * Pause the subscription
   */
  pause(): void;

  /**
   * Resume the subscription
   */
  resume(): void;

  /**
   * Get subscription statistics
   */
  getStats(): SubscriptionStats;
}

/**
 * Subscription statistics
 */
export interface SubscriptionStats {
  eventsReceived: number;
  eventsProcessed: number;
  errors: number;
  lastEventTime?: Date;
  isPaused: boolean;
}

/**
 * Event store configuration
 */
export interface EventStoreConfig {
  /** Database connection string */
  connectionString: string;

  /** Table name for events */
  eventsTable?: string;

  /** Table name for snapshots */
  snapshotsTable?: string;

  /** Table name for outbox */
  outboxTable?: string;

  /** Batch size for reading events */
  batchSize?: number;

  /** Enable snapshots */
  enableSnapshots?: boolean;

  /** Snapshot frequency (every N events) */
  snapshotFrequency?: number;

  /** Enable outbox pattern */
  enableOutbox?: boolean;

  /** Retry configuration */
  retryConfig?: {
    maxRetries: number;
    retryDelayMs: number;
  };
}

/**
 * Abstract base class for event store implementations
 */
export abstract class BaseEventStore implements IEventStore {
  protected readonly config: Required<EventStoreConfig>;

  constructor(config: EventStoreConfig) {
    this.config = {
      eventsTable: 'events',
      snapshotsTable: 'snapshots',
      outboxTable: 'outbox',
      batchSize: 1000,
      enableSnapshots: true,
      snapshotFrequency: 50,
      enableOutbox: true,
      retryConfig: {
        maxRetries: 3,
        retryDelayMs: 100,
      },
      ...config,
    };
  }

  abstract appendToStream(
    aggregateId: string,
    events: IDomainEvent[],
    expectedVersion?: number
  ): AsyncResult<IStreamPosition[], DomainError>;

  abstract readStream(
    aggregateId: string,
    fromVersion?: number,
    toVersion?: number
  ): AsyncResult<IStoredEvent[], DomainError>;

  abstract readEvents(query: IEventStoreQuery): AsyncResult<IStoredEvent[], DomainError>;

  abstract readAllEvents(
    fromPosition?: bigint,
    limit?: number
  ): AsyncResult<IStoredEvent[], DomainError>;

  abstract getCurrentVersion(aggregateId: string): AsyncResult<number, DomainError>;

  abstract aggregateExists(aggregateId: string): AsyncResult<boolean, DomainError>;

  abstract saveSnapshot(snapshot: ISnapshot): AsyncResult<void, DomainError>;

  abstract loadSnapshot(aggregateId: string): AsyncResult<ISnapshot | null, DomainError>;

  abstract loadSnapshotAtVersion(
    aggregateId: string,
    version: number
  ): AsyncResult<ISnapshot | null, DomainError>;

  abstract subscribe(
    callback: (events: IStoredEvent[]) => Promise<void>,
    query?: IEventStoreQuery
  ): AsyncResult<EventSubscription, DomainError>;

  abstract getStreamMetadata(aggregateId: string): AsyncResult<IStreamMetadata | null, DomainError>;

  abstract bulkAppend(
    operations: Array<{
      aggregateId: string;
      events: IDomainEvent[];
      expectedVersion?: number;
    }>
  ): AsyncResult<IStreamPosition[][], DomainError>;

  /**
   * Helper method to validate event consistency
   */
  protected validateEvents(events: IDomainEvent[]): Result<void, DomainError> {
    if (events.length === 0) {
      return Result.err(EventSourcingErrors.InvalidEventSequence('Cannot append empty event list'));
    }

    const aggregateId = events[0]?.aggregateId;
    const aggregateType = events[0]?.aggregateType;

    for (const event of events) {
      if (event.aggregateId !== aggregateId) {
        return Result.err(
          EventSourcingErrors.InvalidEventSequence('All events must belong to the same aggregate')
        );
      }
      if (event.aggregateType !== aggregateType) {
        return Result.err(
          EventSourcingErrors.InvalidEventSequence('All events must have the same aggregate type')
        );
      }
    }

    return Result.ok(undefined);
  }

  /**
   * Helper method to check if snapshots should be created
   */
  protected shouldCreateSnapshot(version: number): boolean {
    return this.config.enableSnapshots && version % this.config.snapshotFrequency === 0;
  }

  /**
   * Retry helper for transient failures
   */
  protected async withRetry<T>(
    operation: () => AsyncResult<T, DomainError>,
    operationName: string
  ): AsyncResult<T, DomainError> {
    const { maxRetries, retryDelayMs } = this.config.retryConfig;
    let lastError: DomainError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await operation();

      if (Result.isOk(result)) {
        return result;
      }

      lastError = result.error;

      // Don't retry on non-transient errors
      if (
        lastError.code === 'CONCURRENCY_CONFLICT' ||
        lastError.code === 'AGGREGATE_NOT_FOUND' ||
        lastError.code === 'INVALID_EVENT_SEQUENCE'
      ) {
        return result;
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
      }
    }

    return Result.err(
      EventSourcingErrors.EventStoreError(`${operationName} failed after ${maxRetries} retries`, {
        lastError,
      })
    );
  }
}

/**
 * In-memory event store for testing
 */
export class InMemoryEventStore extends BaseEventStore {
  private events: Map<string, IStoredEvent[]> = new Map();
  private snapshots: Map<string, ISnapshot[]> = new Map();
  private globalPosition: bigint = 0n;
  private subscriptions: Map<string, EventSubscription> = new Map();

  async appendToStream(
    aggregateId: string,
    events: IDomainEvent[],
    expectedVersion?: number
  ): AsyncResult<IStreamPosition[], DomainError> {
    const validation = this.validateEvents(events);
    if (Result.isErr(validation)) {
      return validation;
    }

    const currentVersion = await this.getCurrentVersion(aggregateId);

    if (Result.isErr(currentVersion)) {
      return currentVersion;
    }

    if (expectedVersion !== undefined && expectedVersion !== currentVersion.value) {
      return Result.err(
        EventSourcingErrors.ConcurrencyConflict(expectedVersion, currentVersion.value)
      );
    }

    const stream = this.events.get(aggregateId) || [];
    const positions: IStreamPosition[] = [];

    for (const event of events) {
      const storedEvent: IStoredEvent = {
        ...event,
        position: {
          globalPosition: ++this.globalPosition,
          streamPosition: stream.length,
        },
        storedAt: new Date(),
      };

      stream.push(storedEvent);
      positions.push(storedEvent.position);
    }

    this.events.set(aggregateId, stream);

    // Notify subscribers
    await this.notifySubscribers(
      events
        .map((event, i) => ({
          ...event,
          position: positions[i]!,
          storedAt: new Date(),
        }))
        .filter((event, i) => positions[i] !== undefined)
    );

    return Result.ok(positions);
  }

  async readStream(
    aggregateId: string,
    fromVersion?: number,
    toVersion?: number
  ): AsyncResult<IStoredEvent[], DomainError> {
    const stream = this.events.get(aggregateId) || [];
    const filtered = stream.filter((event) => {
      const version = event.version;
      return (
        (fromVersion === undefined || version >= fromVersion) &&
        (toVersion === undefined || version <= toVersion)
      );
    });

    return Result.ok(filtered);
  }

  async readEvents(query: IEventStoreQuery): AsyncResult<IStoredEvent[], DomainError> {
    const allEvents: IStoredEvent[] = [];

    for (const stream of this.events.values()) {
      allEvents.push(...stream);
    }

    const filtered = allEvents.filter((event) => {
      return (
        (!query.aggregateId || event.aggregateId === query.aggregateId) &&
        (!query.aggregateType || event.aggregateType === query.aggregateType) &&
        (!query.eventType || event.type === query.eventType) &&
        (!query.fromPosition || event.position.globalPosition >= query.fromPosition) &&
        (!query.timeRange?.from || event.occurredAt >= query.timeRange.from) &&
        (!query.timeRange?.to || event.occurredAt <= query.timeRange.to)
      );
    });

    const limited = query.limit ? filtered.slice(0, query.limit) : filtered;
    return Result.ok(limited);
  }

  async readAllEvents(
    fromPosition?: bigint,
    limit?: number
  ): AsyncResult<IStoredEvent[], DomainError> {
    const allEvents: IStoredEvent[] = [];

    for (const stream of this.events.values()) {
      allEvents.push(...stream);
    }

    allEvents.sort((a, b) => Number(a.position.globalPosition - b.position.globalPosition));

    const filtered = fromPosition
      ? allEvents.filter((e) => e.position.globalPosition >= fromPosition)
      : allEvents;

    const limited = limit ? filtered.slice(0, limit) : filtered;
    return Result.ok(limited);
  }

  async getCurrentVersion(aggregateId: string): AsyncResult<number, DomainError> {
    const stream = this.events.get(aggregateId) || [];
    const lastEvent = stream[stream.length - 1];
    return Result.ok(lastEvent?.version || 0);
  }

  async aggregateExists(aggregateId: string): AsyncResult<boolean, DomainError> {
    return Result.ok(this.events.has(aggregateId));
  }

  async saveSnapshot(snapshot: ISnapshot): AsyncResult<void, DomainError> {
    const snapshots = this.snapshots.get(snapshot.aggregateId) || [];
    snapshots.push(snapshot);
    this.snapshots.set(snapshot.aggregateId, snapshots);
    return Result.ok(undefined);
  }

  async loadSnapshot(aggregateId: string): AsyncResult<ISnapshot | null, DomainError> {
    const snapshots = this.snapshots.get(aggregateId) || [];
    const latest = snapshots[snapshots.length - 1];
    return Result.ok(latest || null);
  }

  async loadSnapshotAtVersion(
    aggregateId: string,
    version: number
  ): AsyncResult<ISnapshot | null, DomainError> {
    const snapshots = this.snapshots.get(aggregateId) || [];
    const snapshot = snapshots.find((s) => s.version === version);
    return Result.ok(snapshot || null);
  }

  async getStreamMetadata(aggregateId: string): AsyncResult<IStreamMetadata | null, DomainError> {
    const stream = this.events.get(aggregateId);
    if (!stream || stream.length === 0) {
      return Result.ok(null);
    }

    const firstEvent = stream[0]!; // Safe because we checked length > 0
    const lastEvent = stream[stream.length - 1]!;

    return Result.ok({
      aggregateId,
      aggregateType: firstEvent.aggregateType,
      version: lastEvent.version,
      createdAt: firstEvent.occurredAt,
      updatedAt: lastEvent.occurredAt,
      eventCount: stream.length,
      isDeleted: lastEvent.type.toLowerCase().includes('deleted'),
    });
  }

  async bulkAppend(
    operations: Array<{
      aggregateId: string;
      events: IDomainEvent[];
      expectedVersion?: number;
    }>
  ): AsyncResult<IStreamPosition[][], DomainError> {
    const results: IStreamPosition[][] = [];

    for (const op of operations) {
      const result = await this.appendToStream(op.aggregateId, op.events, op.expectedVersion);
      if (Result.isErr(result)) {
        return result;
      }
      results.push(result.value);
    }

    return Result.ok(results);
  }

  async subscribe(
    _callback: (events: IStoredEvent[]) => Promise<void>,
    _query?: IEventStoreQuery
  ): AsyncResult<EventSubscription, DomainError> {
    const id = `sub-${Date.now()}-${Math.random()}`;
    let isActive = true;
    let _isPaused = false;
    const stats: SubscriptionStats = {
      eventsReceived: 0,
      eventsProcessed: 0,
      errors: 0,
      isPaused: false,
    };

    const subscription: EventSubscription = {
      id,
      close: async () => {
        isActive = false;
        this.subscriptions.delete(id);
      },
      isActive: () => isActive,
      pause: () => {
        _isPaused = true;
        stats.isPaused = true;
      },
      resume: () => {
        _isPaused = false;
        stats.isPaused = false;
      },
      getStats: () => ({ ...stats }),
    };

    this.subscriptions.set(id, subscription);
    return Result.ok(subscription);
  }

  private async notifySubscribers(_events: IStoredEvent[]): Promise<void> {
    // In a real implementation, this would notify subscribers
    // For testing, we just track the events
  }
}
