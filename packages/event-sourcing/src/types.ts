import { generateId } from '@graphql-microservices/shared-errors';
import {
  BusinessRuleError,
  type DomainError,
  domainError,
  Result,
} from '@graphql-microservices/shared-result';
import { z } from 'zod';

/**
 * Base domain event interface
 */
export interface IDomainEvent<TData = Record<string, unknown>> {
  /** Unique event identifier */
  readonly id: string;

  /** Type of the event (e.g., 'UserCreated', 'OrderShipped') */
  readonly type: string;

  /** Aggregate ID this event belongs to */
  readonly aggregateId: string;

  /** Aggregate type (e.g., 'User', 'Order', 'Product') */
  readonly aggregateType: string;

  /** Event payload/data */
  readonly data: TData;

  /** Event metadata */
  readonly metadata: IEventMetadata;

  /** Timestamp when the event occurred */
  readonly occurredAt: Date;

  /** Version of the aggregate when this event was created */
  readonly version: number;
}

/**
 * Event metadata for tracing and auditing
 */
export interface IEventMetadata {
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
export interface IStreamPosition {
  /** Global position in the event store */
  readonly globalPosition: bigint;

  /** Position within the aggregate stream */
  readonly streamPosition: number;
}

/**
 * Stored event with position information
 */
export interface IStoredEvent<TData = Record<string, unknown>> extends IDomainEvent<TData> {
  /** Position in the event stream */
  readonly position: IStreamPosition;

  /** When the event was stored */
  readonly storedAt: Date;
}

/**
 * Event store query options
 */
export interface IEventStoreQuery {
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
 * Snapshot of aggregate state
 */
export interface ISnapshot<TState = unknown> {
  /** Aggregate ID */
  readonly aggregateId: string;

  /** Aggregate type */
  readonly aggregateType: string;

  /** Version at which snapshot was taken */
  readonly version: number;

  /** Serialized aggregate state */
  readonly state: TState;

  /** When the snapshot was created */
  readonly createdAt: Date;
}

/**
 * Command base interface
 */
export interface ICommand<TPayload = unknown> {
  /** Command ID */
  readonly id: string;

  /** Command type */
  readonly type: string;

  /** Command payload */
  readonly payload: TPayload;

  /** Command metadata */
  readonly metadata: ICommandMetadata;

  /** When the command was created */
  readonly createdAt: Date;
}

/**
 * Command metadata
 */
export interface ICommandMetadata {
  /** User who issued the command */
  readonly userId?: string;

  /** Correlation ID for tracing */
  readonly correlationId?: string;

  /** Source service */
  readonly source: string;

