import { createEventBus, type EventBus } from '@graphql-microservices/event-sourcing';
import { createLogger } from '@graphql-microservices/logger';
import type { OrderEventMap } from '../../domain/order-aggregate';
import type { PrismaClient } from '../../generated/prisma';
import { createOrderEventHandlers } from '../event-handlers';

// Create logger for this module
const logger = createLogger({ service: 'orders-projection' });

export class OrderProjectionService {
  private eventBus: EventBus<OrderEventMap>;
  private eventHandlers: ReturnType<typeof createOrderEventHandlers>;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventStoreUrl?: string
  ) {
    this.eventBus = createEventBus<OrderEventMap>({
      async: true,
      onError: (error, event, handler) => {
        logger.error('Event handler error', error, {
          eventType: event.type,
          eventId: event.id,
          aggregateId: event.aggregateId,
          handler: handler.constructor.name,
        });
      },
    });
    this.eventHandlers = createOrderEventHandlers(prisma);
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Register all event handlers with the event bus using the builder pattern
    this.eventBus
      .register()
      .handler(this.eventHandlers.orderCreated)
      .handler(this.eventHandlers.orderCancelled)
      .handler(this.eventHandlers.orderStatusChanged)
      .handler(this.eventHandlers.orderShippingUpdated)
      .handler(this.eventHandlers.orderItemAdded)
      .handler(this.eventHandlers.orderItemRemoved)
      .handler(this.eventHandlers.orderPaymentUpdated)
      .handler(this.eventHandlers.orderRefunded)
      .build();
  }

  /**
   * Start the projection service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.info('Order projection service is already running');
      return;
    }

    try {
      logger.info('Starting order projection service');
      this.isRunning = true;

      // In a real implementation, this would:
      // 1. Connect to the event store
      // 2. Subscribe to order events
      // 3. Process events in real-time
      // 4. Handle event replay for rebuilding projections

      logger.info('Order projection service started successfully');
    } catch (error) {
      this.isRunning = false;
      logger.error('Failed to start order projection service', error as Error);
      throw error;
    }
  }

  /**
   * Stop the projection service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      logger.info('Stopping order projection service');
      this.isRunning = false;

      // Clean up resources
      await this.prisma.$disconnect();

      logger.info('Order projection service stopped');
    } catch (error) {
      logger.error('Error stopping order projection service', error as Error);
      throw error;
    }
  }

  /**
   * Process a single event
   */
  async processEvent(event: OrderEventMap[keyof OrderEventMap]): Promise<void> {
    try {
      await this.eventBus.publish(event);
    } catch (error) {
      logger.error(`Failed to process event ${event.type}`, error as Error, { event });
      throw error;
    }
  }

  /**
   * Rebuild projections from event store
   */
  async rebuildProjections(fromEventNumber: number = 0): Promise<void> {
    try {
      logger.info('Rebuilding order projections', { fromEventNumber });

      // In a real implementation, this would:
      // 1. Clear existing projections (or use a new table)
      // 2. Replay all events from the event store
      // 3. Process each event through the handlers
      // 4. Update checkpoint/position tracking

      logger.info('Order projections rebuilt successfully');
    } catch (error) {
      logger.error('Failed to rebuild projections', error as Error);
      throw error;
    }
  }

  /**
   * Get current projection position
   */
  async getCurrentPosition(): Promise<number> {
    // In a real implementation, this would track the last processed event position
    // This helps with resuming after restarts and avoiding duplicate processing
    return 0;
  }

  /**
   * Update projection position
   */
  async updatePosition(position: number): Promise<void> {
    // Store the last successfully processed event position
    // This ensures exactly-once processing semantics
  }
}

/**
 * Cross-service event routing
 * Routes events to other services that might be interested
 */
export class OrderEventRouter {
  constructor(
    private readonly redisPublisher: any // Redis publisher from shared package
  ) {}

  async routeOrderCreated(event: any): Promise<void> {
    // Publish to inventory service for stock reservation
    await this.redisPublisher.publish('inventory.reserve', {
      orderId: event.aggregateId,
      items: event.payload.items.map((item: any) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    });

    // Publish to notification service
    await this.redisPublisher.publish('notifications.order.created', {
      orderId: event.aggregateId,
      customerId: event.payload.customerId,
      orderNumber: event.payload.orderNumber,
      total: event.payload.total,
    });
  }

  async routeOrderCancelled(event: any): Promise<void> {
    // Publish to inventory service to release reservations
    await this.redisPublisher.publish('inventory.release', {
      orderId: event.aggregateId,
    });

    // Publish to notification service
    await this.redisPublisher.publish('notifications.order.cancelled', {
      orderId: event.aggregateId,
      reason: event.payload.reason,
    });
  }

  async routeOrderShipped(event: any): Promise<void> {
    // Publish to notification service
    await this.redisPublisher.publish('notifications.order.shipped', {
      orderId: event.aggregateId,
      trackingNumber: event.payload.trackingNumber,
      carrier: event.payload.carrier,
    });
  }

  async routePaymentProcessed(event: any): Promise<void> {
    // Publish to accounting service
    await this.redisPublisher.publish('accounting.payment.received', {
      orderId: event.aggregateId,
      amount: event.payload.amount,
      transactionId: event.payload.transactionId,
    });
  }

  async routeOrderRefunded(event: any): Promise<void> {
    // Publish to accounting service
    await this.redisPublisher.publish('accounting.refund.processed', {
      orderId: event.aggregateId,
      amount: event.payload.amount,
      reason: event.payload.reason,
    });
  }
}
