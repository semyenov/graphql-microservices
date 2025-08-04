import type {
  AsyncResult,
  DomainError,
  IEventHandler,
} from '@graphql-microservices/event-sourcing';
import { createLogger } from '@graphql-microservices/logger';
import { domainError, Result, validationError } from '@graphql-microservices/shared-result';
import { Decimal } from '@prisma/client/runtime/library';
import type {
  OrderCancelledEvent,
  OrderCreatedEvent,
  OrderItemAddedEvent,
  OrderItemRemovedEvent,
  OrderPaymentUpdatedEvent,
  OrderRefundedEvent,
  OrderShippingUpdatedEvent,
  OrderStatusChangedEvent,
} from '../../domain/order-aggregate';
import type { PrismaClient } from '../../generated/prisma';

// Create logger for this module
const logger = createLogger({ service: 'modern-order-event-handlers' });

/**
 * Event handler context for dependency injection
 */
export interface EventHandlerContext {
  readonly prisma: PrismaClient;
  readonly customerService?: CustomerServiceClient;
  readonly inventoryService?: InventoryServiceClient;
  readonly notificationService?: NotificationServiceClient;
}

/**
 * Customer service client interface
 */
export interface CustomerServiceClient {
  getCustomer(customerId: string): Promise<{ name: string; email: string } | null>;
}

/**
 * Inventory service client interface
 */
export interface InventoryServiceClient {
  reserveItems(
    orderId: string,
    items: Array<{ productId: string; quantity: number }>
  ): Promise<void>;
  releaseReservation(orderId: string): Promise<void>;
}

/**
 * Notification service client interface
 */
export interface NotificationServiceClient {
  sendOrderNotification(type: string, payload: Record<string, unknown>): Promise<void>;
}

/**
 * Base event handler with common functionality
 */
abstract class BaseOrderEventHandler<TEvent> implements IEventHandler<TEvent> {
  protected readonly logger = createLogger({ service: `${this.constructor.name}` });

  constructor(protected readonly context: EventHandlerContext) {}

  abstract handle(event: TEvent): AsyncResult<void, DomainError>;

  /**
   * Execute database operation with transaction support
   */
  protected async withTransaction<T>(
    operation: (tx: PrismaClient) => Promise<T>
  ): AsyncResult<T, DomainError> {
    try {
      const result = await this.context.prisma.$transaction(operation);
      return Result.ok(result);
    } catch (error) {
      this.logger.error('Database transaction failed', error as Error);
      return Result.err(
        domainError('DATABASE_TRANSACTION_FAILED', 'Database transaction failed', error)
      );
    }
  }

  /**
   * Safe decimal conversion with validation
   */
  protected safeDecimal(amount: number, context: string): Result<Decimal, DomainError> {
    try {
      if (typeof amount !== 'number' || isNaN(amount) || amount < 0) {
        return Result.err(
          validationError('INVALID_AMOUNT', `Invalid amount for ${context}: ${amount}`)
        );
      }
      return Result.ok(new Decimal(amount));
    } catch (error) {
      return Result.err(
        domainError('DECIMAL_CONVERSION_FAILED', `Failed to convert amount for ${context}`, error)
      );
    }
  }

  /**
   * Get customer information with fallback
   */
  protected async getCustomerInfo(customerId: string): Promise<{ name: string; email: string }> {
    if (this.context.customerService) {
      try {
        const customer = await this.context.customerService.getCustomer(customerId);
        if (customer) {
          return customer;
        }
      } catch (error) {
        this.logger.warn('Failed to fetch customer info, using fallback', { customerId, error });
      }
    }

    return {
      name: `Customer ${customerId.slice(0, 8)}`,
      email: `customer-${customerId.slice(0, 8)}@example.com`,
    };
  }
}

/**
 * Modern Order Created Event Handler with Result types
 */
