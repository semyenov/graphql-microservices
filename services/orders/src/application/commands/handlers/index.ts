import type {
  AsyncResult,
  DomainError,
  ICommandHandler,
} from '@graphql-microservices/event-sourcing';
import { createLogger } from '@graphql-microservices/logger';
import { generateId } from '@graphql-microservices/shared-errors';
import { domainError, Result, validationError } from '@graphql-microservices/shared-result';
import type {
  AddOrderItemCommand,
  CancelOrderCommand,
  CreateOrderCommand,
  ProcessPaymentCommand,
  RefundOrderCommand,
  RemoveOrderItemCommand,
  ShipOrderCommand,
  UpdateOrderStatusCommand,
  UpdateShippingAddressCommand,
} from '../../../domain/commands';
import { Order } from '../../../domain/order-aggregate';
import {
  Address,
  Money,
  OrderNumber,
  OrderQuantity,
  PaymentInfo,
  ShippingInfo,
} from '../../../domain/value-objects';
import type { OrderRepository } from '../../../infrastructure/order-repository';

// Create logger instance
const logger = createLogger({ service: 'orders-command-handlers' });

/**
 * Create Order Command Handler
 */
export class CreateOrderCommandHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(private readonly repository: OrderRepository) {}

  async execute(
    command: CreateOrderCommand
  ): AsyncResult<{ aggregateId: string; orderNumber: string }, DomainError> {
    logger.info('Creating new order', { customerId: command.payload.customerId });

    try {
      // Create new order aggregate with new ID
      const aggregateId = generateId();
      const aggregateResult = Order.createOrder({
        id: aggregateId,
        orderNumber: OrderNumber.fromString(command.payload.orderNumber),
        customerId: command.payload.customerId,
        items: command.payload.items.map((item) => ({
          id: generateId(),
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          quantity: OrderQuantity.fromNumber(item.quantity),
          unitPrice: Money.fromJSON(item.unitPrice),
          totalPrice: Money.fromJSON({
            amount: item.quantity * item.unitPrice.amount,
            currency: item.unitPrice.currency,
          }),
        })),
        shippingAddress: Address.fromJSON(command.payload.shippingAddress),
        paymentInfo: PaymentInfo.fromJSON({
          method: command.payload.paymentInfo.method.toLowerCase().replace('_card', '_card') as any,
          status: command.payload.paymentInfo.status,
          transactionId: command.payload.paymentInfo.transactionId,
        }),
        shippingInfo: ShippingInfo.fromJSON({
          method: command.payload.shippingInfo.method.toLowerCase() as any,
          cost: command.payload.shippingInfo.cost,
          estimatedDelivery: command.payload.shippingInfo.estimatedDeliveryDate,
          trackingNumber: command.payload.shippingInfo.trackingNumber,
          carrier: command.payload.shippingInfo.carrier,
          shippingAddress: command.payload.shippingAddress,
        }),
        billingAddress: command.payload.billingAddress
          ? Address.fromJSON(command.payload.billingAddress)
          : undefined,
      });

      if (Result.isErr(aggregateResult)) {
        logger.error('Failed to create order aggregate', aggregateResult.error);
        return aggregateResult;
      }

      const aggregate = aggregateResult.value;

      // Save aggregate using repository
      const saveResult = await this.repository.save(aggregate, {
        expectedVersion: 0,
        metadata: {
          commandId: command.id,
          correlationId: command.metadata?.correlationId,
          userId: command.metadata?.userId,
        },
      });

      if (Result.isErr(saveResult)) {
        logger.error('Failed to save order aggregate', saveResult.error);
        return saveResult;
      }

      // Get order number from aggregate
      const orderNumber = aggregate.orderNumber.getValue();

      logger.info('Order created successfully', {
        orderNumber,
        customerId: command.payload.customerId,
      });

      return Result.ok({
        aggregateId: aggregate.id,
        orderNumber,
      });
    } catch (error) {
      logger.error('Failed to create order', error as Error);
      return Result.err(domainError('ORDER_CREATION_FAILED', 'Failed to create order', error));
    }
  }
}

/**
 * Cancel Order Command Handler
 */
export class CancelOrderCommandHandler implements ICommandHandler<CancelOrderCommand> {
  constructor(private readonly repository: OrderRepository) {}

