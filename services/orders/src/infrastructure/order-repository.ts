import {
  type AsyncResult,
  BaseRepository,
  type DomainError,
  type IDomainEvent,
  type IEventStore,
  type ISnapshot,
  type IStoredEvent,
} from '@graphql-microservices/event-sourcing';
import { createLogger } from '@graphql-microservices/logger';
import { generateId } from '@graphql-microservices/shared-errors';
import { domainError, NotFoundError, Result } from '@graphql-microservices/shared-result';
import type { DomainEvent } from '../domain/events';
import { Order } from '../domain/order-aggregate';
import {
  Address,
  Money,
  OrderNumber,
  OrderQuantity,
  PaymentInfo,
  ShippingInfo,
} from '../domain/value-objects';

// Create logger instance
const logger = createLogger({ service: 'order-repository' });

/**
 * Repository for Order aggregates with comprehensive event sourcing support
 */
export class OrderRepository extends BaseRepository<Order, string> {
  constructor(
    eventStore: IEventStore,
    options: {
      snapshotFrequency?: number;
    } = {}
  ) {
    super(eventStore, 'Order', {
      snapshotFrequency: options.snapshotFrequency || 10, // Create snapshot every 10 events
    });
  }

  /**
   * Load Order aggregate from stored events
   */
  protected async loadFromEvents(events: IStoredEvent[]): AsyncResult<Order | null, DomainError> {
    if (events.length === 0) {
      return Result.ok(null);
    }

    try {
      // Get aggregate ID from first event
      const aggregateId = events[0].aggregateId;
      const order = new Order(aggregateId, 0);

      // Apply all events to reconstruct state
      for (const storedEvent of events) {
        // Convert stored event to domain event format
        const domainEvent: DomainEvent = {
          ...storedEvent,
          timestamp: storedEvent.occurredAt, // Map occurredAt to timestamp for compatibility
        };

        const applyResult = order.applyEventData(domainEvent);
        if (Result.isErr(applyResult)) {
          logger.error('Failed to apply event during aggregate reconstruction', {
            aggregateId,
            eventId: storedEvent.id,
            eventType: storedEvent.type,
            error: applyResult.error,
          });
          return applyResult;
        }
      }

      // Mark events as committed (they're already persisted)
      order.markEventsAsCommitted();

      logger.debug('Successfully loaded Order aggregate from events', {
        aggregateId,
        eventCount: events.length,
        finalVersion: order.version,
      });

      return Result.ok(order);
    } catch (error) {
      return Result.err(
        domainError(
          'AGGREGATE_RECONSTRUCTION_FAILED',
          'Failed to reconstruct Order from events',
          error
        )
      );
    }
  }

  /**
   * Load Order aggregate from snapshot plus subsequent events
   */
  protected async loadFromSnapshot(
    snapshot: ISnapshot,
    events: IStoredEvent[]
  ): AsyncResult<Order | null, DomainError> {
    try {
      // Deserialize order from snapshot
      const deserializeResult = await this.deserializeSnapshot(snapshot.state);
      if (Result.isErr(deserializeResult)) {
        logger.warn('Failed to deserialize snapshot, falling back to events', {
          aggregateId: snapshot.aggregateId,
          snapshotVersion: snapshot.version,
          error: deserializeResult.error,
        });

        // Fallback: load all events from beginning
        const allEventsResult = await this.eventStore.readStream(snapshot.aggregateId);
        if (Result.isErr(allEventsResult)) {
          return allEventsResult;
        }
        return this.loadFromEvents(allEventsResult.value);
      }

      const order = deserializeResult.value;

      // Apply events that occurred after the snapshot
      if (events.length > 0) {
        for (const storedEvent of events) {
          const domainEvent: DomainEvent = {
            ...storedEvent,
            timestamp: storedEvent.occurredAt,
          };

          const applyResult = order.applyEventData(domainEvent);
          if (Result.isErr(applyResult)) {
            logger.error('Failed to apply event after snapshot', {
              aggregateId: snapshot.aggregateId,
              eventId: storedEvent.id,
              eventType: storedEvent.type,
              error: applyResult.error,
            });
            return applyResult;
          }
        }
      }

      order.markEventsAsCommitted();

      logger.debug('Successfully loaded Order aggregate from snapshot', {
        aggregateId: snapshot.aggregateId,
        snapshotVersion: snapshot.version,
        additionalEvents: events.length,
        finalVersion: order.version,
      });

      return Result.ok(order);
    } catch (error) {
      return Result.err(
        domainError(
          'SNAPSHOT_RECONSTRUCTION_FAILED',
          'Failed to reconstruct Order from snapshot',
          error
        )
      );
    }
  }

