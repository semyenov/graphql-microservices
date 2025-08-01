import { type IEventHandler } from '@graphql-microservices/event-sourcing';
import { EventHandler } from '@graphql-microservices/event-sourcing/cqrs';
import { logError, logInfo } from '@shared/utils';
import { Decimal } from '@prisma/client/runtime/library';
import type {
  OrderCancelledEvent,
  OrderCreatedEvent,
  OrderItemAddedEvent,
  OrderItemRemovedEvent,
  OrderRefundedEvent,
  OrderPaymentUpdatedEvent,
  OrderShippingUpdatedEvent,
  OrderStatusChangedEvent,
} from '../../domain/order-aggregate';
import type { IDomainEvent } from '@graphql-microservices/event-sourcing';
import type { PrismaClient } from '../../generated/prisma';

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
        orderNumber: event.data.orderNumber,
      });

      // Begin transaction to ensure consistency
      await this.prisma.$transaction(async (tx) => {
        // Create the order
        const order = await tx.order.create({
          data: {
            id: event.aggregateId,
            orderNumber: event.data.orderNumber,
            customerId: event.data.customerId,
            customerName: 'Customer Name', // This should come from a customer service lookup
            customerEmail: 'customer@email.com', // This should come from a customer service lookup
            shippingStreet: event.data.shippingAddress.street,
            shippingCity: event.data.shippingAddress.city,
            shippingState: event.data.shippingAddress.state,
            shippingPostalCode: event.data.shippingAddress.postalCode,
            shippingCountry: event.data.shippingAddress.country,
            billingStreet: event.data.billingAddress?.street,
            billingCity: event.data.billingAddress?.city,
            billingState: event.data.billingAddress?.state,
            billingPostalCode: event.data.billingAddress?.postalCode,
            billingCountry: event.data.billingAddress?.country,
            subtotal: new Decimal(event.data.subtotal.amount),
            tax: new Decimal(event.data.tax.amount),
            shipping: new Decimal(event.data.shippingCost.amount),
            total: new Decimal(event.data.totalAmount.amount),
            currency: event.data.subtotal.currency,
            status: 'PENDING',
            paymentMethod: event.data.paymentInfo.method,
            notes: '',
            createdAt: event.occurredAt,
          },
        });

        // Create order items
        if (event.data.items.length > 0) {
          await tx.orderItem.createMany({
            data: event.data.items.map((item) => ({
              orderId: order.id,
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: new Decimal(item.unitPrice.amount),
              total: new Decimal(item.totalPrice.amount),
            })),
          });
        }
      });

      logInfo('Order created in read model', {
        orderId: event.aggregateId,
        orderNumber: event.data.orderNumber,
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
          cancelledAt: event.occurredAt,
          refundAmount: event.data.refundAmount
            ? new Decimal(event.data.refundAmount.amount)
            : undefined,
          refundReason: event.data.reason,
          updatedAt: event.occurredAt,
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
@EventHandler('OrderStatusChanged')
export class OrderStatusChangedEventHandler implements IEventHandler<OrderStatusChangedEvent> {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: OrderStatusUpdatedEvent): Promise<void> {
    try {
      logInfo('Handling OrderStatusChanged event', {
        orderId: event.aggregateId,
        newStatus: event.data.newStatus,
      });

      await this.prisma.order.update({
        where: { id: event.aggregateId },
        data: {
          status: event.data.newStatus.toUpperCase() as any,
          updatedAt: event.occurredAt,
        },
      });

      logInfo('Order status updated in read model', {
        orderId: event.aggregateId,
        newStatus: event.data.newStatus,
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
@EventHandler('OrderShippingUpdated')
export class OrderShippingUpdatedEventHandler implements IEventHandler<OrderShippingUpdatedEvent> {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: OrderShippingUpdatedEvent): Promise<void> {
    try {
      logInfo('Handling OrderShippingUpdated event', {
        orderId: event.aggregateId,
        trackingNumber: event.data.trackingNumber,
      });

      const hasTracking = event.data.trackingNumber && event.data.shippingInfo;
      await this.prisma.order.update({
        where: { id: event.aggregateId },
        data: {
          status: hasTracking ? 'SHIPPED' : undefined,
          trackingNumber: event.data.trackingNumber,
          carrier: event.data.shippingInfo?.carrier,
          shippedDate: hasTracking ? event.occurredAt : undefined,
          estimatedDeliveryDate: event.data.shippingInfo?.estimatedDeliveryDate ? new Date(event.data.shippingInfo.estimatedDeliveryDate) : undefined,
          updatedAt: event.occurredAt,
        },
      });

      logInfo('Order shipping updated in read model', {
        orderId: event.aggregateId,
        trackingNumber: event.data.trackingNumber,
      });
    } catch (error) {
      logError('Failed to handle OrderShippingUpdated event', error as Error, { event });
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
        productId: event.data.item.productId,
      });

      await this.prisma.$transaction(async (tx) => {
        // Add the new item
        await tx.orderItem.create({
          data: {
            orderId: event.aggregateId,
            productId: event.data.item.productId,
            productName: event.data.item.productName,
            quantity: event.data.item.quantity,
            unitPrice: new Decimal(event.data.item.unitPrice.amount),
            total: new Decimal(event.data.item.totalPrice.amount),
          },
        });

        // Update order totals
        await tx.order.update({
          where: { id: event.aggregateId },
          data: {
            subtotal: new Decimal(event.data.newSubtotal.amount),
            total: new Decimal(event.data.newTotalAmount.amount),
            updatedAt: event.occurredAt,
          },
        });
      });

      logInfo('Order item added in read model', {
        orderId: event.aggregateId,
        productId: event.data.item.productId,
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
        productId: event.data.removedItem.productId,
      });

      await this.prisma.$transaction(async (tx) => {
        // Remove the item
        await tx.orderItem.deleteMany({
          where: {
            orderId: event.aggregateId,
            productId: event.data.removedItem.productId,
          },
        });

        // Update order totals
        await tx.order.update({
          where: { id: event.aggregateId },
          data: {
            subtotal: new Decimal(event.data.newSubtotal.amount),
            total: new Decimal(event.data.newTotalAmount.amount),
            updatedAt: event.occurredAt,
          },
        });
      });

      logInfo('Order item removed in read model', {
        orderId: event.aggregateId,
        productId: event.data.removedItem.productId,
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
// Note: ShippingAddressUpdated event is not defined in the aggregate
// This handler is kept for compatibility but may need to be removed

/**
 * Payment Processed Event Handler
 */
@EventHandler('OrderPaymentUpdated')
export class OrderPaymentUpdatedEventHandler implements IEventHandler<OrderPaymentUpdatedEvent> {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: OrderPaymentUpdatedEvent): Promise<void> {
    try {
      logInfo('Handling OrderPaymentUpdated event', {
        orderId: event.aggregateId,
        paymentStatus: event.data.paymentInfo.status,
      });

      const paymentInfo = event.data.paymentInfo;
      await this.prisma.order.update({
        where: { id: event.aggregateId },
        data: {
          status: paymentInfo.status === 'captured' ? 'PROCESSING' : undefined,
          paymentMethod: paymentInfo.method,
          paymentTransactionId: paymentInfo.transactionId,
          paymentProcessedAt: paymentInfo.processedAt ? new Date(paymentInfo.processedAt) : undefined,
          updatedAt: event.occurredAt,
        },
      });

      logInfo('Payment updated in read model', {
        orderId: event.aggregateId,
        paymentStatus: paymentInfo.status,
      });
    } catch (error) {
      logError('Failed to handle OrderPaymentUpdated event', error as Error, { event });
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
        amount: event.data.refundAmount.amount,
      });

      await this.prisma.order.update({
        where: { id: event.aggregateId },
        data: {
          status: 'REFUNDED',
          refundAmount: new Decimal(event.data.refundAmount.amount),
          refundReason: event.data.reason,
          refundTransactionId: event.data.refundTransactionId,
          refundedAt: event.occurredAt,
          updatedAt: event.occurredAt,
        },
      });

      logInfo('Order refunded in read model', {
        orderId: event.aggregateId,
        amount: event.data.refundAmount.amount,
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
// Note: OrderDelivered event is not defined in the aggregate
// This is handled through OrderStatusChanged event when status changes to 'delivered'

/**
 * Event handler factory
 */
export function createOrderEventHandlers(prisma: PrismaClient) {
  return {
    orderCreated: new OrderCreatedEventHandler(prisma),
    orderCancelled: new OrderCancelledEventHandler(prisma),
    orderStatusChanged: new OrderStatusChangedEventHandler(prisma),
    orderShippingUpdated: new OrderShippingUpdatedEventHandler(prisma),
    orderItemAdded: new OrderItemAddedEventHandler(prisma),
    orderItemRemoved: new OrderItemRemovedEventHandler(prisma),
    orderPaymentUpdated: new OrderPaymentUpdatedEventHandler(prisma),
    orderRefunded: new OrderRefundedEventHandler(prisma),
  };
}

// Export all event handlers
export const eventHandlers = [
  OrderCreatedEventHandler,
  OrderCancelledEventHandler,
  OrderStatusChangedEventHandler,
  OrderShippingUpdatedEventHandler,
  OrderItemAddedEventHandler,
  OrderItemRemovedEventHandler,
  OrderPaymentUpdatedEventHandler,
  OrderRefundedEventHandler,
];