  async execute(command: CancelOrderCommand): AsyncResult<{ aggregateId: string }, DomainError> {
    logger.info('Cancelling order', { orderId: command.payload.orderId });

    try {
      if (!command.payload.orderId) {
        return Result.err(validationError('MISSING_ORDER_ID', 'Order ID is required'));
      }

      // Load aggregate from repository
      const aggregateResult = await this.repository.getById(command.payload.orderId);
      if (Result.isErr(aggregateResult)) {
        logger.error('Failed to load order aggregate', aggregateResult.error);
        return aggregateResult;
      }

      const aggregate = aggregateResult.value;

      // Cancel the order
      const cancelResult = aggregate.cancel(command.payload.reason, command.payload.cancelledBy, {
        correlationId: command.metadata?.correlationId,
      });

      if (Result.isErr(cancelResult)) {
        logger.error('Failed to cancel order', cancelResult.error);
        return cancelResult;
      }

      // Save aggregate using repository
      const saveResult = await this.repository.save(aggregate, {
        metadata: {
          commandId: command.id,
          correlationId: command.metadata?.correlationId,
          userId: command.metadata?.userId,
        },
      });

      if (Result.isErr(saveResult)) {
        logger.error('Failed to save order aggregate after cancellation', saveResult.error);
        return saveResult;
      }

      logger.info('Order cancelled successfully', { orderId: command.payload.orderId });

      return Result.ok({ aggregateId: aggregate.id });
    } catch (error) {
      logger.error('Failed to cancel order', error as Error);
      return Result.err(domainError('ORDER_CANCELLATION_FAILED', 'Failed to cancel order', error));
    }
  }
}

/**
 * Update Order Status Command Handler
 */
export class UpdateOrderStatusCommandHandler implements ICommandHandler<UpdateOrderStatusCommand> {
  constructor(private readonly repository: OrderRepository) {}

  async execute(
    command: UpdateOrderStatusCommand
  ): AsyncResult<{ aggregateId: string; newStatus: string }, DomainError> {
    logger.info('Updating order status', {
      orderId: command.payload.orderId,
      newStatus: command.payload.status,
    });

    try {
      if (!command.payload.orderId) {
        return Result.err(validationError('MISSING_ORDER_ID', 'Order ID is required'));
      }

      // Load aggregate from repository
      const aggregateResult = await this.repository.getById(command.payload.orderId);
      if (Result.isErr(aggregateResult)) {
        logger.error('Failed to load order aggregate', aggregateResult.error);
        return aggregateResult;
      }

      const aggregate = aggregateResult.value;

      // Update status
      const statusResult = aggregate.changeStatus(
        command.payload.status.toLowerCase() as any,
        command.payload.notes,
        command.payload.updatedBy,
        { correlationId: command.metadata?.correlationId }
      );

      if (Result.isErr(statusResult)) {
        logger.error('Failed to change order status', statusResult.error);
        return statusResult;
      }

      // Save aggregate using repository
      const saveResult = await this.repository.save(aggregate, {
        metadata: {
          commandId: command.id,
          correlationId: command.metadata?.correlationId,
          userId: command.metadata?.userId,
        },
      });

      if (Result.isErr(saveResult)) {
        logger.error('Failed to save order aggregate after status update', saveResult.error);
        return saveResult;
      }

      logger.info('Order status updated successfully', {
        orderId: command.payload.orderId,
        newStatus: command.payload.status,
      });

      return Result.ok({
        aggregateId: aggregate.id,
        newStatus: command.payload.status,
      });
    } catch (error) {
      logger.error('Failed to update order status', error as Error);
      return Result.err(
        domainError('ORDER_STATUS_UPDATE_FAILED', 'Failed to update order status', error)
      );
    }
  }
}

/**
 * Ship Order Command Handler
 */
export class ShipOrderCommandHandler implements ICommandHandler<ShipOrderCommand> {
  constructor(private readonly repository: OrderRepository) {}

