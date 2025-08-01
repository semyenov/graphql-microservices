import { EventHandler, type IEventHandler } from '@graphql-microservices/event-sourcing';
import { PrismaClient } from '../../generated/prisma';
import type {
  OrderCreatedEvent,
  OrderCancelledEvent,
  OrderStatusUpdatedEvent,
  OrderShippedEvent,
  OrderItemAddedEvent,
  OrderItemRemovedEvent,
  ShippingAddressUpdatedEvent,
  PaymentProcessedEvent,
  OrderRefundedEvent,
  OrderDeliveredEvent,
} from '../../domain/events';
import { logInfo, logError } from '@graphql-microservices/shared-logging';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Order Created Event Handler
 */
@EventHandler('OrderCreated')
export class OrderCreatedEventHandler implements IEventHandler<OrderCreatedEvent> {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: OrderCreatedEvent): Promise<void> {
    try {
      logInfo('Handling OrderCreated event', { 
        orderId: event.aggregateId,
        orderNumber: event.payload.orderNumber 
      });

      // Begin transaction to ensure consistency
      await this.prisma.$transaction(async (tx) => {
        // Create the order
        const order = await tx.order.create({
          data: {
            id: event.aggregateId,
            orderNumber: event.payload.orderNumber,
            customerId: event.payload.customerId,
            customerName: 'Customer Name', // This should come from a customer service lookup
            customerEmail: 'customer@email.com', // This should come from a customer service lookup
            shippingStreet: event.payload.shippingAddress.street,
            shippingCity: event.payload.shippingAddress.city,
            shippingState: event.payload.shippingAddress.state,
            shippingPostalCode: event.payload.shippingAddress.postalCode,
            shippingCountry: event.payload.shippingAddress.country,
            billingStreet: event.payload.billingAddress?.street,
            billingCity: event.payload.billingAddress?.city,
            billingState: event.payload.billingAddress?.state,
            billingPostalCode: event.payload.billingAddress?.postalCode,
            billingCountry: event.payload.billingAddress?.country,
            subtotal: new Decimal(event.payload.subtotal),
            tax: new Decimal(event.payload.tax),
            shipping: new Decimal(event.payload.shipping),
            total: new Decimal(event.payload.total),
            currency: event.payload.currency,
            status: 'PENDING',
            paymentMethod: event.payload.paymentMethod,
            notes: event.payload.notes,
            createdAt: event.payload.createdAt,
          },
        });

        // Create order items
        if (event.payload.items.length > 0) {
          await tx.orderItem.createMany({
            data: event.payload.items.map(item => ({
              orderId: order.id,
              productId: item.productId,
              productName: item.name,
              quantity: item.quantity,
              unitPrice: new Decimal(item.price.amount),
              total: new Decimal(item.total),
            })),
          });
        }
      });

      logInfo('Order created in read model', { 
        orderId: event.aggregateId,
        orderNumber: event.payload.orderNumber 
      });
    } catch (error) {
      logError('Failed to handle OrderCreated event', error as Error, { event });
      throw error;
    }
  }
}

/**
 * Order Cancelled Event Handler
 */
@EventHandler('OrderCancelled')
export class OrderCancelledEventHandler implements IEventHandler<OrderCancelledEvent> {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: OrderCancelledEvent): Promise<void> {
    try {
      logInfo('Handling OrderCancelled event', { orderId: event.aggregateId });

      await this.prisma.order.update({
        where: { id: event.aggregateId },
        data: {
          status: 'CANCELLED',
          cancelledAt: event.payload.cancelledAt,
          refundAmount: event.payload.refundAmount ? new Decimal(event.payload.refundAmount) : undefined,
          refundReason: event.payload.reason,
          updatedAt: event.payload.cancelledAt,
        },
      });

      logInfo('Order cancelled in read model', { orderId: event.aggregateId });
    } catch (error) {
      logError('Failed to handle OrderCancelled event', error as Error, { event });
      throw error;
    }
  }
}

/**
 * Order Status Updated Event Handler
 */
@EventHandler('OrderStatusUpdated')
export class OrderStatusUpdatedEventHandler implements IEventHandler<OrderStatusUpdatedEvent> {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: OrderStatusUpdatedEvent): Promise<void> {
    try {
      logInfo('Handling OrderStatusUpdated event', { 
        orderId: event.aggregateId,
        newStatus: event.payload.newStatus 
      });

      await this.prisma.order.update({
        where: { id: event.aggregateId },
        data: {
          status: event.payload.newStatus as any,
          updatedAt: event.payload.updatedAt,
        },
      });

      logInfo('Order status updated in read model', { 
        orderId: event.aggregateId,
        newStatus: event.payload.newStatus 
      });
    } catch (error) {
      logError('Failed to handle OrderStatusUpdated event', error as Error, { event });
      throw error;
    }
  }
}