export class ModernOrderCreatedEventHandler extends BaseOrderEventHandler<OrderCreatedEvent> {
  async handle(event: OrderCreatedEvent): AsyncResult<void, DomainError> {
    this.logger.info('Handling OrderCreated event', {
      orderId: event.aggregateId,
      orderNumber: event.data.orderNumber,
    });

    try {
      // Validate event data
      const validationResult = this.validateOrderCreatedEvent(event);
      if (Result.isErr(validationResult)) {
        return validationResult;
      }

      // Get customer information
      const customerInfo = await this.getCustomerInfo(event.data.customerId);

      // Process order creation in transaction
      const transactionResult = await this.withTransaction(async (tx) => {
        // Create the order
        const order = await tx.order.create({
          data: {
            id: event.aggregateId,
            orderNumber: event.data.orderNumber,
            customerId: event.data.customerId,
            customerName: customerInfo.name,
            customerEmail: customerInfo.email,
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

        // Create order items if any exist
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

        return order;
      });

      if (Result.isErr(transactionResult)) {
        return transactionResult;
      }

      // Trigger side effects
      await this.handleSideEffects(event);

      this.logger.info('Order created successfully in read model', {
        orderId: event.aggregateId,
        orderNumber: event.data.orderNumber,
      });

      return Result.ok(undefined);
    } catch (error) {
      this.logger.error('Failed to handle OrderCreated event', error as Error, { event });
      return Result.err(
        domainError('ORDER_CREATED_HANDLER_FAILED', 'Failed to handle OrderCreated event', error)
      );
    }
  }

  private validateOrderCreatedEvent(event: OrderCreatedEvent): AsyncResult<void, DomainError> {
    if (!event.aggregateId) {
      return Result.err(validationError('MISSING_AGGREGATE_ID', 'Order ID is required'));
    }

    if (!event.data.orderNumber) {
      return Result.err(validationError('MISSING_ORDER_NUMBER', 'Order number is required'));
    }

    if (!event.data.customerId) {
      return Result.err(validationError('MISSING_CUSTOMER_ID', 'Customer ID is required'));
    }

    if (!event.data.items || event.data.items.length === 0) {
      return Result.err(
        validationError('MISSING_ORDER_ITEMS', 'Order must have at least one item')
      );
    }

    return Result.ok(undefined);
  }

  private async handleSideEffects(event: OrderCreatedEvent): Promise<void> {
    // Reserve inventory
    if (this.context.inventoryService) {
      try {
        await this.context.inventoryService.reserveItems(
          event.aggregateId,
          event.data.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          }))
        );
      } catch (error) {
        this.logger.warn('Failed to reserve inventory', { orderId: event.aggregateId, error });
      }
    }

    // Send notification
    if (this.context.notificationService) {
      try {
        await this.context.notificationService.sendOrderNotification('order.created', {
          orderId: event.aggregateId,
          orderNumber: event.data.orderNumber,
          customerId: event.data.customerId,
          total: event.data.totalAmount,
        });
      } catch (error) {
        this.logger.warn('Failed to send order creation notification', {
          orderId: event.aggregateId,
          error,
        });
      }
    }
  }
}

/**
 * Modern Order Cancelled Event Handler
 */