  async execute(
    command: ShipOrderCommand
  ): AsyncResult<{ aggregateId: string; trackingNumber: string }, DomainError> {
    logger.info('Shipping order', { orderId: command.payload.orderId });

    try {
      if (!command.payload.orderId) {
        return Result.err(validationError('MISSING_ORDER_ID', 'Order ID is required'));
      }

      // Load aggregate from repository
      const aggregateResult = await this.repository.getById(command.payload.orderId);
      if (Result.isErr(aggregateResult)) {
        logger.error('Failed to load order aggregate', aggregateResult.error);
        return aggregateResult;
      }

      const aggregate = aggregateResult.value;

      // Update shipping info with tracking number
      const currentShippingInfo = aggregate.getShippingInfo();
      const currentData = currentShippingInfo.toJSON();
      const updatedShippingInfo = ShippingInfo.fromJSON({
        ...currentData,
        trackingNumber: command.payload.trackingNumber,
        carrier: command.payload.carrier,
        estimatedDelivery: command.payload.estimatedDeliveryDate,
      });

      const updateResult = aggregate.updateShippingInfo(updatedShippingInfo, {
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId || command.payload.shippedBy,
      });

      if (Result.isErr(updateResult)) {
        logger.error('Failed to update shipping info', updateResult.error);
        return updateResult;
      }

      // Save aggregate using repository
      const saveResult = await this.repository.save(aggregate, {
        metadata: {
          commandId: command.id,
          correlationId: command.metadata?.correlationId,
          userId: command.metadata?.userId,
        },
      });

      if (Result.isErr(saveResult)) {
        logger.error('Failed to save order aggregate after shipping update', saveResult.error);
        return saveResult;
      }

      logger.info('Order shipped successfully', {
        orderId: command.payload.orderId,
        trackingNumber: command.payload.trackingNumber,
      });

      return Result.ok({
        aggregateId: aggregate.id,
        trackingNumber: command.payload.trackingNumber,
      });
    } catch (error) {
      logger.error('Failed to ship order', error as Error);
      return Result.err(domainError('ORDER_SHIPPING_FAILED', 'Failed to ship order', error));
    }
  }
}

/**
 * Add Order Item Command Handler
 */
export class AddOrderItemCommandHandler implements ICommandHandler<AddOrderItemCommand> {
  constructor(private readonly repository: OrderRepository) {}

  async execute(
    command: AddOrderItemCommand
  ): AsyncResult<{ aggregateId: string; productId: string }, DomainError> {
    logger.info('Adding item to order', {
      orderId: command.payload.orderId,
      productId: command.payload.productId,
    });

    try {
      if (!command.payload.orderId) {
        return Result.err(validationError('MISSING_ORDER_ID', 'Order ID is required'));
      }

      // Load aggregate from repository
      const aggregateResult = await this.repository.getById(command.payload.orderId);
      if (Result.isErr(aggregateResult)) {
        logger.error('Failed to load order aggregate', aggregateResult.error);
        return aggregateResult;
      }

      const aggregate = aggregateResult.value;

      // Add item
      aggregate.addItem(
        command.payload.productId,
        command.payload.productName,
        command.payload.productSku,
        command.payload.quantity,
        Money.fromJSON(command.payload.unitPrice),
        {
          correlationId: command.metadata?.correlationId,
          userId: command.metadata?.userId,
        }
      );

      // Save new events
      const saveResult = await this.eventStore.appendToStream(
        aggregate.id,
        [...aggregate.uncommittedEvents],
        aggregate.version
      );

      if (Result.isErr(saveResult)) {
        logger.error('Failed to save add item events to event store', saveResult.error);
        return saveResult;
      }

      logger.info('Item added to order successfully', {
        orderId: command.payload.orderId,
        productId: command.payload.productId,
      });

      return Result.ok({
        aggregateId: aggregate.id,
        productId: command.payload.productId,
      });
    } catch (error) {
      logger.error('Failed to add item to order', error as Error);
      return Result.err(domainError('ADD_ORDER_ITEM_FAILED', 'Failed to add item to order', error));
    }
  }
}

/**
 * Remove Order Item Command Handler
 */
export class RemoveOrderItemCommandHandler implements ICommandHandler<RemoveOrderItemCommand> {
  constructor(private readonly repository: OrderRepository) {}

