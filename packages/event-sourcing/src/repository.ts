import {
  AlreadyExistsError,
  type AsyncResult,
  type DomainError,
  domainError,
  NotFoundError,
  Result,
} from '@graphql-microservices/shared-result';
import { z } from 'zod';
import type { IEventStore } from './event-store';
import type {
  AggregateRoot,
  AggregateState,
  IBusinessRule,
  IDomainEvent,
  ISnapshot,
  IStoredEvent,
} from './types';

/**
 * Repository query specification interface
 */
export interface IRepositoryQuery<TAggregate> {
  readonly name: string;
  match(aggregate: TAggregate): boolean;
  getHint?(): string; // For query optimization
}

/**
 * Repository pagination parameters
 */
export interface RepositoryPagination {
  readonly limit: number;
  readonly offset: number;
  readonly sortBy?: string;
  readonly sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated repository result
 */
export interface PaginatedRepositoryResult<T> {
  readonly items: T[];
  readonly totalCount: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
  readonly currentPage: number;
  readonly totalPages: number;
}

/**
 * Repository operation options
 */
export interface RepositoryOptions {
  /**
   * Skip business rule validation
   */
  readonly skipValidation?: boolean;

  /**
   * Expected version for optimistic concurrency control
   */
  readonly expectedVersion?: number;

  /**
   * Custom metadata for operations
   */
  readonly metadata?: Record<string, unknown>;

  /**
   * Skip snapshot creation even if eligible
   */
  readonly skipSnapshot?: boolean;

  /**
   * Force snapshot creation
   */
  readonly forceSnapshot?: boolean;
}

/**
 * Repository operation result with metadata
 */
export interface RepositoryOperationResult<T = void> {
  readonly result: T;
  readonly version: number;
  readonly events: readonly IDomainEvent[];
  readonly sideEffects?: readonly unknown[];
  readonly snapshotCreated?: boolean;
}

/**
 * Enhanced repository interface with comprehensive Result-based error handling
 */
export interface IRepository<TAggregate extends AggregateRoot, TId = string> {
  /**
   * Find aggregate by ID with comprehensive error handling
   */
  findById(
    id: TId,
    options?: {
      useSnapshot?: boolean;
      maxAge?: number; // Maximum age of snapshot in milliseconds
    }
  ): AsyncResult<TAggregate | null, DomainError>;

  /**
   * Find aggregate by ID or throw if not found
   */
  getById(
    id: TId,
    options?: {
      useSnapshot?: boolean;
      maxAge?: number;
    }
  ): AsyncResult<TAggregate, DomainError>;

  /**
   * Check if aggregate exists
   */
  exists(id: TId): AsyncResult<boolean, DomainError>;

  /**
   * Save aggregate with comprehensive validation and error handling
   */
  save(
    aggregate: TAggregate,
    options?: RepositoryOptions
  ): AsyncResult<RepositoryOperationResult, DomainError>;

  /**
   * Delete aggregate (soft delete by default)
   */
  delete(
    id: TId,
    options?: RepositoryOptions & {
      hardDelete?: boolean;
      reason?: string;
      deletedBy?: string;
    }
  ): AsyncResult<RepositoryOperationResult, DomainError>;

  /**
   * Find aggregates by specification
   */
  findBySpec(
    spec: IRepositoryQuery<TAggregate>,
    pagination?: RepositoryPagination
  ): AsyncResult<PaginatedRepositoryResult<TAggregate>, DomainError>;

  /**
   * Count aggregates matching specification
   */
  countBySpec(spec: IRepositoryQuery<TAggregate>): AsyncResult<number, DomainError>;

  /**
   * Find all aggregates (use with caution)
   */
  findAll(options?: {
    includeDeleted?: boolean;
    pagination?: RepositoryPagination;
  }): AsyncResult<PaginatedRepositoryResult<TAggregate>, DomainError>;

  /**
   * Create and save new aggregate
   */
  create(
    id: TId,
    creationEvent: IDomainEvent,
    options?: RepositoryOptions
  ): AsyncResult<RepositoryOperationResult<TAggregate>, DomainError>;

  /**
   * Batch operations
   */
  saveBatch(
    aggregates: TAggregate[],
    options?: RepositoryOptions
  ): AsyncResult<RepositoryOperationResult[], DomainError>;

  /**
   * Load aggregate at specific version
   */
  loadAtVersion(id: TId, version: number): AsyncResult<TAggregate | null, DomainError>;