export class ModernOrderCancelledEventHandler extends BaseOrderEventHandler<OrderCancelledEvent> {
  async handle(event: OrderCancelledEvent): AsyncResult<void, DomainError> {
    this.logger.info('Handling OrderCancelled event', { orderId: event.aggregateId });

    try {
      // Validate event data
      if (!event.aggregateId) {
        return Result.err(validationError('MISSING_AGGREGATE_ID', 'Order ID is required'));
      }

      // Update order in database
      const updateResult = await this.withTransaction(async (tx) => {
        return await tx.order.update({
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
      });

      if (Result.isErr(updateResult)) {
        return updateResult;
      }

      // Handle side effects
      await this.handleSideEffects(event);

      this.logger.info('Order cancelled successfully in read model', {
        orderId: event.aggregateId,
      });
      return Result.ok(undefined);
    } catch (error) {
      this.logger.error('Failed to handle OrderCancelled event', error as Error, { event });
      return Result.err(
        domainError(
          'ORDER_CANCELLED_HANDLER_FAILED',
          'Failed to handle OrderCancelled event',
          error
        )
      );
    }
  }

  private async handleSideEffects(event: OrderCancelledEvent): Promise<void> {
    // Release inventory reservation
    if (this.context.inventoryService) {
      try {
        await this.context.inventoryService.releaseReservation(event.aggregateId);
      } catch (error) {
        this.logger.warn('Failed to release inventory reservation', {
          orderId: event.aggregateId,
          error,
        });
      }
    }

    // Send notification
    if (this.context.notificationService) {
      try {
        await this.context.notificationService.sendOrderNotification('order.cancelled', {
          orderId: event.aggregateId,
          reason: event.data.reason,
        });
      } catch (error) {
        this.logger.warn('Failed to send order cancellation notification', {
          orderId: event.aggregateId,
          error,
        });
      }
    }
  }
}

/**
 * Modern Order Status Changed Event Handler
 */
export class ModernOrderStatusChangedEventHandler extends BaseOrderEventHandler<OrderStatusChangedEvent> {
  async handle(event: OrderStatusChangedEvent): AsyncResult<void, DomainError> {
    this.logger.info('Handling OrderStatusChanged event', {
      orderId: event.aggregateId,
      newStatus: event.data.newStatus,
    });

    try {
      // Validate event data
      if (!event.aggregateId) {
        return Result.err(validationError('MISSING_AGGREGATE_ID', 'Order ID is required'));
      }

      if (!event.data.newStatus) {
        return Result.err(validationError('MISSING_STATUS', 'New status is required'));
      }

      // Update order status
      const updateResult = await this.withTransaction(async (tx) => {
        return await tx.order.update({
          where: { id: event.aggregateId },
          data: {
            status: event.data.newStatus.toUpperCase() as any,
            updatedAt: event.occurredAt,
          },
        });
      });

      if (Result.isErr(updateResult)) {
        return updateResult;
      }

      // Handle side effects based on status
      await this.handleStatusChangeEffects(event);

      this.logger.info('Order status updated successfully in read model', {
        orderId: event.aggregateId,
        newStatus: event.data.newStatus,
      });

      return Result.ok(undefined);
    } catch (error) {
      this.logger.error('Failed to handle OrderStatusChanged event', error as Error, { event });
      return Result.err(
        domainError(
          'ORDER_STATUS_CHANGED_HANDLER_FAILED',
          'Failed to handle OrderStatusChanged event',
          error
        )
      );
    }
  }

  private async handleStatusChangeEffects(event: OrderStatusChangedEvent): Promise<void> {
    const status = event.data.newStatus.toLowerCase();

    // Send appropriate notifications based on status
    if (this.context.notificationService) {
      try {
        let notificationType = 'order.status.changed';

        switch (status) {
          case 'processing':
            notificationType = 'order.processing';
            break;
          case 'shipped':
            notificationType = 'order.shipped';
            break;
          case 'delivered':
            notificationType = 'order.delivered';
            break;
        }

        await this.context.notificationService.sendOrderNotification(notificationType, {
          orderId: event.aggregateId,
          status: event.data.newStatus,
          previousStatus: event.data.previousStatus,
        });
      } catch (error) {
        this.logger.warn('Failed to send status change notification', {
          orderId: event.aggregateId,
          error,
        });
      }
    }
  }
}

/**
 * Modern Order Payment Updated Event Handler
 */
export class ModernOrderPaymentUpdatedEventHandler extends BaseOrderEventHandler<OrderPaymentUpdatedEvent> {
  async handle(event: OrderPaymentUpdatedEvent): AsyncResult<void, DomainError> {
    this.logger.info('Handling OrderPaymentUpdated event', {
      orderId: event.aggregateId,
      paymentStatus: event.data.paymentInfo.status,
    });

    try {
      // Validate event data
      if (!event.aggregateId) {
        return Result.err(validationError('MISSING_AGGREGATE_ID', 'Order ID is required'));
      }

      const paymentInfo = event.data.paymentInfo;
      if (!paymentInfo) {
        return Result.err(validationError('MISSING_PAYMENT_INFO', 'Payment info is required'));
      }

      // Update payment information
      const updateResult = await this.withTransaction(async (tx) => {
        return await tx.order.update({
          where: { id: event.aggregateId },
          data: {
            status: paymentInfo.status === 'captured' ? 'PROCESSING' : undefined,
            paymentMethod: paymentInfo.method,
            paymentTransactionId: paymentInfo.transactionId,
            paymentProcessedAt: paymentInfo.processedAt
              ? new Date(paymentInfo.processedAt)
              : undefined,
            updatedAt: event.occurredAt,
          },
        });
      });

      if (Result.isErr(updateResult)) {
        return updateResult;
      }

      // Handle payment-related side effects
      await this.handlePaymentEffects(event);

      this.logger.info('Payment updated successfully in read model', {
        orderId: event.aggregateId,
        paymentStatus: paymentInfo.status,
      });

      return Result.ok(undefined);
    } catch (error) {
      this.logger.error('Failed to handle OrderPaymentUpdated event', error as Error, { event });
      return Result.err(
        domainError(
          'ORDER_PAYMENT_UPDATED_HANDLER_FAILED',
          'Failed to handle OrderPaymentUpdated event',
          error
        )
      );
    }
  }

  private async handlePaymentEffects(event: OrderPaymentUpdatedEvent): Promise<void> {
    const paymentInfo = event.data.paymentInfo;

    // Send payment notification
    if (this.context.notificationService) {
      try {
        const notificationType =
          paymentInfo.status === 'captured' ? 'payment.captured' : 'payment.failed';

        await this.context.notificationService.sendOrderNotification(notificationType, {
          orderId: event.aggregateId,
          transactionId: paymentInfo.transactionId,
          method: paymentInfo.method,
          status: paymentInfo.status,
        });
      } catch (error) {
        this.logger.warn('Failed to send payment notification', {
          orderId: event.aggregateId,
          error,
        });
      }
    }
  }
}

/**
 * Additional handlers following the same pattern...
 */
export class ModernOrderShippingUpdatedEventHandler extends BaseOrderEventHandler<OrderShippingUpdatedEvent> {
  async handle(event: OrderShippingUpdatedEvent): AsyncResult<void, DomainError> {
    this.logger.info('Handling OrderShippingUpdated event', {
      orderId: event.aggregateId,
      trackingNumber: event.data.trackingNumber,
    });

    try {
      const hasTracking = event.data.trackingNumber && event.data.shippingInfo;

      const updateResult = await this.withTransaction(async (tx) => {
        return await tx.order.update({
          where: { id: event.aggregateId },
          data: {
            status: hasTracking ? 'SHIPPED' : undefined,
            trackingNumber: event.data.trackingNumber,
            carrier: event.data.shippingInfo?.carrier,
            shippedDate: hasTracking ? event.occurredAt : undefined,
            estimatedDeliveryDate: event.data.shippingInfo?.estimatedDeliveryDate
              ? new Date(event.data.shippingInfo.estimatedDeliveryDate)
              : undefined,
            updatedAt: event.occurredAt,
          },
        });
      });

      if (Result.isErr(updateResult)) {
        return updateResult;
      }

      // Send shipping notification
      if (this.context.notificationService && hasTracking) {
        try {
          await this.context.notificationService.sendOrderNotification('order.shipped', {
            orderId: event.aggregateId,
            trackingNumber: event.data.trackingNumber,
            carrier: event.data.shippingInfo?.carrier,
            estimatedDelivery: event.data.shippingInfo?.estimatedDeliveryDate,
          });
        } catch (error) {
          this.logger.warn('Failed to send shipping notification', {
            orderId: event.aggregateId,
            error,
          });
        }
      }

      return Result.ok(undefined);
    } catch (error) {
      this.logger.error('Failed to handle OrderShippingUpdated event', error as Error);
      return Result.err(
        domainError(
          'ORDER_SHIPPING_UPDATED_HANDLER_FAILED',
          'Failed to handle OrderShippingUpdated event',
          error
        )
      );
    }
  }
}

/**
 * Modern event handler factory with dependency injection
 */
export function createModernOrderEventHandlers(context: EventHandlerContext) {
  return {
    orderCreated: new ModernOrderCreatedEventHandler(context),
    orderCancelled: new ModernOrderCancelledEventHandler(context),
    orderStatusChanged: new ModernOrderStatusChangedEventHandler(context),
    orderPaymentUpdated: new ModernOrderPaymentUpdatedEventHandler(context),
    orderShippingUpdated: new ModernOrderShippingUpdatedEventHandler(context),
    // Add more handlers as needed
  };
}

/**
 * Event handler registry for automatic registration
 */
export const modernEventHandlerRegistry = [
  ModernOrderCreatedEventHandler,
  ModernOrderCancelledEventHandler,
  ModernOrderStatusChangedEventHandler,
  ModernOrderPaymentUpdatedEventHandler,
  ModernOrderShippingUpdatedEventHandler,
];