  async execute(
    command: RemoveOrderItemCommand
  ): AsyncResult<{ aggregateId: string; productId: string }, DomainError> {
    logger.info('Removing item from order', {
      orderId: command.payload.orderId,
      productId: command.payload.productId,
    });

    try {
      if (!command.payload.orderId) {
        return Result.err(validationError('MISSING_ORDER_ID', 'Order ID is required'));
      }

      // Load aggregate from repository
      const aggregateResult = await this.repository.getById(command.payload.orderId);
      if (Result.isErr(aggregateResult)) {
        logger.error('Failed to load order aggregate', aggregateResult.error);
        return aggregateResult;
      }

      const aggregate = aggregateResult.value;

      // Find item by product ID
      const items = aggregate.getItems();
      const itemToRemove = items.find((item) => item.productId === command.payload.productId);

      if (!itemToRemove) {
        return Result.err(
          domainError(
            'ITEM_NOT_FOUND',
            `Item with product ID ${command.payload.productId} not found in order`
          )
        );
      }

      // Remove item
      const removeResult = aggregate.removeItem(itemToRemove.id, {
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId,
      });

      if (Result.isErr(removeResult)) {
        logger.error('Failed to remove item from order', removeResult.error);
        return removeResult;
      }

      // Save aggregate using repository
      const saveResult = await this.repository.save(aggregate, {
        metadata: {
          commandId: command.id,
          correlationId: command.metadata?.correlationId,
          userId: command.metadata?.userId,
        },
      });

      if (Result.isErr(saveResult)) {
        logger.error('Failed to save order aggregate after removing item', saveResult.error);
        return saveResult;
      }

      logger.info('Item removed from order successfully', {
        orderId: command.payload.orderId,
        productId: command.payload.productId,
      });

      return Result.ok({
        aggregateId: aggregate.id,
        productId: command.payload.productId,
      });
    } catch (error) {
      logger.error('Failed to remove item from order', error as Error);
      return Result.err(
        domainError('REMOVE_ORDER_ITEM_FAILED', 'Failed to remove item from order', error)
      );
    }
  }
}

/**
 * Update Shipping Address Command Handler
 */
export class UpdateShippingAddressCommandHandler
  implements ICommandHandler<UpdateShippingAddressCommand>
{
  constructor(private readonly repository: OrderRepository) {}

  async execute(
    command: UpdateShippingAddressCommand
  ): AsyncResult<{ aggregateId: string }, DomainError> {
    logger.info('Updating shipping address', { orderId: command.payload.orderId });

    try {
      if (!command.payload.orderId) {
        return Result.err(validationError('MISSING_ORDER_ID', 'Order ID is required'));
      }

      // Load aggregate from repository
      const aggregateResult = await this.repository.getById(command.payload.orderId);
      if (Result.isErr(aggregateResult)) {
        logger.error('Failed to load order aggregate', aggregateResult.error);
        return aggregateResult;
      }

      const aggregate = aggregateResult.value;

      // Update shipping info with new address
      const currentShippingInfo = aggregate.getShippingInfo();
      const newAddress = Address.fromJSON(command.payload.address);
      const currentData = currentShippingInfo.toJSON();
      const updatedShippingInfo = ShippingInfo.fromJSON({
        ...currentData,
        shippingAddress: newAddress.toJSON(),
      });

      const updateResult = aggregate.updateShippingInfo(updatedShippingInfo, {
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId || command.payload.updatedBy,
      });

      if (Result.isErr(updateResult)) {
        logger.error('Failed to update shipping address', updateResult.error);
        return updateResult;
      }

      // Save aggregate using repository
      const saveResult = await this.repository.save(aggregate, {
        metadata: {
          commandId: command.id,
          correlationId: command.metadata?.correlationId,
          userId: command.metadata?.userId,
        },
      });

      if (Result.isErr(saveResult)) {
        logger.error(
          'Failed to save order aggregate after shipping address update',
          saveResult.error
        );
        return saveResult;
      }

      logger.info('Shipping address updated successfully', { orderId: command.payload.orderId });

      return Result.ok({ aggregateId: aggregate.id });
    } catch (error) {
      logger.error('Failed to update shipping address', error as Error);
      return Result.err(
        domainError('UPDATE_SHIPPING_ADDRESS_FAILED', 'Failed to update shipping address', error)
      );
    }
  }
}

/**
 * Process Payment Command Handler
 */
export class ProcessPaymentCommandHandler implements ICommandHandler<ProcessPaymentCommand> {
  constructor(private readonly repository: OrderRepository) {}