/**
 * Order Shipped Event Handler
 */
@EventHandler('OrderShipped')
export class OrderShippedEventHandler implements IEventHandler<OrderShippedEvent> {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: OrderShippedEvent): Promise<void> {
    try {
      logInfo('Handling OrderShipped event', { 
        orderId: event.aggregateId,
        trackingNumber: event.payload.trackingNumber 
      });

      await this.prisma.order.update({
        where: { id: event.aggregateId },
        data: {
          status: 'SHIPPED',
          trackingNumber: event.payload.trackingNumber,
          carrier: event.payload.carrier,
          shippedDate: event.payload.shippedDate,
          estimatedDeliveryDate: event.payload.estimatedDeliveryDate,
          updatedAt: event.payload.shippedDate,
        },
      });

      logInfo('Order shipped in read model', { 
        orderId: event.aggregateId,
        trackingNumber: event.payload.trackingNumber 
      });
    } catch (error) {
      logError('Failed to handle OrderShipped event', error as Error, { event });
      throw error;
    }
  }
}

/**
 * Order Item Added Event Handler
 */
@EventHandler('OrderItemAdded')
export class OrderItemAddedEventHandler implements IEventHandler<OrderItemAddedEvent> {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: OrderItemAddedEvent): Promise<void> {
    try {
      logInfo('Handling OrderItemAdded event', { 
        orderId: event.aggregateId,
        productId: event.payload.productId 
      });

      await this.prisma.$transaction(async (tx) => {
        // Add the new item
        await tx.orderItem.create({
          data: {
            orderId: event.aggregateId,
            productId: event.payload.productId,
            productName: event.payload.name,
            quantity: event.payload.quantity,
            unitPrice: new Decimal(event.payload.price.amount),
            total: new Decimal(event.payload.total),
          },
        });

        // Update order totals
        await tx.order.update({
          where: { id: event.aggregateId },
          data: {
            subtotal: new Decimal(event.payload.newSubtotal),
            total: new Decimal(event.payload.newTotal),
            updatedAt: event.payload.addedAt,
          },
        });
      });

      logInfo('Order item added in read model', { 
        orderId: event.aggregateId,
        productId: event.payload.productId 
      });
    } catch (error) {
      logError('Failed to handle OrderItemAdded event', error as Error, { event });
      throw error;
    }
  }
}

/**
 * Order Item Removed Event Handler
 */
@EventHandler('OrderItemRemoved')
export class OrderItemRemovedEventHandler implements IEventHandler<OrderItemRemovedEvent> {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: OrderItemRemovedEvent): Promise<void> {
    try {
      logInfo('Handling OrderItemRemoved event', { 
        orderId: event.aggregateId,
        productId: event.payload.productId 
      });

      await this.prisma.$transaction(async (tx) => {
        // Remove the item
        await tx.orderItem.deleteMany({
          where: {
            orderId: event.aggregateId,
            productId: event.payload.productId,
          },
        });

        // Update order totals
        await tx.order.update({
          where: { id: event.aggregateId },
          data: {
            subtotal: new Decimal(event.payload.newSubtotal),
            total: new Decimal(event.payload.newTotal),
            updatedAt: event.payload.removedAt,
          },
        });
      });

      logInfo('Order item removed in read model', { 
        orderId: event.aggregateId,
        productId: event.payload.productId 
      });
    } catch (error) {
      logError('Failed to handle OrderItemRemoved event', error as Error, { event });
      throw error;
    }
  }
}

/**
 * Shipping Address Updated Event Handler
 */
@EventHandler('ShippingAddressUpdated')
export class ShippingAddressUpdatedEventHandler implements IEventHandler<ShippingAddressUpdatedEvent> {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: ShippingAddressUpdatedEvent): Promise<void> {
    try {
      logInfo('Handling ShippingAddressUpdated event', { orderId: event.aggregateId });

      await this.prisma.order.update({
        where: { id: event.aggregateId },
        data: {
          shippingStreet: event.payload.newAddress.street,
          shippingCity: event.payload.newAddress.city,
          shippingState: event.payload.newAddress.state,
          shippingPostalCode: event.payload.newAddress.postalCode,
          shippingCountry: event.payload.newAddress.country,
          updatedAt: event.payload.updatedAt,
        },
      });

      logInfo('Shipping address updated in read model', { orderId: event.aggregateId });
    } catch (error) {
      logError('Failed to handle ShippingAddressUpdated event', error as Error, { event });
      throw error;
    }
  }
}