  /**
   * Get aggregate history
   */
  getHistory(
    id: TId,
    options?: {
      fromVersion?: number;
      toVersion?: number;
      includeSnapshots?: boolean;
    }
  ): AsyncResult<IStoredEvent[], DomainError>;

  /**
   * Create snapshot of aggregate
   */
  createSnapshot(
    aggregate: TAggregate,
    options?: {
      force?: boolean;
    }
  ): AsyncResult<ISnapshot, DomainError>;

  /**
   * Load snapshot
   */
  loadSnapshot(
    id: TId,
    options?: {
      maxAge?: number;
    }
  ): AsyncResult<ISnapshot | null, DomainError>;

  /**
   * Validate aggregate state
   */
  validate(
    aggregate: TAggregate,
    rules?: IBusinessRule<TAggregate>[]
  ): AsyncResult<void, DomainError>;

  /**
   * Get repository statistics
   */
  getStats(): AsyncResult<RepositoryStats, DomainError>;
}

/**
 * Repository statistics
 */
export interface RepositoryStats {
  readonly totalAggregates: number;
  readonly activeAggregates: number;
  readonly deletedAggregates: number;
  readonly archivedAggregates: number;
  readonly totalEvents: number;
  readonly totalSnapshots: number;
  readonly averageEventsPerAggregate: number;
  readonly oldestAggregate?: Date;
  readonly newestAggregate?: Date;
}

/**
 * Base repository implementation with comprehensive features
 */
export abstract class BaseRepository<TAggregate extends AggregateRoot, TId = string>
  implements IRepository<TAggregate, TId>
{
  protected readonly eventStore: IEventStore;
  protected readonly aggregateType: string;
  protected readonly snapshotFrequency: number;

  constructor(
    eventStore: IEventStore,
    aggregateType: string,
    options: {
      snapshotFrequency?: number;
    } = {}
  ) {
    this.eventStore = eventStore;
    this.aggregateType = aggregateType;
    this.snapshotFrequency = options.snapshotFrequency || 50;
  }

  async findById(
    id: TId,
    options: {
      useSnapshot?: boolean;
      maxAge?: number;
    } = {}
  ): AsyncResult<TAggregate | null, DomainError> {
    const stringId = String(id);

    // Try to load from snapshot if requested
    if (options.useSnapshot !== false) {
      const snapshotResult = await this.loadSnapshotInternal(stringId, options.maxAge);
      if (Result.isErr(snapshotResult)) {
        // Log but don't fail - fall back to event sourcing
        console.warn(`Failed to load snapshot for ${stringId}:`, snapshotResult.error.message);
      } else if (snapshotResult.value) {
        const snapshot = snapshotResult.value;

        // Load events since snapshot
        const eventsResult = await this.eventStore.readStream(stringId, snapshot.version + 1);

        if (Result.isErr(eventsResult)) {
          return eventsResult;
        }

        // Reconstruct aggregate from snapshot + events
        const aggregate = await this.loadFromSnapshot(snapshot, eventsResult.value);
        return Result.map(aggregate, (agg) => agg || null);
      }
    }

    // Load from events
    const eventsResult = await this.eventStore.readStream(stringId);
    if (Result.isErr(eventsResult)) {
      return eventsResult;
    }

    if (eventsResult.value.length === 0) {
      return Result.ok(null);
    }

    const aggregateResult = await this.loadFromEvents(eventsResult.value);
    return Result.map(aggregateResult, (agg) => agg || null);
  }

  async getById(
    id: TId,
    options?: {
      useSnapshot?: boolean;
      maxAge?: number;
    }
  ): AsyncResult<TAggregate, DomainError> {
    const result = await this.findById(id, options);

    return Result.flatMap(result, (aggregate) => {
      if (!aggregate) {
        return Result.err(NotFoundError(this.aggregateType, String(id)));
      }
      return Result.ok(aggregate);
    });
  }

  async exists(id: TId): AsyncResult<boolean, DomainError> {
    return this.eventStore.aggregateExists(String(id));
  }

  async save(
    aggregate: TAggregate,
    options: RepositoryOptions = {}
  ): AsyncResult<RepositoryOperationResult, DomainError> {
    // Validate aggregate if not skipped
    if (!options.skipValidation) {
      const validationResult = await this.validateAggregate(aggregate);
      if (Result.isErr(validationResult)) {
        return validationResult;
      }
    }

    // Check if aggregate has changes
    if (!aggregate.hasUncommittedEvents) {
      return Result.ok({
        result: undefined,
        version: aggregate.version,
        events: [],
        sideEffects: [],
      });
    }

    // Save events
    const saveResult = await this.eventStore.appendToStream(
      aggregate.id,
      Array.from(aggregate.uncommittedEvents),
      options.expectedVersion ?? aggregate.version - aggregate.uncommittedEvents.length
    );

    if (Result.isErr(saveResult)) {
      return saveResult;
    }

    // Create snapshot if needed
    let snapshotCreated = false;
    if (this.shouldCreateSnapshot(aggregate, options)) {
      const snapshotResult = await this.createSnapshotInternal(aggregate);
      if (Result.isOk(snapshotResult)) {
        snapshotCreated = true;
      }
      // Don't fail the save if snapshot creation fails
    }

    // Collect side effects
    const sideEffects = Array.from(aggregate.sideEffects);

    // Mark events as committed
    aggregate.markEventsAsCommitted();
    aggregate.clearSideEffects();

    return Result.ok({
      result: undefined,
      version: aggregate.version,
      events: Array.from(aggregate.uncommittedEvents),
      sideEffects,
      snapshotCreated,
    });
  }

  async delete(
    id: TId,
    options: RepositoryOptions & {
      hardDelete?: boolean;
      reason?: string;
      deletedBy?: string;
    } = {}
  ): AsyncResult<RepositoryOperationResult, DomainError> {
    const aggregate = await this.getById(id);
    if (Result.isErr(aggregate)) {
      return aggregate;
    }

    // Create deletion event
    const deletionEventResult = this.createDeletionEvent(
      aggregate.value,
      options.reason || 'Deleted',
      options.deletedBy,
      options.metadata
    );

    if (Result.isErr(deletionEventResult)) {
      return deletionEventResult;
    }

    // Apply deletion event
    const applyResult = aggregate.value.applyEvents([deletionEventResult.value]);
    if (Result.isErr(applyResult)) {
      return applyResult;
    }

    // Save the aggregate
    return this.save(aggregate.value, options);
  }

  async findBySpec(
    spec: IRepositoryQuery<TAggregate>,
    pagination?: RepositoryPagination
  ): AsyncResult<PaginatedRepositoryResult<TAggregate>, DomainError> {
    // For now, implement basic in-memory filtering
    // In production, this should be optimized with proper querying
    const allResult = await this.findAll({ pagination });
    if (Result.isErr(allResult)) {
      return allResult;
    }

    const filtered = allResult.value.items.filter((aggregate) => spec.match(aggregate));

    const startIndex = pagination?.offset || 0;
    const limit = pagination?.limit || filtered.length;
    const items = filtered.slice(startIndex, startIndex + limit);

    return Result.ok({
      items,
      totalCount: filtered.length,
      hasNextPage: startIndex + limit < filtered.length,
      hasPreviousPage: startIndex > 0,
      currentPage: Math.floor(startIndex / limit) + 1,
      totalPages: Math.ceil(filtered.length / limit),
    });
  }

  async countBySpec(spec: IRepositoryQuery<TAggregate>): AsyncResult<number, DomainError> {
    const result = await this.findBySpec(spec);
    return Result.map(result, (data) => data.totalCount);
  }

  async findAll(
    options: { includeDeleted?: boolean; pagination?: RepositoryPagination } = {}
  ): AsyncResult<PaginatedRepositoryResult<TAggregate>, DomainError> {
    const eventsResult = await this.eventStore.readEvents({
      aggregateType: this.aggregateType,
      limit: options.pagination?.limit,
    });

    if (Result.isErr(eventsResult)) {
      return eventsResult;
    }

    // Group events by aggregate ID
    const eventsByAggregate = new Map<string, IStoredEvent[]>();
    for (const event of eventsResult.value) {
      const existing = eventsByAggregate.get(event.aggregateId) || [];
      existing.push(event);
      eventsByAggregate.set(event.aggregateId, existing);
    }

    // Load aggregates
    const aggregates: TAggregate[] = [];
    for (const [, events] of eventsByAggregate) {
      const aggregateResult = await this.loadFromEvents(events);
      if (Result.isOk(aggregateResult) && aggregateResult.value) {
        const aggregate = aggregateResult.value;

        // Filter out deleted if requested
        if (!options.includeDeleted && aggregate.isDeleted) {
          continue;
        }

        aggregates.push(aggregate);
      }
    }

    const totalCount = aggregates.length;
    const pagination = options.pagination;
    const startIndex = pagination?.offset || 0;
    const limit = pagination?.limit || totalCount;
    const items = aggregates.slice(startIndex, startIndex + limit);

    return Result.ok({
      items,
      totalCount,
      hasNextPage: startIndex + limit < totalCount,
      hasPreviousPage: startIndex > 0,
      currentPage: Math.floor(startIndex / limit) + 1,
      totalPages: Math.ceil(totalCount / limit),
    });
  }

  async create(
    id: TId,
    creationEvent: IDomainEvent,
    options: RepositoryOptions = {}
  ): AsyncResult<RepositoryOperationResult<TAggregate>, DomainError> {
    // Check if aggregate already exists
    const existsResult = await this.exists(id);
    if (Result.isErr(existsResult)) {
      return existsResult;
    }

    if (existsResult.value) {
      return Result.err(AlreadyExistsError(this.aggregateType, 'id', String(id)));
    }

    // Create aggregate using the static factory method
    const aggregateResult = await this.createFromEvent(String(id), creationEvent);
    if (Result.isErr(aggregateResult)) {
      return aggregateResult;
    }

    const aggregate = aggregateResult.value;

    // Save the new aggregate
    const saveResult = await this.save(aggregate, options);
    if (Result.isErr(saveResult)) {
      return saveResult;
    }

    return Result.ok({
      ...saveResult.value,
      result: aggregate,
    });
  }

  async saveBatch(
    aggregates: TAggregate[],
    options: RepositoryOptions = {}
  ): AsyncResult<RepositoryOperationResult[], DomainError> {
    const results: RepositoryOperationResult[] = [];

    // Validate all aggregates first
    if (!options.skipValidation) {
      for (const aggregate of aggregates) {
        const validationResult = await this.validateAggregate(aggregate);
        if (Result.isErr(validationResult)) {
          return validationResult;
        }
      }
    }

    // Prepare bulk operations
    const operations = aggregates
      .filter((agg) => agg.hasUncommittedEvents)
      .map((agg) => ({
        aggregateId: agg.id,
        events: Array.from(agg.uncommittedEvents),
        expectedVersion: options.expectedVersion ?? agg.version - agg.uncommittedEvents.length,
      }));

    if (operations.length === 0) {
      return Result.ok([]);
    }

    // Execute bulk append
    const bulkResult = await this.eventStore.bulkAppend(operations);
    if (Result.isErr(bulkResult)) {
      return bulkResult;
    }

    // Process results
    for (let i = 0; i < aggregates.length; i++) {
      const aggregate = aggregates[i];

      if (aggregate?.hasUncommittedEvents) {
        const sideEffects = Array.from(aggregate.sideEffects);

        results.push({
          result: undefined,
          version: aggregate.version,
          events: Array.from(aggregate.uncommittedEvents),
          sideEffects,
        });

        aggregate.markEventsAsCommitted();
        aggregate.clearSideEffects();
      }
    }

    return Result.ok(results);
  }

  async loadAtVersion(id: TId, version: number): AsyncResult<TAggregate | null, DomainError> {
    const eventsResult = await this.eventStore.readStream(String(id), 1, version);
    if (Result.isErr(eventsResult)) {
      return eventsResult;
    }

    if (eventsResult.value.length === 0) {
      return Result.ok(null);
    }

    return this.loadFromEvents(eventsResult.value);
  }

  async getHistory(
    id: TId,
    options: {
      fromVersion?: number;
      toVersion?: number;
      includeSnapshots?: boolean;
    } = {}
  ): AsyncResult<IStoredEvent[], DomainError> {
    return this.eventStore.readStream(String(id), options.fromVersion, options.toVersion);
  }

  async createSnapshot(
    aggregate: TAggregate,
    options: {
      force?: boolean;
    } = {}
  ): AsyncResult<ISnapshot, DomainError> {
    if (!options.force && !this.shouldCreateSnapshot(aggregate)) {
      return Result.err(
        domainError('SNAPSHOT_NOT_NEEDED', 'Snapshot creation not needed at this time')
      );
    }

    return this.createSnapshotInternal(aggregate);
  }

  async loadSnapshot(
    id: TId,
    options: {
      maxAge?: number;
    } = {}
  ): AsyncResult<ISnapshot | null, DomainError> {
    return this.loadSnapshotInternal(String(id), options.maxAge);
  }

  async validate(
    aggregate: TAggregate,
    rules?: IBusinessRule<TAggregate>[]
  ): AsyncResult<void, DomainError> {
    return this.validateAggregate(aggregate, rules);
  }

  async getStats(): AsyncResult<RepositoryStats, DomainError> {
    // This is a basic implementation - in production you'd want to optimize this
    const allResult = await this.findAll({ includeDeleted: true });
    if (Result.isErr(allResult)) {
      return allResult;
    }

    const aggregates = allResult.value.items;
    const active = aggregates.filter((a) => a.isActive).length;
    const deleted = aggregates.filter((a) => a.isDeleted).length;
    const archived = aggregates.filter((a) => a.isArchived).length;

    // Get total events count
    const eventsResult = await this.eventStore.readEvents({
      aggregateType: this.aggregateType,
    });

    const totalEvents = Result.isOk(eventsResult) ? eventsResult.value.length : 0;

    return Result.ok({
      totalAggregates: aggregates.length,
      activeAggregates: active,
      deletedAggregates: deleted,
      archivedAggregates: archived,
      totalEvents,
      totalSnapshots: 0, // Would need to query snapshot store
      averageEventsPerAggregate: aggregates.length > 0 ? totalEvents / aggregates.length : 0,
      oldestAggregate:
        aggregates.length > 0
          ? new Date(Math.min(...aggregates.map((a) => a.createdAt.getTime())))
          : undefined,
      newestAggregate:
        aggregates.length > 0
          ? new Date(Math.max(...aggregates.map((a) => a.createdAt.getTime())))
          : undefined,
    });
  }

  // Abstract methods to be implemented by concrete repositories
  protected abstract loadFromEvents(
    events: IStoredEvent[]
  ): AsyncResult<TAggregate | null, DomainError>;
  protected abstract loadFromSnapshot(
    snapshot: ISnapshot,
    events: IStoredEvent[]
  ): AsyncResult<TAggregate | null, DomainError>;
  protected abstract createFromEvent(
    id: string,
    event: IDomainEvent
  ): AsyncResult<TAggregate, DomainError>;
  protected abstract serializeSnapshot(aggregate: TAggregate): AsyncResult<unknown, DomainError>;
  protected abstract deserializeSnapshot(data: unknown): AsyncResult<TAggregate, DomainError>;
  protected abstract createDeletionEvent(
    aggregate: TAggregate,
    reason: string,
    deletedBy?: string,
    metadata?: Record<string, unknown>
  ): Result<IDomainEvent, DomainError>;

  // Protected helper methods
  protected async validateAggregate(
    aggregate: TAggregate,
    additionalRules?: IBusinessRule<TAggregate>[]
  ): AsyncResult<void, DomainError> {
    // Validate aggregate state
    const stateValidation = aggregate.validateState();
    if (Result.isErr(stateValidation)) {
      return stateValidation;
    }

    // Apply additional business rules
    if (additionalRules) {
      const rulesResult = aggregate.executeCommand(
        { type: 'validate', payload: {} } as any,
        () => Result.ok([]),
        { businessRules: additionalRules }
      );
      if (Result.isErr(rulesResult)) {
        return rulesResult;
      }
    }

    return Result.ok(undefined);
  }

  protected shouldCreateSnapshot(aggregate: TAggregate, options?: RepositoryOptions): boolean {
    if (options?.skipSnapshot) return false;
    if (options?.forceSnapshot) return true;

    return aggregate.version % this.snapshotFrequency === 0;
  }

  protected async createSnapshotInternal(
    aggregate: TAggregate
  ): AsyncResult<ISnapshot, DomainError> {
    const serializedResult = await this.serializeSnapshot(aggregate);
    if (Result.isErr(serializedResult)) {
      return serializedResult;
    }

    const snapshot: ISnapshot = {
      aggregateId: aggregate.id,
      aggregateType: aggregate.aggregateType,
      version: aggregate.version,
      state: serializedResult.value,
      createdAt: new Date(),
    };

    const saveResult = await this.eventStore.saveSnapshot(snapshot);
    return Result.map(saveResult, () => snapshot);
  }

  protected async loadSnapshotInternal(
    id: string,
    maxAge?: number
  ): AsyncResult<ISnapshot | null, DomainError> {
    const snapshotResult = await this.eventStore.loadSnapshot(id);
    if (Result.isErr(snapshotResult)) {
      return snapshotResult;
    }

    const snapshot = snapshotResult.value;
    if (!snapshot) {
      return Result.ok(null);
    }

    // Check age if specified
    if (maxAge && Date.now() - snapshot.createdAt.getTime() > maxAge) {
      return Result.ok(null);
    }

    return Result.ok(snapshot);
  }
}

/**
 * Repository query specifications
 */
export abstract class RepositoryQuerySpec<TAggregate> implements IRepositoryQuery<TAggregate> {
  abstract readonly name: string;
  abstract match(aggregate: TAggregate): boolean;