  async execute(
    command: ProcessPaymentCommand
  ): AsyncResult<{ aggregateId: string; transactionId: string }, DomainError> {
    logger.info('Processing payment', {
      orderId: command.payload.orderId,
      amount: command.payload.amount,
    });

    try {
      if (!command.payload.orderId) {
        return Result.err(validationError('MISSING_ORDER_ID', 'Order ID is required'));
      }

      // Load aggregate from repository
      const aggregateResult = await this.repository.getById(command.payload.orderId);
      if (Result.isErr(aggregateResult)) {
        logger.error('Failed to load order aggregate', aggregateResult.error);
        return aggregateResult;
      }

      const aggregate = aggregateResult.value;

      // Update payment info
      const updatedPaymentInfo = PaymentInfo.fromJSON({
        method: command.payload.method.toLowerCase() as
          | 'credit_card'
          | 'paypal'
          | 'debit_card'
          | 'bank_transfer'
          | 'cash_on_delivery',
        status: 'captured',
        transactionId: command.payload.transactionId,
        processedAt: new Date().toISOString(),
      });

      const updateResult = aggregate.updatePaymentInfo(updatedPaymentInfo, {
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId,
      });

      if (Result.isErr(updateResult)) {
        logger.error('Failed to update payment info', updateResult.error);
        return updateResult;
      }

      // Save aggregate using repository
      const saveResult = await this.repository.save(aggregate, {
        metadata: {
          commandId: command.id,
          correlationId: command.metadata?.correlationId,
          userId: command.metadata?.userId,
        },
      });

      if (Result.isErr(saveResult)) {
        logger.error('Failed to save order aggregate after payment processing', saveResult.error);
        return saveResult;
      }

      logger.info('Payment processed successfully', {
        orderId: command.payload.orderId,
        transactionId: command.payload.transactionId,
      });

      return Result.ok({
        aggregateId: aggregate.id,
        transactionId: command.payload.transactionId,
      });
    } catch (error) {
      logger.error('Failed to process payment', error as Error);
      return Result.err(
        domainError('PAYMENT_PROCESSING_FAILED', 'Failed to process payment', error)
      );
    }
  }
}

/**
 * Refund Order Command Handler
 */
export class RefundOrderCommandHandler implements ICommandHandler<RefundOrderCommand> {
  constructor(private readonly repository: OrderRepository) {}

  async execute(
    command: RefundOrderCommand
  ): AsyncResult<{ aggregateId: string; refundAmount: number }, DomainError> {
    logger.info('Processing refund', {
      orderId: command.payload.orderId,
      amount: command.payload.amount,
    });

    try {
      if (!command.payload.orderId) {
        return Result.err(validationError('MISSING_ORDER_ID', 'Order ID is required'));
      }

      // Load aggregate from repository
      const aggregateResult = await this.repository.getById(command.payload.orderId);
      if (Result.isErr(aggregateResult)) {
        logger.error('Failed to load order aggregate', aggregateResult.error);
        return aggregateResult;
      }

      const aggregate = aggregateResult.value;

      // Process refund
      const refundResult = aggregate.refund(
        Money.fromJSON({
          amount: command.payload.amount,
          currency: command.payload.currency || 'USD',
        }),
        command.payload.reason,
        command.metadata?.userId || 'system',
        command.payload.transactionId,
        { correlationId: command.metadata?.correlationId }
      );

      if (Result.isErr(refundResult)) {
        logger.error('Failed to process refund', refundResult.error);
        return refundResult;
      }

      // Save aggregate using repository
      const saveResult = await this.repository.save(aggregate, {
        metadata: {
          commandId: command.id,
          correlationId: command.metadata?.correlationId,
          userId: command.metadata?.userId,
        },
      });

      if (Result.isErr(saveResult)) {
        logger.error('Failed to save order aggregate after refund processing', saveResult.error);
        return saveResult;
      }

      logger.info('Refund processed successfully', {
        orderId: command.payload.orderId,
        amount: command.payload.amount,
      });

      return Result.ok({
        aggregateId: aggregate.id,
        refundAmount: command.payload.amount,
      });
    } catch (error) {
      logger.error('Failed to process refund', error as Error);
      return Result.err(domainError('REFUND_PROCESSING_FAILED', 'Failed to process refund', error));
    }
  }
}

/**
 * Command handler factory
 */
export function createOrderCommandHandlers(repository: OrderRepository) {
  return {
    createOrder: new CreateOrderCommandHandler(repository),
    cancelOrder: new CancelOrderCommandHandler(repository),
    updateOrderStatus: new UpdateOrderStatusCommandHandler(repository),
    shipOrder: new ShipOrderCommandHandler(repository),
    addOrderItem: new AddOrderItemCommandHandler(repository),
    removeOrderItem: new RemoveOrderItemCommandHandler(repository),
    updateShippingAddress: new UpdateShippingAddressCommandHandler(repository),
    processPayment: new ProcessPaymentCommandHandler(repository),
    refundOrder: new RefundOrderCommandHandler(repository),
  };
}

// Export all command handlers
export const commandHandlers = [
  CreateOrderCommandHandler,
  CancelOrderCommandHandler,
  UpdateOrderStatusCommandHandler,
  ShipOrderCommandHandler,
  AddOrderItemCommandHandler,
  RemoveOrderItemCommandHandler,
  UpdateShippingAddressCommandHandler,
  ProcessPaymentCommandHandler,
  RefundOrderCommandHandler,
];
