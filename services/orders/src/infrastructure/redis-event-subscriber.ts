import { Result } from '@graphql-microservices/shared-result';
import { logError, logInfo } from '@shared/utils';
import { Redis } from 'ioredis';
import { getOrdersCQRS } from './cqrs-integration';

export interface EventSubscriberConfig {
  redisUrl: string;
  channels: string[];
}

export class OrdersRedisEventSubscriber {
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;
  private isRunning = false;

  constructor(private readonly config: EventSubscriberConfig) {}

  async initialize(): Promise<void> {
    try {
      // Create Redis clients
      this.subscriber = new Redis(this.config.redisUrl);
      this.publisher = new Redis(this.config.redisUrl);

      // Set up error handlers
      this.subscriber.on('error', (error) => {
        logError(`Redis subscriber error: ${error}`);
      });

      this.publisher.on('error', (error) => {
        logError(`Redis publisher error: ${error}`);
      });

      // Set up message handler
      this.subscriber.on('message', async (channel, message) => {
        await this.handleMessage(channel, message);
      });

      logInfo('📡 Redis event subscriber connected');
    } catch (error) {
      logError(`Failed to initialize Redis event subscriber: ${error}`);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (this.isRunning || !this.subscriber) {
      return;
    }

    try {
      // Subscribe to channels
      await this.subscriber.subscribe(...this.config.channels);
      this.isRunning = true;

      logInfo(`📥 Subscribed to channels: ${this.config.channels.join(', ')}`);
    } catch (error) {
      logError(`Failed to start event subscriber: ${error}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.subscriber) {
      return;
    }

    try {
      await this.subscriber.unsubscribe();
      this.isRunning = false;

      logInfo('📤 Unsubscribed from all channels');
    } catch (error) {
      logError(`Failed to stop event subscriber: ${error}`);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.stop();

    if (this.subscriber) {
      this.subscriber.disconnect();
      this.subscriber = null;
    }

    if (this.publisher) {
      this.publisher.disconnect();
      this.publisher = null;
    }
  }

  private async handleMessage(channel: string, message: string): Promise<void> {
    try {
      const event = JSON.parse(message);

      logInfo(
        `Received event on channel ${channel} ${JSON.stringify(
          {
            eventType: event.type,
            aggregateId: event.aggregateId,
          },
          null,
          2
        )}`
      );

      // Route events based on channel
      switch (channel) {
        case 'cross-service.product.events':
          await this.handleProductEvent(event);
          break;

        case 'cross-service.user.events':
          await this.handleUserEvent(event);
          break;

        case 'cross-service.payment.events':
          await this.handlePaymentEvent(event);
          break;

        case 'inventory.responses':
          await this.handleInventoryResponse(event);
          break;

        default:
          logInfo(`Unhandled channel: ${channel}`);
      }
    } catch (error) {
      logError(`Failed to handle message on channel ${channel}: ${error}`);
    }
  }

  private async handleProductEvent(event: any): Promise<void> {
    const cqrs = getOrdersCQRS();

    switch (event.type) {
      case 'ProductDeactivated':
        // Handle product deactivation - might need to update or cancel orders
        logInfo(`Product deactivated: ${event.aggregateId}`);
        break;

      case 'ProductPriceChanged':
        // Log price changes for audit purposes
        logInfo(`Product price changed: ${event.aggregateId} ${event.data.newPrice}`);
        break;
    }
  }

  private async handleUserEvent(event: any): Promise<void> {
    switch (event.type) {
      case 'UserDeactivated':
        // Handle user deactivation - might affect order processing
        logInfo(`User deactivated: ${event.aggregateId}`);
        break;

      case 'UserAddressUpdated':
        // Could update default shipping addresses for pending orders
        logInfo(`User address updated: ${event.aggregateId}`);
        break;
    }
  }

  private async handlePaymentEvent(event: any): Promise<void> {
    const cqrs = getOrdersCQRS();
    const commandBus = cqrs.getCommandBus();

    switch (event.type) {
      case 'PaymentSucceeded':
        // Process payment confirmation
        if (event.data.orderId) {
          const result = await commandBus.execute('ProcessPayment', {
            id: crypto.randomUUID(),
            type: 'ProcessPayment',
            payload: {
              orderId: event.data.orderId,
              amount: event.data.amount,
              method: event.data.paymentMethod,
              transactionId: event.data.transactionId,
              processedBy: 'payment-service',
            },
            metadata: {
              source: 'payment-service',
              correlationId: event.correlationId,
            },
            createdAt: new Date(),
          });

          if (Result.isErr(result)) {
            logError(`Failed to process payment command: ${result.error.message}`);
          }
        }
        break;

      case 'PaymentFailed':
        // Handle payment failure
        logError(`Payment failed for order: ${event.data.orderId} ${event.data.reason}`);
        break;

      case 'RefundCompleted':
        // Handle refund completion
        if (event.data.orderId) {
          const result = await commandBus.execute('RefundOrder', {
            id: crypto.randomUUID(),
            type: 'RefundOrder',
            payload: {
              orderId: event.data.orderId,
              amount: event.data.amount,
              currency: event.data.currency || 'USD',
              reason: event.data.reason,
              refundedBy: 'payment-service',
              transactionId: event.data.transactionId,
            },
            metadata: {
              source: 'payment-service',
              correlationId: event.correlationId,
            },
            createdAt: new Date(),
          });

          if (Result.isErr(result)) {
            logError(`Failed to process refund command: ${result.error.message}`);
          }
        }
        break;
    }
  }

  private async handleInventoryResponse(event: any): Promise<void> {
    const cqrs = getOrdersCQRS();
    const commandBus = cqrs.getCommandBus();

    switch (event.type) {
      case 'StockReserved':
        // Update order status to confirmed after stock reservation
        if (event.data.orderId) {
          const result = await commandBus.execute('UpdateOrderStatus', {
            id: crypto.randomUUID(),
            type: 'UpdateOrderStatus',
            payload: {
              orderId: event.data.orderId,
              status: 'CONFIRMED',
              updatedBy: 'inventory-service',
              notes: 'Stock reserved successfully',
            },
            metadata: {
              source: 'inventory-service',
              correlationId: event.correlationId,
            },
            createdAt: new Date(),
          });

          if (Result.isErr(result)) {
            logError(`Failed to update order status command: ${result.error.message}`);
          }
        }
        break;

      case 'StockReservationFailed':
        // Cancel order if stock reservation fails
        if (event.data.orderId) {
          const result = await commandBus.execute('CancelOrder', {
            id: crypto.randomUUID(),
            type: 'CancelOrder',
            payload: {
              orderId: event.data.orderId,
              reason: `Stock reservation failed: ${event.data.reason}`,
              cancelledBy: 'inventory-service',
            },
            metadata: {
              source: 'inventory-service',
              correlationId: event.correlationId,
            },
            createdAt: new Date(),
          });

          if (Result.isErr(result)) {
            logError(`Failed to cancel order command: ${result.error.message}`);
          }
        }
        break;
    }
  }

  async publishEvent(channel: string, event: any): Promise<void> {
    if (!this.publisher) {
      throw new Error('Redis publisher not initialized');
    }

    try {
      await this.publisher.publish(channel, JSON.stringify(event));

      logInfo(
        `Published event to channel ${channel} ${JSON.stringify(
          {
            eventType: event.type,
            aggregateId: event.aggregateId,
          },
          null,
          2
        )}`
      );
    } catch (error) {
      logError(`Failed to publish event to channel ${channel}: ${error}`);
      throw error;
    }
  }
}

// Factory function
export function createOrdersEventSubscriber(redisUrl: string): OrdersRedisEventSubscriber {
  const channels = [
    // Cross-service event channels
    'cross-service.product.events',
    'cross-service.user.events',
    'cross-service.payment.events',
    'cross-service.shipping.events',

    // Inventory service responses
    'inventory.responses',
    'inventory.stock.updates',

    // Payment service events
    'payment.processed',
    'payment.failed',
    'payment.refunded',

    // Shipping service events
    'shipping.dispatched',
    'shipping.delivered',
    'shipping.returned',
  ];

  return new OrdersRedisEventSubscriber({
    redisUrl,
    channels,
  });
}
