import { Redis } from 'ioredis';
import { logInfo, logError } from '@graphql-microservices/shared-logging';
import { getOrdersCQRS } from './cqrs-integration';
import type { DomainEvent } from '../domain/events';

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
        logError('Redis subscriber error', error);
      });

      this.publisher.on('error', (error) => {
        logError('Redis publisher error', error);
      });

      // Set up message handler
      this.subscriber.on('message', async (channel, message) => {
        await this.handleMessage(channel, message);
      });

      logInfo('📡 Redis event subscriber connected');
    } catch (error) {
      logError('Failed to initialize Redis event subscriber', error as Error);
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
      
      logInfo('📥 Subscribed to channels:', this.config.channels.join(', '));
    } catch (error) {
      logError('Failed to start event subscriber', error as Error);
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
      logError('Failed to stop event subscriber', error as Error);
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
      
      logInfo(`Received event on channel ${channel}`, {
        eventType: event.type,
        aggregateId: event.aggregateId,
      });

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
      logError(`Failed to handle message on channel ${channel}`, error as Error, { message });
    }
  }

  private async handleProductEvent(event: any): Promise<void> {
    const cqrs = getOrdersCQRS();
    
    switch (event.type) {
      case 'ProductDeactivated':
        // Handle product deactivation - might need to update or cancel orders
        logInfo('Product deactivated', { productId: event.aggregateId });
        break;
        
      case 'ProductPriceChanged':
        // Log price changes for audit purposes
        logInfo('Product price changed', { 
          productId: event.aggregateId,
          newPrice: event.data.newPrice 
        });
        break;
    }
  }

  private async handleUserEvent(event: any): Promise<void> {
    switch (event.type) {
      case 'UserDeactivated':
        // Handle user deactivation - might affect order processing
        logInfo('User deactivated', { userId: event.aggregateId });
        break;
        
      case 'UserAddressUpdated':
        // Could update default shipping addresses for pending orders
        logInfo('User address updated', { userId: event.aggregateId });
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
          await commandBus.execute({
            type: 'ProcessPayment',
            aggregateId: event.data.orderId,
            timestamp: new Date(),
            payload: {
              amount: event.data.amount,
              paymentMethod: event.data.paymentMethod,
              transactionId: event.data.transactionId,
              processedBy: 'payment-service',
            },
          });
        }
        break;
        
      case 'PaymentFailed':
        // Handle payment failure
        logError('Payment failed for order', new Error('Payment failed'), {
          orderId: event.data.orderId,
          reason: event.data.reason,
        });
        break;
        
      case 'RefundCompleted':
        // Handle refund completion
        if (event.data.orderId) {
          await commandBus.execute({
            type: 'RefundOrder',
            aggregateId: event.data.orderId,
            timestamp: new Date(),
            payload: {
              amount: event.data.amount,
              reason: event.data.reason,
              refundedBy: 'payment-service',
              transactionId: event.data.transactionId,
            },
          });
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
          await commandBus.execute({
            type: 'UpdateOrderStatus',
            aggregateId: event.data.orderId,
            timestamp: new Date(),
            payload: {
              status: 'CONFIRMED',
              updatedBy: 'inventory-service',
              notes: 'Stock reserved successfully',
            },
          });
        }
        break;
        
      case 'StockReservationFailed':
        // Cancel order if stock reservation fails
        if (event.data.orderId) {
          await commandBus.execute({
            type: 'CancelOrder',
            aggregateId: event.data.orderId,
            timestamp: new Date(),
            payload: {
              reason: `Stock reservation failed: ${event.data.reason}`,
              cancelledBy: 'inventory-service',
            },
          });
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
      
      logInfo(`Published event to channel ${channel}`, {
        eventType: event.type,
        aggregateId: event.aggregateId,
      });
    } catch (error) {
      logError(`Failed to publish event to channel ${channel}`, error as Error, { event });
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