  /**
   * Create new Order aggregate from creation event
   */
  protected async createFromEvent(
    id: string,
    event: IDomainEvent
  ): AsyncResult<Order, DomainError> {
    if (event.type !== 'OrderCreated') {
      return Result.err(
        domainError('INVALID_CREATION_EVENT', `Cannot create Order from event type: ${event.type}`)
      );
    }

    try {
      const order = new Order(id, 0);
      const domainEvent: DomainEvent = {
        ...event,
        timestamp: event.occurredAt,
      };

      const applyResult = order.applyEventData(domainEvent);
      if (Result.isErr(applyResult)) {
        return applyResult;
      }

      logger.debug('Created new Order aggregate from creation event', {
        aggregateId: id,
        eventId: event.id,
      });

      return Result.ok(order);
    } catch (error) {
      return Result.err(
        domainError('ORDER_CREATION_FROM_EVENT_FAILED', 'Failed to create Order from event', error)
      );
    }
  }

  /**
   * Serialize Order aggregate to snapshot data
   */
  protected async serializeSnapshot(order: Order): AsyncResult<unknown, DomainError> {
    try {
      const snapshotData = {
        id: order.id,
        version: order.version,
        orderNumber: order.orderNumber.getValue(),
        customerId: order.customerId,
        status: order.status,
        items: Array.from(order.items.entries()).map(([itemId, item]) => ({
          id: itemId,
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          quantity: item.quantity.getValue(),
          unitPrice: item.unitPrice.toJSON(),
          totalPrice: item.totalPrice.toJSON(),
        })),
        subtotal: order.subtotal.toJSON(),
        tax: order.tax.toJSON(),
        shippingCost: order.shippingCost.toJSON(),
        totalAmount: order.totalAmount.toJSON(),
        shippingAddress: order.shippingAddress.toJSON(),
        billingAddress: order.billingAddress?.toJSON(),
        paymentInfo: order.paymentInfo.toJSON(),
        shippingInfo: order.shippingInfo.toJSON(),
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        aggregateType: 'Order',
      };

      logger.debug('Serialized Order aggregate for snapshot', {
        aggregateId: order.id,
        version: order.version,
        itemCount: snapshotData.items.length,
      });

      return Result.ok(snapshotData);
    } catch (error) {
      return Result.err(
        domainError(
          'SNAPSHOT_SERIALIZATION_FAILED',
          'Failed to serialize Order for snapshot',
          error
        )
      );
    }
  }

