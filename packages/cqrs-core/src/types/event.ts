/**
 * Metadata that accompanies every event
 */
export interface IEventMetadata {
  readonly correlationId: string;
  readonly causationId?: string;
  readonly userId?: string;
  readonly timestamp: Date;
  readonly source: string;
  readonly version?: number;
  readonly [key: string]: unknown;
}

/**
 * Base interface for all events
 */
export interface IEvent<TType extends string = string, TData = unknown> {
  readonly type: TType;
  readonly data: TData;
  readonly metadata: IEventMetadata;
  readonly aggregateId?: string;
  readonly aggregateType?: string;
  readonly streamPosition?: number;
}

/**
 * Domain event that extends the base event
 */
export interface IDomainEvent<TType extends string = string, TData = unknown>
  extends IEvent<TType, TData> {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly streamPosition: number;
}

/**
 * Integration event for cross-service communication
 */
export interface IIntegrationEvent<TType extends string = string, TData = unknown>
  extends IEvent<TType, TData> {
  readonly targetService?: string;
  readonly replyTo?: string;
}

/**
 * Type for mapping event types to their corresponding event interfaces
 */
export type TypedEventMap<T extends Record<string, IEvent>> = T;

/**
 * Extract event types from an event map
 */
export type EventTypes<TMap extends TypedEventMap<any>> = keyof TMap & string;

/**
 * Get a specific event type from an event map
 */
export type EventType<
  TMap extends TypedEventMap<any>,
  TType extends EventTypes<TMap>,
> = TMap[TType];

/**
 * Event envelope for transport
 */
export interface IEventEnvelope<TEvent extends IEvent = IEvent> {
  readonly id: string;
  readonly event: TEvent;
  readonly timestamp: Date;
  readonly retryCount?: number;
}

/**
 * Event filter for subscriptions
 */
export interface IEventFilter {
  readonly eventTypes?: string[];
  readonly aggregateTypes?: string[];
  readonly aggregateIds?: string[];
  readonly metadata?: Record<string, unknown>;
}

/**
 * Event subscription options
 */
export interface IEventSubscriptionOptions {
  readonly filter?: IEventFilter;
  readonly fromPosition?: number | string;
  readonly batchSize?: number;
  readonly pollInterval?: number;
  readonly maxRetries?: number;
}
