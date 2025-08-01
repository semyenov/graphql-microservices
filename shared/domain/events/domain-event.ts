/**
 * Enhanced domain event interface with better typing and metadata
 * This extends the event-sourcing DomainEvent with shared patterns
 */

/**
 * Base metadata that all domain events should include
 */
export interface DomainEventMetadata {
  /** Correlation ID for tracing requests across services */
  correlationId?: string;
  /** ID of the user who triggered this event */
  userId?: string;
  /** Service that originated this event */
  source?: string;
  /** Additional context information */
  context?: Record<string, unknown>;
  /** Version of the event schema */
  schemaVersion?: string;
  /** Event sequence number within the stream */
  sequence?: number;
  /** Causation ID linking this event to its cause */
  causationId?: string;
}

/**
 * Common event types across all domains
 */
export type DomainEventType =
  // User events
  | 'UserCreated'
  | 'UserProfileUpdated'
  | 'UserCredentialsUpdated'
  | 'UserRoleChanged'
  | 'UserPasswordChanged'
  | 'UserDeactivated'
  | 'UserReactivated'
  | 'UserSignedIn'
  | 'UserSignedOut'
  // Product events
  | 'ProductCreated'
  | 'ProductUpdated'
  | 'ProductPriceChanged'
  | 'ProductStockChanged'
  | 'ProductCategoryChanged'
  | 'ProductDeactivated'
  | 'ProductReactivated'
  | 'ProductStockReserved'
  | 'ProductStockReservationReleased'
  // Order events
  | 'OrderCreated'
  | 'OrderStatusChanged'
  | 'OrderItemAdded'
  | 'OrderItemRemoved'
  | 'OrderItemQuantityChanged'
  | 'OrderPaymentUpdated'
  | 'OrderShippingUpdated'
  | 'OrderCancelled'
  | 'OrderRefunded'
  // Integration events (cross-service)
  | 'InventoryReserved'
  | 'InventoryReleased'
  | 'PaymentProcessed'
  | 'ShipmentCreated'
  | 'NotificationSent';

/**
 * Enhanced domain event interface
 */
export interface EnhancedDomainEvent {
  /** Unique identifier for this event */
  id: string;
  /** Type of the event */
  type: DomainEventType;
  /** ID of the aggregate that emitted this event */
  aggregateId: string;
  /** Type of the aggregate */
  aggregateType: string;
  /** Event data payload */
  data: Record<string, unknown>;
  /** Enhanced metadata */
  metadata: DomainEventMetadata;
  /** When the event occurred in the domain */
  occurredAt: Date;
  /** Version of the aggregate when event was emitted */
  version: number;
}

/**
 * Event envelope for publishing across services
 */
export interface DomainEventEnvelope {
  /** The domain event */
  event: EnhancedDomainEvent;
  /** Publishing metadata */
  publishedAt: Date;
  /** Publisher service identifier */
  publisher: string;
  /** Routing key for message brokers */
  routingKey?: string;
  /** Message TTL in milliseconds */
  ttl?: number;
  /** Retry count for failed processing */
  retryCount?: number;
  /** Maximum retries allowed */
  maxRetries?: number;
}

/**
 * Event processing result
 */
