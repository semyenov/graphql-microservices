import { EventBus } from '@graphql-microservices/event-sourcing';
import { logError, logInfo } from '@graphql-microservices/logger';
import type { DomainEvent } from '../../domain/events';
import type { PrismaClient } from '../../generated/prisma';
import { createOrderEventHandlers } from '../event-handlers';

export class OrderProjectionService {
  private eventBus: EventBus;
  private eventHandlers: ReturnType<typeof createOrderEventHandlers>;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventStoreUrl?: string
  ) {
    this.eventBus = new EventBus();
    this.eventHandlers = createOrderEventHandlers(prisma);
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Register all event handlers with the event bus
    this.eventBus.subscribe('OrderCreated', this.eventHandlers.orderCreated);
    this.eventBus.subscribe('OrderCancelled', this.eventHandlers.orderCancelled);
    this.eventBus.subscribe('OrderStatusChanged', this.eventHandlers.orderStatusChanged);
    this.eventBus.subscribe('OrderShippingUpdated', this.eventHandlers.orderShippingUpdated);
    this.eventBus.subscribe('OrderItemAdded', this.eventHandlers.orderItemAdded);
    this.eventBus.subscribe('OrderItemRemoved', this.eventHandlers.orderItemRemoved);
    this.eventBus.subscribe('OrderPaymentUpdated', this.eventHandlers.orderPaymentUpdated);
    this.eventBus.subscribe('OrderRefunded', this.eventHandlers.orderRefunded);
  }

  /**
   * Start the projection service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logInfo('Order projection service is already running');
      return;
    }

    try {
      logInfo('Starting order projection service');
      this.isRunning = true;

      // In a real implementation, this would:
      // 1. Connect to the event store
      // 2. Subscribe to order events
      // 3. Process events in real-time
      // 4. Handle event replay for rebuilding projections

      logInfo('Order projection service started successfully');
    } catch (error) {
      this.isRunning = false;
      logError('Failed to start order projection service', error as Error);
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
      logInfo('Stopping order projection service');
      this.isRunning = false;

      // Clean up resources
      await this.prisma.$disconnect();

      logInfo('Order projection service stopped');
    } catch (error) {
      logError('Error stopping order projection service', error as Error);
      throw error;
    }
  }

  /**
   * Process a single event
   */
  async processEvent(event: DomainEvent): Promise<void> {
    try {
      await this.eventBus.publish(event.type, event);
    } catch (error) {
      logError(`Failed to process event ${event.type}`, error as Error, { event });
      throw error;
    }
  }

  /**
   * Rebuild projections from event store
   */
  async rebuildProjections(fromEventNumber: number = 0): Promise<void> {
    try {
      logInfo('Rebuilding order projections', { fromEventNumber });

      // In a real implementation, this would:
      // 1. Clear existing projections (or use a new table)
      // 2. Replay all events from the event store
      // 3. Process each event through the handlers
      // 4. Update checkpoint/position tracking

      logInfo('Order projections rebuilt successfully');
    } catch (error) {
      logError('Failed to rebuild projections', error as Error);
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
  ) { }

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