/**
 * Payment Processed Event Handler
 */
@EventHandler('PaymentProcessed')
export class PaymentProcessedEventHandler implements IEventHandler<PaymentProcessedEvent> {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: PaymentProcessedEvent): Promise<void> {
    try {
      logInfo('Handling PaymentProcessed event', { 
        orderId: event.aggregateId,
        transactionId: event.payload.transactionId 
      });

      await this.prisma.order.update({
        where: { id: event.aggregateId },
        data: {
          status: 'PROCESSING',
          paymentTransactionId: event.payload.transactionId,
          paymentProcessedAt: event.payload.processedAt,
          updatedAt: event.payload.processedAt,
        },
      });

      logInfo('Payment processed in read model', { 
        orderId: event.aggregateId,
        transactionId: event.payload.transactionId 
      });
    } catch (error) {
      logError('Failed to handle PaymentProcessed event', error as Error, { event });
      throw error;
    }
  }
}

/**
 * Order Refunded Event Handler
 */
@EventHandler('OrderRefunded')
export class OrderRefundedEventHandler implements IEventHandler<OrderRefundedEvent> {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: OrderRefundedEvent): Promise<void> {
    try {
      logInfo('Handling OrderRefunded event', { 
        orderId: event.aggregateId,
        amount: event.payload.amount 
      });

      await this.prisma.order.update({
        where: { id: event.aggregateId },
        data: {
          status: 'REFUNDED',
          refundAmount: new Decimal(event.payload.amount),
          refundReason: event.payload.reason,
          refundTransactionId: event.payload.transactionId,
          refundedAt: event.payload.refundedAt,
          updatedAt: event.payload.refundedAt,
        },
      });

      logInfo('Order refunded in read model', { 
        orderId: event.aggregateId,
        amount: event.payload.amount 
      });
    } catch (error) {
      logError('Failed to handle OrderRefunded event', error as Error, { event });
      throw error;
    }
  }
}

/**
 * Order Delivered Event Handler
 */
@EventHandler('OrderDelivered')
export class OrderDeliveredEventHandler implements IEventHandler<OrderDeliveredEvent> {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: OrderDeliveredEvent): Promise<void> {
    try {
      logInfo('Handling OrderDelivered event', { orderId: event.aggregateId });

      await this.prisma.order.update({
        where: { id: event.aggregateId },
        data: {
          status: 'DELIVERED',
          deliveredAt: event.payload.deliveredAt,
          updatedAt: event.payload.deliveredAt,
        },
      });

      logInfo('Order delivered in read model', { orderId: event.aggregateId });
    } catch (error) {
      logError('Failed to handle OrderDelivered event', error as Error, { event });
      throw error;
    }
  }
}

/**
 * Event handler factory
 */
export function createOrderEventHandlers(prisma: PrismaClient) {
  return {
    orderCreated: new OrderCreatedEventHandler(prisma),
    orderCancelled: new OrderCancelledEventHandler(prisma),
    orderStatusUpdated: new OrderStatusUpdatedEventHandler(prisma),
    orderShipped: new OrderShippedEventHandler(prisma),
    orderItemAdded: new OrderItemAddedEventHandler(prisma),
    orderItemRemoved: new OrderItemRemovedEventHandler(prisma),
    shippingAddressUpdated: new ShippingAddressUpdatedEventHandler(prisma),
    paymentProcessed: new PaymentProcessedEventHandler(prisma),
    orderRefunded: new OrderRefundedEventHandler(prisma),
    orderDelivered: new OrderDeliveredEventHandler(prisma),
  };
}

// Export all event handlers
export const eventHandlers = [
  OrderCreatedEventHandler,
  OrderCancelledEventHandler,
  OrderStatusUpdatedEventHandler,
  OrderShippedEventHandler,
  OrderItemAddedEventHandler,
  OrderItemRemovedEventHandler,
  ShippingAddressUpdatedEventHandler,
  PaymentProcessedEventHandler,
  OrderRefundedEventHandler,
  OrderDeliveredEventHandler,
];