export interface EventProcessingResult {
  /** Whether processing was successful */
  success: boolean;
  /** Error message if processing failed */
  error?: string;
  /** Processing duration in milliseconds */
  duration?: number;
  /** Additional processing metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Event handler interface
 */
export interface DomainEventHandler<T extends EnhancedDomainEvent = EnhancedDomainEvent> {
  /** Event types this handler can process */
  eventTypes: DomainEventType[];
  /** Handle the event */
  handle(event: T): Promise<EventProcessingResult>;
  /** Optional: Check if handler can process this specific event */
  canHandle?(event: EnhancedDomainEvent): boolean;
}

/**
 * Event publisher interface
 */
export interface DomainEventPublisher {
  /** Publish a single event */
  publish(event: EnhancedDomainEvent): Promise<void>;
  /** Publish multiple events in a batch */
  publishBatch(events: EnhancedDomainEvent[]): Promise<void>;
  /** Publish event with custom routing */
  publishWithRouting(event: EnhancedDomainEvent, routingKey: string): Promise<void>;
}

/**
 * Event subscriber interface
 */
export interface DomainEventSubscriber {
  /** Subscribe to specific event types */
  subscribe(eventTypes: DomainEventType[], handler: DomainEventHandler): Promise<void>;
  /** Subscribe to all events with pattern matching */
  subscribePattern(pattern: string, handler: DomainEventHandler): Promise<void>;
  /** Unsubscribe from events */
  unsubscribe(eventTypes: DomainEventType[]): Promise<void>;
  /** Start processing events */
  start(): Promise<void>;
  /** Stop processing events */
  stop(): Promise<void>;
}

/**
 * Event store query interface
 */
export interface DomainEventQuery {
  /** Filter by aggregate ID */
  aggregateId?: string;
  /** Filter by aggregate type */
  aggregateType?: string;
  /** Filter by event types */
  eventTypes?: DomainEventType[];
  /** Filter by date range */
  fromDate?: Date;
  toDate?: Date;
  /** Filter by user ID */
  userId?: string;
  /** Filter by correlation ID */
  correlationId?: string;
  /** Pagination */
  limit?: number;
  offset?: number;
  /** Ordering */
  orderBy?: 'occurredAt' | 'version';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Utility functions for working with domain events
 */
export class DomainEventUtils {
  /**
   * Create a correlation ID from an existing event
   */
  static extractCorrelationId(event: EnhancedDomainEvent): string {
    return event.metadata.correlationId || event.id;
  }

  /**
   * Create a causation ID linking events
   */
  static extractCausationId(event: EnhancedDomainEvent): string {
    return event.metadata.causationId || event.id;
  }

  /**
   * Check if event is from a specific service
   */
  static isFromService(event: EnhancedDomainEvent, serviceName: string): boolean {
    return event.metadata.source === serviceName;
  }

  /**
   * Check if event was caused by a specific user
   */
  static isByUser(event: EnhancedDomainEvent, userId: string): boolean {
    return event.metadata.userId === userId;
  }

  /**
   * Get event age in milliseconds
   */
  static getEventAge(event: EnhancedDomainEvent): number {
    return Date.now() - event.occurredAt.getTime();
  }

  /**
   * Check if event is within time window
   */
  static isWithinTimeWindow(event: EnhancedDomainEvent, windowMs: number): boolean {
    return DomainEventUtils.getEventAge(event) <= windowMs;
  }

  /**
   * Create event routing key
   */
  static createRoutingKey(event: EnhancedDomainEvent): string {
    return `${event.aggregateType.toLowerCase()}.${event.type.toLowerCase()}`;
  }

  /**
   * Validate event structure
   */
  static validate(event: EnhancedDomainEvent): boolean {
    return !!(
      event.id &&
      event.type &&
      event.aggregateId &&
      event.aggregateType &&
      event.data &&
      event.metadata &&
      event.occurredAt &&
      typeof event.version === 'number'
    );
  }

  /**
   * Sanitize event for logging (remove sensitive data)
   */
  static sanitizeForLogging(event: EnhancedDomainEvent): Partial<EnhancedDomainEvent> {
    return {
      id: event.id,
      type: event.type,
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      occurredAt: event.occurredAt,
      version: event.version,
      metadata: {
        correlationId: event.metadata.correlationId,
        source: event.metadata.source,
        userId: event.metadata.userId,
      },
      // Exclude data payload which might contain sensitive information
    };
  }

  /**
   * Create event fingerprint for deduplication
   */
  static createFingerprint(event: EnhancedDomainEvent): string {
    const key = `${event.aggregateId}:${event.type}:${event.version}:${event.occurredAt.toISOString()}`;
    return Buffer.from(key).toString('base64');
  }

  /**
   * Group events by aggregate
   */
  static groupByAggregate(events: EnhancedDomainEvent[]): Map<string, EnhancedDomainEvent[]> {
    const grouped = new Map<string, EnhancedDomainEvent[]>();

    for (const event of events) {
      const key = `${event.aggregateType}:${event.aggregateId}`;
      const group = grouped.get(key) || [];
      group.push(event);
      grouped.set(key, group);
    }

    return grouped;
  }

