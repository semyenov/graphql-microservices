import type { IDomainEvent, IEventStoreQuery, IStoredEvent, IStreamPosition } from './types';

/**
 * Event store interface for persisting and retrieving domain events
 */
export interface IEventStore {
  /**
   * Append events to an aggregate stream
   * @param aggregateId The aggregate identifier
   * @param events Events to append
   * @param expectedVersion Expected current version of the aggregate (for optimistic concurrency)
   * @returns Promise resolving to the new stream positions
   */
  appendToStream(
    aggregateId: string,
    events: IDomainEvent[],
    expectedVersion?: number
  ): Promise<IStreamPosition[]>;

  /**
   * Read events from an aggregate stream
   * @param aggregateId The aggregate identifier
   * @param fromVersion Start reading from this version (inclusive)
   * @param toVersion Stop reading at this version (inclusive)
   * @returns Promise resolving to the stored events
   */
  readStream(
    aggregateId: string,
    fromVersion?: number,
    toVersion?: number
  ): Promise<IStoredEvent[]>;

  /**
   * Read all events matching the query
   * @param query Query parameters
   * @returns Promise resolving to the stored events
   */
  readEvents(query: IEventStoreQuery): Promise<IStoredEvent[]>;

  /**
   * Read events from the global stream
   * @param fromPosition Start reading from this global position
   * @param limit Maximum number of events to return
   * @returns Promise resolving to the stored events
   */
  readAllEvents(fromPosition?: bigint, limit?: number): Promise<IStoredEvent[]>;

  /**
   * Get the current version of an aggregate
   * @param aggregateId The aggregate identifier
   * @returns Promise resolving to the current version, or 0 if not found
   */
  getCurrentVersion(aggregateId: string): Promise<number>;

  /**
   * Check if an aggregate exists
   * @param aggregateId The aggregate identifier
   * @returns Promise resolving to true if the aggregate exists
   */
  aggregateExists(aggregateId: string): Promise<boolean>;

  /**
   * Create a snapshot of an aggregate
   * @param aggregateId The aggregate identifier
   * @param aggregateType The aggregate type
   * @param snapshot The snapshot data
   * @param version The version at which the snapshot was taken
   * @returns Promise resolving when the snapshot is saved
   */
  saveSnapshot(
    aggregateId: string,
    aggregateType: string,
    snapshot: Record<string, unknown>,
    version: number
  ): Promise<void>;

  /**
   * Load the latest snapshot for an aggregate
   * @param aggregateId The aggregate identifier
   * @returns Promise resolving to the snapshot or null if not found
   */
  loadSnapshot(aggregateId: string): Promise<{
    data: Record<string, unknown>;
    version: number;
  } | null>;

  /**
   * Subscribe to new events
   * @param callback Function to call when new events are available
   * @param query Optional query to filter events
   * @returns Promise resolving to a subscription that can be closed
   */
  subscribe(
    callback: (events: IStoredEvent[]) => Promise<void>,
    query?: IEventStoreQuery
  ): Promise<EventSubscription>;

  /**
   * Save events for an aggregate (alias for appendToStream)
   * @param aggregateId The aggregate identifier
   * @param events Events to save
   * @param expectedVersion Expected current version of the aggregate
   * @returns Promise resolving when events are saved
   */
  save(aggregateId: string, events: IDomainEvent[], expectedVersion?: number): Promise<void>;

  /**
   * Get events for an aggregate (alias for readStream)
   * @param aggregateId The aggregate identifier
   * @param fromVersion Start reading from this version
   * @returns Promise resolving to the events
   */
  getEvents(aggregateId: string, fromVersion?: number): Promise<IDomainEvent[]>;
}

/**
 * Event subscription interface
 */
export interface EventSubscription {
  /**
   * Close the subscription
   */
  close(): Promise<void>;

  /**
   * Check if the subscription is active
   */
  isActive(): boolean;
}

// Error classes moved to @graphql-microservices/shared-errors
// Import them from there instead

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

  /** Batch size for reading events */
  batchSize?: number;

  /** Enable snapshots */
  enableSnapshots?: boolean;

  /** Snapshot frequency (every N events) */
  snapshotFrequency?: number;
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
      batchSize: 1000,
      enableSnapshots: true,
      snapshotFrequency: 50,
      ...config,
    };
  }

  abstract appendToStream(
    aggregateId: string,
    events: IDomainEvent[],
    expectedVersion?: number
  ): Promise<IStreamPosition[]>;

  abstract readStream(
    aggregateId: string,
    fromVersion?: number,
    toVersion?: number
  ): Promise<IStoredEvent[]>;

  abstract readEvents(query: IEventStoreQuery): Promise<IStoredEvent[]>;

  abstract readAllEvents(fromPosition?: bigint, limit?: number): Promise<IStoredEvent[]>;

  abstract getCurrentVersion(aggregateId: string): Promise<number>;

  abstract aggregateExists(aggregateId: string): Promise<boolean>;

  abstract saveSnapshot(
    aggregateId: string,
    aggregateType: string,
    snapshot: Record<string, unknown>,
    version: number
  ): Promise<void>;

  abstract loadSnapshot(aggregateId: string): Promise<{
    data: Record<string, unknown>;
    version: number;
  } | null>;

  abstract subscribe(
    callback: (events: IStoredEvent[]) => Promise<void>,
    query?: IEventStoreQuery
  ): Promise<EventSubscription>;

  /**
   * Save events for an aggregate (alias for appendToStream)
   */
  async save(aggregateId: string, events: IDomainEvent[], expectedVersion?: number): Promise<void> {
    await this.appendToStream(aggregateId, events, expectedVersion);
  }

  /**
   * Get events for an aggregate (alias for readStream)
   */
  async getEvents(aggregateId: string, fromVersion?: number): Promise<IDomainEvent[]> {
    const storedEvents = await this.readStream(aggregateId, fromVersion);
    // StoredEvent extends DomainEvent, so we can return them directly
    return storedEvents;
  }

  /**
   * Helper method to validate event consistency
   */
  protected validateEvents(events: IDomainEvent[]): void {
    if (events.length === 0) {
      throw new Error('Cannot append empty event list');
    }

    const aggregateId = events[0]?.aggregateId;
    const aggregateType = events[0]?.aggregateType;

    for (const event of events) {
      if (event.aggregateId !== aggregateId) {
        throw new Error('All events must belong to the same aggregate');
      }
      if (event.aggregateType !== aggregateType) {
        throw new Error('All events must have the same aggregate type');
      }
    }
  }

  /**
   * Helper method to check if snapshots should be created
   */
  protected shouldCreateSnapshot(version: number): boolean {
    return this.config.enableSnapshots && version % this.config.snapshotFrequency === 0;
  }
}
