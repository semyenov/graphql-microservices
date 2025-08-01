import type { ICommandHandler, IEventStore } from '@graphql-microservices/event-sourcing';
import { generateId, ValidationError } from '@graphql-microservices/shared-errors';
import { logError, logInfo } from '@shared/utils';
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

/**
 * Create Order Command Handler
 */
export class CreateOrderCommandHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(private readonly eventStore: IEventStore) {}

  async execute(
    command: CreateOrderCommand
  ): Promise<{ aggregateId: string; orderNumber: string }> {
    try {
      logInfo(`Creating new order for customer: ${command.payload.customerId}`);

      // Create new order aggregate
      const aggregate = Order.createOrder({
        id: command.aggregateId || generateId(),
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

      // Metadata is handled by the createOrder method

      // Save events to event store
      await this.eventStore.appendToStream(aggregate.id, [...aggregate.uncommittedEvents], 0);

      // Get order number from aggregate
      const orderNumber = aggregate.orderNumber.getValue();

      logInfo(`Order created successfully: ${orderNumber} for customer: ${command.payload.customerId}`);

      return {
        aggregateId: aggregate.id,
        orderNumber,
      };
    } catch (error) {
      logError(`Failed to create order: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

/**
 * Cancel Order Command Handler
 */
export class CancelOrderCommandHandler implements ICommandHandler<CancelOrderCommand> {
  constructor(private readonly eventStore: IEventStore) {}

  async execute(command: CancelOrderCommand): Promise<{ aggregateId: string }> {
    try {
      logInfo(`Cancelling order: ${command.aggregateId}`);

      if (!command.aggregateId) {
        throw new ValidationError('Aggregate ID is required');
      }

      // Load aggregate from event store
      const storedEvents = await this.eventStore.readStream(command.aggregateId);
      const domainEvents = storedEvents.map((event) => ({
        ...event,
        timestamp: event.occurredAt, // Map occurredAt to timestamp for DomainEvent compatibility
      }));
      const aggregate = Order.fromOrderEvents(domainEvents);

      // Cancel the order
      aggregate.cancel(
        command.payload.reason,
        command.payload.cancelledBy,
        { correlationId: command.metadata?.correlationId }
      );

      // Save new events
      await this.eventStore.appendToStream(
        aggregate.id,
        [...aggregate.uncommittedEvents],
        aggregate.version
      );

      logInfo(`Order cancelled successfully: ${command.aggregateId}`);

      return { aggregateId: aggregate.id };
    } catch (error) {
      logError(`Failed to cancel order: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

/**
 * Update Order Status Command Handler
 */
export class UpdateOrderStatusCommandHandler implements ICommandHandler<UpdateOrderStatusCommand> {
  constructor(private readonly eventStore: IEventStore) {}

  async execute(
    command: UpdateOrderStatusCommand
  ): Promise<{ aggregateId: string; newStatus: string }> {
    try {
      logInfo(`Updating order status: ${command.aggregateId} -> ${command.payload.status}`);

      if (!command.aggregateId) {
        throw new ValidationError('Aggregate ID is required');
      }

      // Load aggregate
      const storedEvents = await this.eventStore.readStream(command.aggregateId);
      const domainEvents = storedEvents.map((event) => ({
        ...event,
        timestamp: event.occurredAt, // Map occurredAt to timestamp for DomainEvent compatibility
      }));
      const aggregate = Order.fromOrderEvents(domainEvents);

      // Update status
      aggregate.changeStatus(
        command.payload.status.toLowerCase() as any,
        command.payload.notes,
        command.payload.updatedBy,
        { correlationId: command.metadata?.correlationId }
      );

      // Save new events
      await this.eventStore.appendToStream(
        aggregate.id,
        [...aggregate.uncommittedEvents],
        aggregate.version
      );

      logInfo(`Order status updated successfully: ${command.aggregateId} -> ${command.payload.status}`);

      return {
        aggregateId: aggregate.id,
        newStatus: command.payload.status,
      };
    } catch (error) {
      logError(`Failed to update order status: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

/**
 * Ship Order Command Handler
 */
export class ShipOrderCommandHandler implements ICommandHandler<ShipOrderCommand> {
  constructor(private readonly eventStore: IEventStore) {}

  async execute(
    command: ShipOrderCommand
  ): Promise<{ aggregateId: string; trackingNumber: string }> {
    try {
      logInfo(`Shipping order: ${command.aggregateId}`);

      if (!command.aggregateId) {
        throw new ValidationError('Aggregate ID is required');
      }

      // Load aggregate
      const storedEvents = await this.eventStore.readStream(command.aggregateId);
      const domainEvents = storedEvents.map((event) => ({
        ...event,
        timestamp: event.occurredAt, // Map occurredAt to timestamp for DomainEvent compatibility
      }));
      const aggregate = Order.fromOrderEvents(domainEvents);

      // Update shipping info with tracking number
      const currentShippingInfo = aggregate.getShippingInfo();
      const currentData = currentShippingInfo.toJSON();
      const updatedShippingInfo = ShippingInfo.fromJSON({
        ...currentData,
        trackingNumber: command.payload.trackingNumber,
        carrier: command.payload.carrier,
        estimatedDelivery: command.payload.estimatedDeliveryDate,
      });

      aggregate.updateShippingInfo(updatedShippingInfo, {
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId || command.payload.shippedBy,
      });

      // Save new events
      await this.eventStore.appendToStream(
        aggregate.id,
        [...aggregate.uncommittedEvents],
        aggregate.version
      );

      logInfo(`Order shipped successfully: ${command.aggregateId} with tracking ${command.payload.trackingNumber}`);

      return {
        aggregateId: aggregate.id,
        trackingNumber: command.payload.trackingNumber,
      };
    } catch (error) {
      logError(`Failed to ship order: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

/**
 * Add Order Item Command Handler
 */
export class AddOrderItemCommandHandler implements ICommandHandler<AddOrderItemCommand> {
  constructor(private readonly eventStore: IEventStore) {}

  async execute(command: AddOrderItemCommand): Promise<{ aggregateId: string; productId: string }> {
    try {
      logInfo(`Adding item to order: ${command.aggregateId} - product ${command.payload.productId}`);

      if (!command.aggregateId) {
        throw new ValidationError('Aggregate ID is required');
      }

      // Load aggregate
      const storedEvents = await this.eventStore.readStream(command.aggregateId);
      const domainEvents = storedEvents.map((event) => ({
        ...event,
        timestamp: event.occurredAt, // Map occurredAt to timestamp for DomainEvent compatibility
      }));
      const aggregate = Order.fromOrderEvents(domainEvents);

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
      await this.eventStore.appendToStream(
        aggregate.id,
        [...aggregate.uncommittedEvents],
        aggregate.version
      );

      logInfo(`Item added to order successfully: ${command.aggregateId} - product ${command.payload.productId}`);

      return {
        aggregateId: aggregate.id,
        productId: command.payload.productId,
      };
    } catch (error) {
      logError(`Failed to add item to order: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

/**
 * Remove Order Item Command Handler
 */
export class RemoveOrderItemCommandHandler implements ICommandHandler<RemoveOrderItemCommand> {
  constructor(private readonly eventStore: IEventStore) {}

  async execute(
    command: RemoveOrderItemCommand
  ): Promise<{ aggregateId: string; productId: string }> {
    try {
      logInfo(`Removing item from order: ${command.aggregateId} - product ${command.payload.productId}`);

      if (!command.aggregateId) {
        throw new ValidationError('Aggregate ID is required');
      }

      // Load aggregate
      const storedEvents = await this.eventStore.readStream(command.aggregateId);
      const domainEvents = storedEvents.map((event) => ({
        ...event,
        timestamp: event.occurredAt, // Map occurredAt to timestamp for DomainEvent compatibility
      }));
      const aggregate = Order.fromOrderEvents(domainEvents);

      // Find item by product ID
      const items = aggregate.getItems();
      const itemToRemove = items.find((item) => item.productId === command.payload.productId);

      if (!itemToRemove) {
        throw new Error(`Item with product ID ${command.payload.productId} not found in order`);
      }

      // Remove item
      aggregate.removeItem(itemToRemove.id, {
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId,
      });

      // Save new events
      await this.eventStore.appendToStream(
        aggregate.id,
        [...aggregate.uncommittedEvents],
        aggregate.version
      );

      logInfo(`Item removed from order successfully: ${command.aggregateId} - product ${command.payload.productId}`);

      return {
        aggregateId: aggregate.id,
        productId: command.payload.productId,
      };
    } catch (error) {
      logError(`Failed to remove item from order: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

/**
 * Update Shipping Address Command Handler
 */
export class UpdateShippingAddressCommandHandler
  implements ICommandHandler<UpdateShippingAddressCommand>
{
  constructor(private readonly eventStore: IEventStore) {}

  async execute(command: UpdateShippingAddressCommand): Promise<{ aggregateId: string }> {
    try {
      logInfo(`Updating shipping address for order: ${command.aggregateId}`);

      if (!command.aggregateId) {
        throw new ValidationError('Aggregate ID is required');
      }

      // Load aggregate
      const storedEvents = await this.eventStore.readStream(command.aggregateId);
      const domainEvents = storedEvents.map((event) => ({
        ...event,
        timestamp: event.occurredAt, // Map occurredAt to timestamp for DomainEvent compatibility
      }));
      const aggregate = Order.fromOrderEvents(domainEvents);

      // Update shipping info with new address
      const currentShippingInfo = aggregate.getShippingInfo();
      const newAddress = Address.fromJSON(command.payload.address);
      const currentData = currentShippingInfo.toJSON();
      const updatedShippingInfo = ShippingInfo.fromJSON({
        ...currentData,
        shippingAddress: newAddress.toJSON(),
      });

      aggregate.updateShippingInfo(updatedShippingInfo, {
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId || command.payload.updatedBy,
      });

      // Save new events
      await this.eventStore.appendToStream(
        aggregate.id,
        [...aggregate.uncommittedEvents],
        aggregate.version
      );

      logInfo(`Shipping address updated successfully for order: ${command.aggregateId}`);

      return { aggregateId: aggregate.id };
    } catch (error) {
      logError(`Failed to update shipping address: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

/**
 * Process Payment Command Handler
 */
export class ProcessPaymentCommandHandler implements ICommandHandler<ProcessPaymentCommand> {
  constructor(private readonly eventStore: IEventStore) {}

  async execute(
    command: ProcessPaymentCommand
  ): Promise<{ aggregateId: string; transactionId: string }> {
    try {
      logInfo(`Processing payment for order: ${command.aggregateId} - amount ${command.payload.amount}`);

      if (!command.aggregateId) {
        throw new ValidationError('Aggregate ID is required');
      }

      // Load aggregate
      const storedEvents = await this.eventStore.readStream(command.aggregateId);
      const domainEvents = storedEvents.map((event) => ({
        ...event,
        timestamp: event.occurredAt, // Map occurredAt to timestamp for DomainEvent compatibility
      }));
      const aggregate = Order.fromOrderEvents(domainEvents);

      // Update payment info
      const updatedPaymentInfo = PaymentInfo.fromJSON({
        method: command.payload.method.toLowerCase() as "credit_card" | "paypal" | "debit_card" | "bank_transfer" | "cash_on_delivery",
        status: 'captured',
        transactionId: command.payload.transactionId,
        processedAt: new Date().toISOString(),
      });

      aggregate.updatePaymentInfo(updatedPaymentInfo, {
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId,
      });

      // Save new events
      await this.eventStore.appendToStream(
        aggregate.id,
        [...aggregate.uncommittedEvents],
        aggregate.version
      );

      logInfo(`Payment processed successfully for order: ${command.aggregateId} - transaction ${command.payload.transactionId}`);

      return {
        aggregateId: aggregate.id,
        transactionId: command.payload.transactionId,
      };
    } catch (error) {
      logError(`Failed to process payment: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

/**
 * Refund Order Command Handler
 */
export class RefundOrderCommandHandler implements ICommandHandler<RefundOrderCommand> {
  constructor(private readonly eventStore: IEventStore) {}

  async execute(
    command: RefundOrderCommand
  ): Promise<{ aggregateId: string; refundAmount: number }> {
    try {
      logInfo(`Processing refund for order: ${command.aggregateId} - amount ${command.payload.amount}`);

      if (!command.aggregateId) {
        throw new ValidationError('Aggregate ID is required');
      }

      // Load aggregate
      const storedEvents = await this.eventStore.readStream(command.aggregateId);
      const domainEvents = storedEvents.map((event) => ({
        ...event,
        timestamp: event.occurredAt, // Map occurredAt to timestamp for DomainEvent compatibility
      }));
      const aggregate = Order.fromOrderEvents(domainEvents);

      // Process refund
      aggregate.refund(
        Money.fromJSON({
          amount: command.payload.amount,
          currency: command.payload.currency || 'USD',
        }),
        command.payload.reason,
        command.metadata?.userId || 'system',
        command.payload.transactionId,
        { correlationId: command.metadata?.correlationId }
      );

      // Save new events
      await this.eventStore.appendToStream(
        aggregate.id,
        [...aggregate.uncommittedEvents],
        aggregate.version
      );

      logInfo(`Refund processed successfully for order: ${command.aggregateId} - amount ${command.payload.amount}`);

      return {
        aggregateId: aggregate.id,
        refundAmount: command.payload.amount,
      };
    } catch (error) {
      logError(`Failed to process refund: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

/**
 * Command handler factory
 */
export function createOrderCommandHandlers(eventStore: IEventStore) {
  return {
    createOrder: new CreateOrderCommandHandler(eventStore),
    cancelOrder: new CancelOrderCommandHandler(eventStore),
    updateOrderStatus: new UpdateOrderStatusCommandHandler(eventStore),
    shipOrder: new ShipOrderCommandHandler(eventStore),
    addOrderItem: new AddOrderItemCommandHandler(eventStore),
    removeOrderItem: new RemoveOrderItemCommandHandler(eventStore),
    updateShippingAddress: new UpdateShippingAddressCommandHandler(eventStore),
    processPayment: new ProcessPaymentCommandHandler(eventStore),
    refundOrder: new RefundOrderCommandHandler(eventStore),
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