  getHint?(): string {
    return this.name;
  }
}

/**
 * Composite query specification
 */
export class CompositeRepositoryQuery<TAggregate> extends RepositoryQuerySpec<TAggregate> {
  readonly name: string;

  constructor(
    private readonly queries: IRepositoryQuery<TAggregate>[],
    private readonly operator: 'AND' | 'OR' = 'AND'
  ) {
    super();
    this.name = `Composite(${operator})[${queries.map((q) => q.name).join(', ')}]`;
  }

  match(aggregate: TAggregate): boolean {
    if (this.operator === 'AND') {
      return this.queries.every((q) => q.match(aggregate));
    } else {
      return this.queries.some((q) => q.match(aggregate));
    }
  }

  getHint(): string {
    const hints = this.queries.map((q) => q.getHint?.() || q.name).filter(Boolean);
    return `${this.operator}(${hints.join(', ')})`;
  }
}

/**
 * Common repository query specifications
 */
export class ByStateQuery<
  TAggregate extends AggregateRoot,
> extends RepositoryQuerySpec<TAggregate> {
  readonly name = `ByState(${this.state})`;

  constructor(private readonly state: AggregateState) {
    super();
  }

  match(aggregate: TAggregate): boolean {
    return aggregate.state === this.state;
  }
}

export class ByVersionRangeQuery<
  TAggregate extends AggregateRoot,
> extends RepositoryQuerySpec<TAggregate> {
  readonly name = `ByVersionRange(${this.minVersion}-${this.maxVersion})`;

  constructor(
    private readonly minVersion: number,
    private readonly maxVersion: number
  ) {
    super();
  }

  match(aggregate: TAggregate): boolean {
    return aggregate.version >= this.minVersion && aggregate.version <= this.maxVersion;
  }
}

export class ByCreatedDateQuery<
  TAggregate extends AggregateRoot,
> extends RepositoryQuerySpec<TAggregate> {
  readonly name = `ByCreatedDate(${this.from.toISOString()}-${this.to?.toISOString() || 'now'})`;

  constructor(
    private readonly from: Date,
    private readonly to?: Date
  ) {
    super();
  }

  match(aggregate: TAggregate): boolean {
    const createdAt = aggregate.createdAt;
    return createdAt >= this.from && (!this.to || createdAt <= this.to);
  }
}

/**
 * Repository validation schemas
 */
export const repositoryOptionsSchema = z.object({
  skipValidation: z.boolean().optional(),
  expectedVersion: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
  skipSnapshot: z.boolean().optional(),
  forceSnapshot: z.boolean().optional(),
});

export const repositoryPaginationSchema = z.object({
  limit: z.number().min(1).max(1000),
  offset: z.number().min(0),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

/**
 * Repository utilities
 */
export const RepositoryUtils = {
  /**
   * Create a composite query with AND logic
   */
  and<T>(...queries: IRepositoryQuery<T>[]): CompositeRepositoryQuery<T> {
    return new CompositeRepositoryQuery(queries, 'AND');
  },

  /**
   * Create a composite query with OR logic
   */
  or<T>(...queries: IRepositoryQuery<T>[]): CompositeRepositoryQuery<T> {
    return new CompositeRepositoryQuery(queries, 'OR');
  },

  /**
   * Create pagination with defaults
   */
  paginate(page: number = 1, limit: number = 20): RepositoryPagination {
    return {
      limit: Math.max(1, Math.min(1000, limit)),
      offset: Math.max(0, (page - 1) * limit),
    };
  },

  /**
   * Validate repository options
   */
  validateOptions(options: unknown): Result<RepositoryOptions, DomainError> {
    const result = repositoryOptionsSchema.safeParse(options);
    if (!result.success) {
      return Result.err(
        domainError('INVALID_REPOSITORY_OPTIONS', 'Invalid repository options', result.error)
      );
    }
    return Result.ok(result.data);
  },

  /**
   * Validate pagination
   */
  validatePagination(pagination: unknown): Result<RepositoryPagination, DomainError> {
    const result = repositoryPaginationSchema.safeParse(pagination);
    if (!result.success) {
      return Result.err(
        domainError('INVALID_PAGINATION', 'Invalid pagination parameters', result.error)
      );
    }
    return Result.ok(result.data);
  },
};