  /** Additional context */
  readonly context?: Record<string, unknown>;
}

/**
 * Command handler interface
 */
export interface ICommandHandler<TCommand extends ICommand = ICommand> {
  execute(command: TCommand): Promise<unknown>;
}

/**
 * Type alias for consistency with CQRS module
 */
export type CommandMetadata = ICommandMetadata;

/**
 * Aggregate state transition result
 */
export type StateTransition<TEvent extends IDomainEvent = IDomainEvent> =
  | { type: 'events'; events: TEvent[] }
  | { type: 'error'; error: DomainError };

/**
 * Aggregate lifecycle state
 */
export type AggregateState = 'active' | 'deleted' | 'archived';

/**
 * Business rule interface for domain validation
 */
export interface IBusinessRule<TAggregate = unknown> {
  readonly name: string;
  readonly message: string;
  check(aggregate: TAggregate): boolean;
}

/**
 * Domain invariant result
 */
export type InvariantResult = Result<void, DomainError>;

/**
 * Event application result with side effects
 */
export interface EventApplicationResult<TSideEffect = unknown> {
  readonly sideEffects?: TSideEffect[];
}

/**
 * Enhanced aggregate root with comprehensive Result integration and type safety
 */
export abstract class AggregateRoot<
  TEvent extends IDomainEvent = IDomainEvent,
  TSideEffect = unknown,
> {
  #id: string;
  #aggregateType: string;
  #uncommittedEvents: TEvent[] = [];
  #version: number = 0;
  #state: AggregateState = 'active';
  #createdAt: Date;
  #updatedAt: Date;
  #sideEffects: TSideEffect[] = [];

  constructor(id: string, version: number = 0, createdAt?: Date) {
    this.#id = id;
    this.#version = version;
    this.#aggregateType = this.constructor.name;
    this.#createdAt = createdAt || new Date();
    this.#updatedAt = this.#createdAt;
  }

  // Getters
  get id(): string {
    return this.#id;
  }

  get version(): number {
    return this.#version;
  }

  get aggregateType(): string {
    return this.#aggregateType;
  }

  get state(): AggregateState {
    return this.#state;
  }

  get isActive(): boolean {
    return this.#state === 'active';
  }

  get isDeleted(): boolean {
    return this.#state === 'deleted';
  }

  get isArchived(): boolean {
    return this.#state === 'archived';
  }

  get createdAt(): Date {
    return this.#createdAt;
  }

  get updatedAt(): Date {
    return this.#updatedAt;
  }

  get uncommittedEvents(): readonly TEvent[] {
    return [...this.#uncommittedEvents];
  }

  get sideEffects(): readonly TSideEffect[] {
    return [...this.#sideEffects];
  }

  get hasUncommittedEvents(): boolean {
    return this.#uncommittedEvents.length > 0;
  }

  get nextVersion(): number {
    return this.#version + this.#uncommittedEvents.length + 1;
  }

  /**
   * Execute a command with comprehensive error handling and business rule validation
   */
  protected executeCommand<TCommand extends ICommand, TResult = void>(
    command: TCommand,
    handler: (cmd: TCommand) => Result<TEvent[], DomainError>,
    options: {
      skipStateCheck?: boolean;
      businessRules?: IBusinessRule<this>[];
      maxEvents?: number;
    } = {}
  ): Result<TResult, DomainError> {
    // Check aggregate state
    if (!options.skipStateCheck && this.#state !== 'active') {
      return Result.err(
        domainError(
          'AGGREGATE_INVALID_STATE',
          `Cannot execute command on ${this.#aggregateType} ${this.#id} in state '${this.#state}'`
        )
      );
    }

    // Validate business rules
    if (options.businessRules) {
      const ruleViolation = this.checkBusinessRules(options.businessRules);
      if (Result.isErr(ruleViolation)) {
        return ruleViolation;
      }
    }

    // Execute command handler
    const result = handler(command);

    return Result.flatMap(result, (events) => {
      // Check event count limit
      if (options.maxEvents && events.length > options.maxEvents) {
        return Result.err(
          domainError(
            'TOO_MANY_EVENTS',
            `Command produced ${events.length} events, but maximum allowed is ${options.maxEvents}`
          )
        );
      }

      // Apply events with validation
      const applyResult = this.applyEvents(events);
      if (Result.isErr(applyResult)) {
        return applyResult;
      }

      return Result.ok(undefined as TResult);
    });
  }

  /**
   * Apply multiple events atomically
   */
  protected applyEvents(
    events: TEvent[]
  ): Result<EventApplicationResult<TSideEffect>, DomainError> {
    const originalState = this.captureState();
    const appliedEvents: TEvent[] = [];

    try {
      for (const event of events) {
        const result = this.applyEventSafely(event);
        if (Result.isErr(result)) {
          // Rollback on failure
          this.restoreState(originalState);
          return result;
        }
        appliedEvents.push(event);
      }

      return Result.ok({ sideEffects: [...this.#sideEffects] });
    } catch (error) {
      // Rollback on unexpected error
      this.restoreState(originalState);
      return Result.err(domainError('EVENT_APPLICATION_ERROR', 'Failed to apply events', error));
    }
  }

  /**
   * Apply a single event with comprehensive validation
   */
  protected applyEventSafely(event: TEvent): Result<void, DomainError> {
    // Validate event structure
    const validationResult = this.validateEvent(event);
    if (Result.isErr(validationResult)) {
      return validationResult;
    }

    // Check version consistency
    const expectedVersion = this.#version + this.#uncommittedEvents.length + 1;
    if (event.version !== expectedVersion) {
      return Result.err(
        domainError(
          'VERSION_MISMATCH',
          `Event version ${event.version} does not match expected version ${expectedVersion}`
        )
      );
    }

    // Apply the event
    this.#uncommittedEvents.push(event);
    this.#version = event.version;
    this.#updatedAt = event.occurredAt;

    // Apply state changes
    const stateResult = this.applyEventData(event);
    if (Result.isErr(stateResult)) {
      // Remove the event if state application failed
      this.#uncommittedEvents.pop();
      this.#version = event.version - 1;
      return stateResult;
    }

    // Check for state transitions
    this.handleStateTransitions(event);

    return Result.ok(undefined);
  }

  /**
   * Apply event data to aggregate state with Result-based error handling
   */
  protected abstract applyEventData(event: TEvent): Result<void, DomainError>;

  /**
   * Validate event before application
   */
  protected validateEvent(event: TEvent): Result<void, DomainError> {
    if (!event.id || !event.type || !event.aggregateId) {
      return Result.err(domainError('INVALID_EVENT', 'Event must have id, type, and aggregateId'));
    }

    if (event.aggregateId !== this.#id) {
      return Result.err(
        domainError(
          'AGGREGATE_ID_MISMATCH',
          `Event aggregateId ${event.aggregateId} does not match aggregate id ${this.#id}`
        )
      );
    }

    if (event.aggregateType !== this.#aggregateType) {
      return Result.err(
        domainError(
          'AGGREGATE_TYPE_MISMATCH',
          `Event aggregateType ${event.aggregateType} does not match aggregate type ${this.#aggregateType}`
        )
      );
    }

    return Result.ok(undefined);
  }

  /**
   * Handle aggregate state transitions based on events
   */
  protected handleStateTransitions(event: TEvent): void {
    if (this.isDeletionEvent(event)) {
      this.#state = 'deleted';
    } else if (this.isArchiveEvent(event)) {
      this.#state = 'archived';
    } else if (this.isReactivationEvent(event)) {
      this.#state = 'active';
    }
  }

  /**
   * Check if an event represents deletion
   */
  protected isDeletionEvent(event: TEvent): boolean {
    return (
      event.type.toLowerCase().includes('deleted') || event.type.toLowerCase().includes('removed')
    );
  }

  /**
   * Check if an event represents archiving
   */
  protected isArchiveEvent(event: TEvent): boolean {
    return event.type.toLowerCase().includes('archived');
  }

  /**
   * Check if an event represents reactivation
   */
  protected isReactivationEvent(event: TEvent): boolean {
    return (
      event.type.toLowerCase().includes('reactivated') ||
      event.type.toLowerCase().includes('restored')
    );
  }

  /**
   * Check business rules
   */
  protected checkBusinessRules(rules: IBusinessRule<this>[]): Result<void, DomainError> {
    for (const rule of rules) {
      if (!rule.check(this)) {
        return Result.err(BusinessRuleError(rule.message, { rule: rule.name }));
      }
    }
    return Result.ok(undefined);
  }

  /**
   * Add a side effect to be processed after event persistence
   */
  protected addSideEffect(sideEffect: TSideEffect): void {
    this.#sideEffects.push(sideEffect);
  }

  /**
   * Clear side effects (usually after processing)
   */
  public clearSideEffects(): void {
    this.#sideEffects = [];
  }

  /**
   * Mark all uncommitted events as committed
   */
  public markEventsAsCommitted(): void {
    this.#uncommittedEvents = [];
  }

  /**
   * Create event with enhanced metadata and validation
   */
  protected createEvent<TData>(
    type: string,
    data: TData,
    metadata: Partial<IEventMetadata> = {},
    options: {
      skipVersionIncrement?: boolean;
      customId?: string;
      customTimestamp?: Date;
    } = {}
  ): Result<TEvent, DomainError> {
    // Validate event type
    if (!type || type.trim().length === 0) {
      return Result.err(domainError('INVALID_EVENT_TYPE', 'Event type cannot be empty'));
    }

    // Validate data
    if (data === null || data === undefined) {
      return Result.err(
        domainError('INVALID_EVENT_DATA', 'Event data cannot be null or undefined')
      );
    }

    const version = options.skipVersionIncrement
      ? this.#version
      : this.#version + this.#uncommittedEvents.length + 1;

    const event = {
      id: options.customId || generateId(),
      type,
      aggregateId: this.#id,
      aggregateType: this.#aggregateType,
      data,
      metadata: {
        source: metadata.source || this.#aggregateType.toLowerCase(),
        ...metadata,
      },
      occurredAt: options.customTimestamp || new Date(),
      version,
    } as TEvent;

    return Result.ok(event);
  }

  /**
   * Capture current aggregate state for rollback
   */
  private captureState(): {
    uncommittedEvents: TEvent[];
    version: number;
    state: AggregateState;
    updatedAt: Date;
    sideEffects: TSideEffect[];
  } {
    return {
      uncommittedEvents: [...this.#uncommittedEvents],
      version: this.#version,
      state: this.#state,
      updatedAt: this.#updatedAt,
      sideEffects: [...this.#sideEffects],
    };
  }

  /**
   * Restore aggregate state from captured state
   */
  private restoreState(state: ReturnType<typeof this.captureState>): void {
    this.#uncommittedEvents = state.uncommittedEvents;
    this.#version = state.version;
    this.#state = state.state;
    this.#updatedAt = state.updatedAt;
    this.#sideEffects = state.sideEffects;
  }

  /**
   * Load aggregate from events with comprehensive error handling
   */
  public static loadFromEvents<T extends AggregateRoot>(
    this: new (
      id: string,
      version?: number,
      createdAt?: Date
    ) => T,
    events: IDomainEvent[]
  ): Result<T, DomainError> {
    if (events.length === 0) {
      return Result.err(
        domainError('EMPTY_EVENT_STREAM', 'Cannot load aggregate from empty event stream')
      );
    }

    const firstEvent = events[0];
    const aggregate = new AggregateRoot(firstEvent.aggregateId, 0, firstEvent.occurredAt);

    // Apply all events
    const applyResult = aggregate.applyEvents(events as any);
    if (Result.isErr(applyResult)) {
      return applyResult;
    }

    // Mark events as committed since they came from the event store
    aggregate.markEventsAsCommitted();

    return Result.ok(aggregate);
  }

  /**
   * Create a new aggregate with enhanced validation
   */
  public static create<T extends AggregateRoot>(
    this: new (
      id: string,
      version?: number,
      createdAt?: Date
    ) => T,
    id: string,
    creationEvent: IDomainEvent
  ): Result<T, DomainError> {
    if (!id || id.trim().length === 0) {
      return Result.err(domainError('INVALID_AGGREGATE_ID', 'Aggregate ID cannot be empty'));
    }

    const aggregate = new AggregateRoot(id, 0, creationEvent.occurredAt);

    const applyResult = aggregate.applyEventSafely(creationEvent as any);
    if (Result.isErr(applyResult)) {
      return applyResult;
    }

    return Result.ok(aggregate);
  }

  /**
   * Get aggregate summary for debugging and monitoring
   */
  public getSummary(): {
    id: string;
    type: string;
    version: number;
    state: AggregateState;
    uncommittedEventCount: number;
    sideEffectCount: number;
    createdAt: Date;
    updatedAt: Date;
  } {
    return {
      id: this.#id,
      type: this.#aggregateType,
      version: this.#version,
      state: this.#state,
      uncommittedEventCount: this.#uncommittedEvents.length,
      sideEffectCount: this.#sideEffects.length,
      createdAt: this.#createdAt,
      updatedAt: this.#updatedAt,
    };
  }

  /**
   * Check aggregate invariants (to be implemented by subclasses)
   */
  protected checkInvariants(): InvariantResult {
    return Result.ok(undefined);
  }

  /**
   * Validate aggregate state consistency
   */
  public validateState(): Result<void, DomainError> {
    const invariantsResult = this.checkInvariants();
    if (Result.isErr(invariantsResult)) {
      return invariantsResult;
    }

    // Check basic consistency
    if (this.#version < 0) {
      return Result.err(domainError('INVALID_VERSION', 'Aggregate version cannot be negative'));
    }

    if (this.#updatedAt < this.#createdAt) {
      return Result.err(
        domainError('INVALID_TIMESTAMPS', 'Updated timestamp cannot be before created timestamp')
      );
    }

    return Result.ok(undefined);
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
  id: z.string(),
  type: z.string().min(1),
  aggregateId: z.string(),
  aggregateType: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  metadata: eventMetadataSchema,
  occurredAt: z.date(),
  version: z.number().positive(),
});

export const storedEventSchema = domainEventSchema.extend({
  position: z.object({
    globalPosition: z.bigint(),
    streamPosition: z.number().nonnegative(),
  }),
  storedAt: z.date(),
});

export const snapshotSchema = z.object({
  aggregateId: z.string(),
  aggregateType: z.string(),
  version: z.number().nonnegative(),
  state: z.unknown(),
  createdAt: z.date(),
});

export const commandMetadataSchema = z.object({
  userId: z.string().optional(),
  correlationId: z.string().optional(),
  source: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const commandSchema = z.object({
  id: z.string(),
  type: z.string().min(1),
  payload: z.unknown(),
  metadata: commandMetadataSchema,
  createdAt: z.date(),
});

/**
 * Type guards and utilities
 */
export function isDomainEvent(obj: unknown): obj is IDomainEvent {
  return domainEventSchema.safeParse(obj).success;
}

export function isStoredEvent(obj: unknown): obj is IStoredEvent {
  return storedEventSchema.safeParse(obj).success;
}

export function isCommand(obj: unknown): obj is ICommand {
  return commandSchema.safeParse(obj).success;
}

export function isSnapshot(obj: unknown): obj is ISnapshot {
  return snapshotSchema.safeParse(obj).success;
}

/**
 * Event factory for creating events with proper metadata
 */
export class EventFactory {
  static create<TData = Record<string, unknown>>(
    type: string,
    aggregateId: string,
    aggregateType: string,
    data: TData,
    metadata: Partial<IEventMetadata>,
    version: number,
    id?: string,
    occurredAt?: Date
  ): IDomainEvent<TData> {
    return {
      id: id || generateId(),
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
  }

  static createFromCommand<TData = Record<string, unknown>>(
    command: ICommand,
    type: string,
    aggregateId: string,
    aggregateType: string,
    data: TData,
    version: number
  ): IDomainEvent<TData> {
    return EventFactory.create(
      type,
      aggregateId,
      aggregateType,
      data,
      {
        userId: command.metadata.userId,
        correlationId: command.metadata.correlationId,
        causationId: command.id,
        source: command.metadata.source,
        context: command.metadata.context,
      },
      version
    );
  }
}

/**
 * Command factory
 */
export class CommandFactory {
  static create<TPayload = unknown>(
    type: string,
    payload: TPayload,
    metadata: Partial<ICommandMetadata> = {},
    id?: string
  ): ICommand<TPayload> {
    return {
      id: id || generateId(),
      type,
      payload,
      metadata: {
        source: metadata.source || 'unknown',
        ...metadata,
      },
      createdAt: new Date(),
    };
  }

  static generateId(): string {
    return generateId();
  }
}

/**
 * Event sourcing error types
 */
export const EventSourcingErrors = {
  AggregateNotFound: (aggregateType: string, id: string) =>
    domainError('AGGREGATE_NOT_FOUND', `${aggregateType} with id ${id} not found`),

  ConcurrencyConflict: (expectedVersion: number, actualVersion: number) =>
    domainError(
      'CONCURRENCY_CONFLICT',
      `Expected version ${expectedVersion} but current version is ${actualVersion}`
    ),

  InvalidEventSequence: (message: string) => domainError('INVALID_EVENT_SEQUENCE', message),

  SnapshotNotFound: (aggregateId: string) =>
    domainError('SNAPSHOT_NOT_FOUND', `Snapshot not found for aggregate ${aggregateId}`),

  EventStoreError: (message: string, details?: unknown) =>
    domainError('EVENT_STORE_ERROR', message, details),
};

/**
 * Projection interface for read models
 */
export interface IProjection<TState = unknown> {
  /** Projection name */
  readonly name: string;

  /** Current state */
  readonly state: TState;

  /** Last processed event position */
  readonly lastPosition: bigint;

  /** Handle an event and update state */
  handle(event: IStoredEvent): Promise<void>;

  /** Get current state */
  getState(): TState;

  /** Reset projection to initial state */
  reset(): Promise<void>;
}

/**
 * Saga interface for process managers
 */
export interface ISaga {
  /** Saga ID */
  readonly id: string;

  /** Saga type */
  readonly type: string;

  /** Current state */
  readonly state: 'active' | 'completed' | 'failed' | 'compensating';

  /** Handle an event and potentially produce commands */
  handle(event: IStoredEvent): Promise<ICommand[]>;

  /** Check if saga is complete */
  isComplete(): boolean;
}

/**
 * Event stream interface
 */
export interface IEventStream {
  /** Stream ID (usually aggregate ID) */
  readonly streamId: string;

  /** Stream type (usually aggregate type) */
  readonly streamType: string;

  /** Current version */
  readonly version: number;

  /** Append events to stream */
  append(events: IDomainEvent[], expectedVersion?: number): Promise<Result<void, DomainError>>;

  /** Read events from stream */
  read(fromVersion?: number, toVersion?: number): Promise<Result<IStoredEvent[], DomainError>>;

  /** Get stream metadata */
  getMetadata(): Promise<Result<IStreamMetadata, DomainError>>;
}

/**
 * Stream metadata
 */
export interface IStreamMetadata {
  /** Stream ID */
  readonly streamId: string;

  /** Stream type */
  readonly streamType: string;

  /** Current version */
  readonly version: number;

  /** Created timestamp */
  readonly createdAt: Date;

  /** Last updated timestamp */
  readonly updatedAt: Date;

  /** Custom metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Typed event map for compile-time safety
 */
export type TypedEventMap<T extends Record<string, IDomainEvent>> = T;

/**
 * Helper to define event maps
 */
export type DefineEventMap<T extends Record<string, IDomainEvent>> = {
  [K in keyof T]: T[K] extends IDomainEvent ? T[K] : never;
};

/**
 * Extract event types from event map
 */
export type EventMapTypes<T extends TypedEventMap<any>> = keyof T;

/**
 * Extract event union from event map
 */
export type EventMapUnion<T extends TypedEventMap<any>> = T[keyof T];