  /**
   * Deserialize Order aggregate from snapshot data
   */
  protected async deserializeSnapshot(data: unknown): AsyncResult<Order, DomainError> {
    try {
      // Validate snapshot data structure
      if (!data || typeof data !== 'object') {
        return Result.err(
          domainError('INVALID_SNAPSHOT_DATA', 'Snapshot data is not a valid object')
        );
      }

      const snapshot = data as any;

      // Validate required fields
      if (!snapshot.id || !snapshot.orderNumber || !snapshot.customerId) {
        return Result.err(
          domainError('INVALID_SNAPSHOT_DATA', 'Missing required fields in snapshot')
        );
      }

      // Create Order instance
      const order = new Order(snapshot.id, snapshot.version || 0);

      // Reconstruct value objects and state
      const orderNumber = OrderNumber.fromString(snapshot.orderNumber);
      const shippingAddress = Address.fromJSON(snapshot.shippingAddress);
      const paymentInfo = PaymentInfo.fromJSON(snapshot.paymentInfo);
      const shippingInfo = ShippingInfo.fromJSON(snapshot.shippingInfo);

      // Reconstruct order items
      const items = new Map();
      if (snapshot.items && Array.isArray(snapshot.items)) {
        for (const itemData of snapshot.items) {
          const item = {
            id: itemData.id,
            productId: itemData.productId,
            productName: itemData.productName,
            productSku: itemData.productSku,
            quantity: OrderQuantity.fromNumber(itemData.quantity),
            unitPrice: Money.fromJSON(itemData.unitPrice),
            totalPrice: Money.fromJSON(itemData.totalPrice),
          };
          items.set(itemData.id, item);
        }
      }

      // Set internal state (this would normally be done through private setters or reflection)
      // For now, we'll reconstruct by applying a synthetic creation event
      const creationEventData = {
        orderNumber: snapshot.orderNumber,
        customerId: snapshot.customerId,
        items: Array.from(items.values()).map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          quantity: item.quantity.getValue(),
          unitPrice: item.unitPrice.toJSON(),
          totalPrice: item.totalPrice.toJSON(),
        })),
        subtotal: snapshot.subtotal,
        tax: snapshot.tax,
        shippingCost: snapshot.shippingCost,
        totalAmount: snapshot.totalAmount,
        shippingAddress: snapshot.shippingAddress,
        billingAddress: snapshot.billingAddress,
        paymentInfo: snapshot.paymentInfo,
        shippingInfo: snapshot.shippingInfo,
      };

      const syntheticEvent: DomainEvent = {
        id: generateId(),
        type: 'OrderCreated',
        aggregateId: snapshot.id,
        aggregateType: 'Order',
        data: creationEventData,
        metadata: {
          source: 'snapshot-reconstruction',
          correlationId: generateId(),
        },
        occurredAt: new Date(snapshot.createdAt),
        timestamp: new Date(snapshot.createdAt),
        version: 1,
      };

      const applyResult = order.applyEventData(syntheticEvent);
      if (Result.isErr(applyResult)) {
        return applyResult;
      }

      // Update status if different from initial
      if (snapshot.status !== 'pending') {
        // Apply synthetic status change event
        const statusEvent: DomainEvent = {
          id: generateId(),
          type: 'OrderStatusChanged',
          aggregateId: snapshot.id,
          aggregateType: 'Order',
          data: {
            orderNumber: snapshot.orderNumber,
            newStatus: snapshot.status,
            previousStatus: 'pending',
          },
          metadata: {
            source: 'snapshot-reconstruction',
            correlationId: generateId(),
          },
          occurredAt: new Date(snapshot.updatedAt),
          timestamp: new Date(snapshot.updatedAt),
          version: snapshot.version,
        };

        const statusApplyResult = order.applyEventData(statusEvent);
        if (Result.isErr(statusApplyResult)) {
          return statusApplyResult;
        }
      }

      logger.debug('Successfully deserialized Order aggregate from snapshot', {
        aggregateId: snapshot.id,
        version: snapshot.version,
        status: snapshot.status,
      });

      return Result.ok(order);
    } catch (error) {
      return Result.err(
        domainError(
          'SNAPSHOT_DESERIALIZATION_FAILED',
          'Failed to deserialize Order from snapshot',
          error
        )
      );
    }
  }

  /**
   * Create deletion event for soft delete
   */
  protected createDeletionEvent(
    order: Order,
    reason: string,
    deletedBy?: string,
    metadata?: Record<string, unknown>
  ): Result<IDomainEvent, DomainError> {
    try {
      const deletionEvent: IDomainEvent = {
        id: generateId(),
        type: 'OrderDeleted',
        aggregateId: order.id,
        aggregateType: 'Order',
        data: {
          orderNumber: order.orderNumber.getValue(),
          reason,
          deletedBy: deletedBy || 'system',
          originalStatus: order.status,
        },
        metadata: {
          source: 'order-repository',
          userId: deletedBy,
          ...metadata,
        },
        occurredAt: new Date(),
        version: order.nextVersion,
      };

      logger.debug('Created deletion event for Order', {
        aggregateId: order.id,
        reason,
        deletedBy,
      });

      return Result.ok(deletionEvent);
    } catch (error) {
      return Result.err(
        domainError('DELETION_EVENT_CREATION_FAILED', 'Failed to create deletion event', error)
      );
    }
  }

  /**
   * Find order by order number (convenience method)
   */
  async findByOrderNumber(orderNumber: string): AsyncResult<Order | null, DomainError> {
    // This would ideally use an index, but for now we'll implement a simple search
    // In production, you'd want to maintain a separate index table for quick lookups

    logger.debug('Searching for order by number', { orderNumber });

    // For now, return not found - this would require implementing a proper search mechanism
    // This is typically handled by maintaining read models/projections
    return Result.err(
      domainError(
        'SEARCH_NOT_IMPLEMENTED',
        'Order search by number requires read model implementation'
      )
    );
  }
}
