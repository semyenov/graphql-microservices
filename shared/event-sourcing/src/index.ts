// Core types and interfaces

// Event store abstractions
export * from './event-store';
// Outbox pattern implementation
export * from './outbox';
// PostgreSQL implementations
export { PostgreSQLEventStore } from './postgresql-event-store';
export { PostgreSQLOutboxStore } from './postgresql-outbox-store';
export * from './types';

// Version and metadata
export const VERSION = '1.0.0';

/**
 * Event sourcing utilities
 */
export const EventSourcingUtils = {
  /**
   * Generate a deterministic aggregate ID based on a business key
   * @param prefix Aggregate type prefix (e.g., 'user', 'order')
   * @param businessKey Business identifier (e.g., email, order number)
   * @returns UUID-formatted aggregate ID
   */
  generateAggregateId(_prefix: string, _businessKey: string): string {
    // In a real implementation, you might use a UUID v5 with a namespace
    // For now, we'll use crypto.randomUUID() but in practice you'd want deterministic IDs
    return crypto.randomUUID();
  },

  /**
   * Create a correlation ID for event tracing
   */
  generateCorrelationId(): string {
    return crypto.randomUUID();
  },

  /**
   * Create a causation ID from a correlation ID
   * @param correlationId The correlation ID to base the causation ID on
   */
  generateCausationId(correlationId?: string): string {
    return correlationId || crypto.randomUUID();
  },

  /**
   * Extract aggregate type from event type
   * @param eventType Event type (e.g., 'UserCreated')
   * @returns Aggregate type (e.g., 'User')
   */
  extractAggregateType(eventType: string): string {
    // Simple heuristic: remove common event suffixes
    const suffixes = ['Created', 'Updated', 'Deleted', 'Changed', 'Added', 'Removed'];
    for (const suffix of suffixes) {
      if (eventType.endsWith(suffix)) {
        return eventType.slice(0, -suffix.length);
      }
    }
    return eventType;
  },

  /**
   * Validate event ordering
   * @param events Array of events to validate
   * @throws Error if events are not properly ordered
   */
  validateEventOrdering(events: import('./types').DomainEvent[]): void {
    if (events.length <= 1) {
      return;
    }

    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const curr = events[i];

      if (curr?.version !== (prev?.version || 0) + 1) {
        throw new Error(
          `Invalid event ordering: expected version ${prev?.version || 0 + 1}, got ${curr?.version}`
        );
      }

      if (curr?.occurredAt && prev?.occurredAt && curr.occurredAt < prev.occurredAt) {
        throw new Error(
          `Invalid event ordering: event at version ${curr?.version} occurred before version ${prev?.version}`
        );
      }
    }
  },
};

/**
 * Event sourcing configuration helper
 */
export interface EventSourcingConfig {
  /** Event store configuration */
  eventStore: import('./event-store').EventStoreConfig;

  /** Outbox configuration */
  outbox?: import('./outbox').OutboxConfig;

  /** Enable event replay functionality */
  enableReplay?: boolean;

  /** Enable event projections */
  enableProjections?: boolean;

  /** Service name for event metadata */
  serviceName: string;
}

/**
 * Default event sourcing configuration
 */
export const defaultEventSourcingConfig: Partial<EventSourcingConfig> = {
  outbox: {
    maxRetries: 5,
    initialRetryDelay: 1000,
    retryBackoffMultiplier: 2,
    maxRetryDelay: 300000,
    batchSize: 10,
    processingInterval: 5000,
  },
  enableReplay: true,
  enableProjections: true,
};