  /**
   * Sort events by version within aggregate
   */
  static sortByVersion(events: EnhancedDomainEvent[]): EnhancedDomainEvent[] {
    return [...events].sort((a, b) => a.version - b.version);
  }

  /**
   * Filter events by correlation chain
   */
  static filterByCorrelationChain(
    events: EnhancedDomainEvent[],
    correlationId: string
  ): EnhancedDomainEvent[] {
    return events.filter(
      (event) =>
        event.metadata.correlationId === correlationId ||
        event.metadata.causationId === correlationId ||
        event.id === correlationId
    );
  }

  /**
   * Extract event chain from causation links
   */
  static buildEventChain(events: EnhancedDomainEvent[]): EnhancedDomainEvent[][] {
    const eventMap = new Map(events.map((e) => [e.id, e]));
    const chains: EnhancedDomainEvent[][] = [];
    const processed = new Set<string>();

    for (const event of events) {
      if (processed.has(event.id)) continue;

      const chain: EnhancedDomainEvent[] = [];
      let current = event;

      // Follow causation chain backwards
      while (current && !processed.has(current.id)) {
        chain.unshift(current);
        processed.add(current.id);

        const causationId = current.metadata.causationId;
        current = causationId ? eventMap.get(causationId) : undefined;
      }

      if (chain.length > 0) {
        chains.push(chain);
      }
    }

    return chains;
  }
}

/**
 * Event factory for creating consistent events
 */
export class DomainEventFactory {
  /**
   * Create a domain event with proper metadata
   */
  static create<T extends Record<string, unknown>>(
    type: DomainEventType,
    aggregateId: string,
    aggregateType: string,
    data: T,
    metadata: Partial<DomainEventMetadata> = {},
    version: number = 1
  ): EnhancedDomainEvent {
    const now = new Date();

    return {
      id: crypto.randomUUID(),
      type,
      aggregateId,
      aggregateType,
      data,
      metadata: {
        source: metadata.source || 'unknown',
        correlationId: metadata.correlationId || crypto.randomUUID(),
        causationId: metadata.causationId,
        userId: metadata.userId,
        context: metadata.context,
        schemaVersion: metadata.schemaVersion || '1.0',
        sequence: metadata.sequence,
      },
      occurredAt: now,
      version,
    };
  }

  /**
   * Create event with causation from another event
   */
  static createCausedByEvent<T extends Record<string, unknown>>(
    type: DomainEventType,
    aggregateId: string,
    aggregateType: string,
    data: T,
    causedByEvent: EnhancedDomainEvent,
    additionalMetadata: Partial<DomainEventMetadata> = {},
    version: number = 1
  ): EnhancedDomainEvent {
    return DomainEventFactory.create(
      type,
      aggregateId,
      aggregateType,
      data,
      {
        correlationId: causedByEvent.metadata.correlationId,
        causationId: causedByEvent.id,
        source: additionalMetadata.source || causedByEvent.metadata.source,
        userId: additionalMetadata.userId || causedByEvent.metadata.userId,
        context: { ...causedByEvent.metadata.context, ...additionalMetadata.context },
        ...additionalMetadata,
      },
      version
    );
  }

  /**
   * Create integration event for cross-service communication
   */
  static createIntegrationEvent<T extends Record<string, unknown>>(
    type: DomainEventType,
    sourceEvent: EnhancedDomainEvent,
    targetService: string,
    data: T
  ): EnhancedDomainEvent {
    return DomainEventFactory.createCausedByEvent(
      type,
      sourceEvent.aggregateId,
      sourceEvent.aggregateType,
      data,
      sourceEvent,
      {
        source: targetService,
        context: {
          ...sourceEvent.metadata.context,
          integrationEvent: true,
          sourceService: sourceEvent.metadata.source,
          targetService,
        },
      },
      sourceEvent.version
    );
  }
}
