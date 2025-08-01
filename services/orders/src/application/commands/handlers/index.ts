import type { ICommandHandler, EventStore } from '@graphql-microservices/event-sourcing';
import { OrderAggregate } from '../../../domain/order-aggregate';
import type {
  CreateOrderCommand,
  CancelOrderCommand,
  UpdateOrderStatusCommand,
  ShipOrderCommand,
  AddOrderItemCommand,
  RemoveOrderItemCommand,
  UpdateShippingAddressCommand,
  ProcessPaymentCommand,
  RefundOrderCommand,
  OrderCommand,
} from '../../../domain/commands';
import { generateId } from '@graphql-microservices/shared-errors';
import { logInfo, logError } from '@shared/utils';
import { OrderNumber, OrderQuantity, Money, Address, PaymentInfo, ShippingInfo } from '../../../domain/value-objects';

/**
 * Create Order Command Handler
 */
export class CreateOrderCommandHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(private readonly eventStore: EventStore) {}

  async execute(command: CreateOrderCommand): Promise<{ aggregateId: string; orderNumber: string }> {
    try {
      logInfo('Creating new order', { customerId: command.payload.customerId });
      
      // Create new order aggregate
      const aggregate = OrderAggregate.createOrder({
        id: command.aggregateId || generateId(),
        orderNumber: OrderNumber.fromString(command.payload.orderNumber),
        customerId: command.payload.customerId,
        items: command.payload.items.map(item => ({
          id: generateId(),
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          quantity: OrderQuantity.fromNumber(item.quantity),
          unitPrice: Money.fromJSON(item.unitPrice),
          totalPrice: Money.fromJSON({ amount: item.quantity * item.unitPrice.amount, currency: item.unitPrice.currency })
        })),
        shippingAddress: Address.fromJSON(command.payload.shippingAddress),
        paymentInfo: PaymentInfo.fromJSON(command.payload.paymentInfo),
        shippingInfo: ShippingInfo.fromJSON(command.payload.shippingInfo),
        billingAddress: command.payload.billingAddress ? Address.fromJSON(command.payload.billingAddress) : undefined
      }, {
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      });
      
      // Save events to event store
      await this.eventStore.save(aggregate.id, aggregate.uncommittedEvents, 0);
      
      // Get order number from aggregate
      const orderNumber = aggregate.getOrderNumber().getValue();
      
      logInfo('Order created successfully', { 
        orderId: aggregate.id, 
        orderNumber,
        customerId: command.payload.customerId 
      });
      
      return { 
        aggregateId: aggregate.id,
        orderNumber 
      };
    } catch (error) {
      logError('Failed to create order', error as Error, { command });
      throw error;
    }
  }
}

/**
 * Cancel Order Command Handler
 */
export class CancelOrderCommandHandler implements ICommandHandler<CancelOrderCommand> {
  constructor(private readonly eventStore: EventStore) {}

  async execute(command: CancelOrderCommand): Promise<{ aggregateId: string }> {
    try {
      logInfo('Cancelling order', { orderId: command.aggregateId });
      
      // Load aggregate from event store
      const events = await this.eventStore.getEvents(command.aggregateId);
      const aggregate = OrderAggregate.fromOrderEvents(events);
      
      // Cancel the order
      aggregate.cancel(
        command.payload.reason,
        command.payload.cancelledBy || command.metadata?.userId || 'system',
        { correlationId: command.metadata?.correlationId }
      );
      
      // Save new events
      await this.eventStore.save(
        aggregate.id,
        aggregate.uncommittedEvents,
        aggregate.version
      );
      
      logInfo('Order cancelled successfully', { orderId: command.aggregateId });
      
      return { aggregateId: aggregate.id };
    } catch (error) {
      logError('Failed to cancel order', error as Error, { command });
      throw error;
    }
  }
}

/**
 * Update Order Status Command Handler
 */
export class UpdateOrderStatusCommandHandler implements ICommandHandler<UpdateOrderStatusCommand> {
  constructor(private readonly eventStore: EventStore) {}

  async execute(command: UpdateOrderStatusCommand): Promise<{ aggregateId: string; newStatus: string }> {
    try {
      logInfo('Updating order status', { 
        orderId: command.aggregateId,
        newStatus: command.payload.status 
      });
      
      // Load aggregate
      const events = await this.eventStore.getEvents(command.aggregateId);
      const aggregate = OrderAggregate.fromOrderEvents(events);
      
      // Update status
      aggregate.changeStatus(
        command.payload.status,
        command.payload.reason,
        command.metadata?.userId,
        { correlationId: command.metadata?.correlationId }
      );
      
      // Save new events
      await this.eventStore.save(
        aggregate.id,
        aggregate.uncommittedEvents,
        aggregate.version
      );
      
      logInfo('Order status updated successfully', { 
        orderId: command.aggregateId,
        newStatus: command.payload.status 
      });
      
      return { 
        aggregateId: aggregate.id,
        newStatus: command.payload.status 
      };
    } catch (error) {
      logError('Failed to update order status', error as Error, { command });
      throw error;
    }
  }
}

/**
 * Ship Order Command Handler
 */
export class ShipOrderCommandHandler implements ICommandHandler<ShipOrderCommand> {
  constructor(private readonly eventStore: EventStore) {}

  async execute(command: ShipOrderCommand): Promise<{ aggregateId: string; trackingNumber: string }> {
    try {
      logInfo('Shipping order', { orderId: command.aggregateId });
      
      // Load aggregate
      const events = await this.eventStore.getEvents(command.aggregateId);
      const aggregate = OrderAggregate.fromOrderEvents(events);
      
      // Update shipping info with tracking number
      const currentShippingInfo = aggregate.getShippingInfo();
      const updatedShippingInfo = ShippingInfo.fromJSON({
        ...currentShippingInfo.toJSON(),
        trackingNumber: command.payload.trackingNumber,
        carrier: command.payload.carrier
      });
      
      aggregate.updateShippingInfo(updatedShippingInfo, {
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      });
      
      // Save new events
      await this.eventStore.save(
        aggregate.id,
        aggregate.uncommittedEvents,
        aggregate.version
      );
      
      logInfo('Order shipped successfully', { 
        orderId: command.aggregateId,
        trackingNumber: command.payload.trackingNumber 
      });
      
      return { 
        aggregateId: aggregate.id,
        trackingNumber: command.payload.trackingNumber 
      };
    } catch (error) {
      logError('Failed to ship order', error as Error, { command });
      throw error;
    }
  }
}

/**
 * Add Order Item Command Handler
 */
export class AddOrderItemCommandHandler implements ICommandHandler<AddOrderItemCommand> {
  constructor(private readonly eventStore: EventStore) {}

  async execute(command: AddOrderItemCommand): Promise<{ aggregateId: string; productId: string }> {
    try {
      logInfo('Adding item to order', { 
        orderId: command.aggregateId,
        productId: command.payload.productId 
      });
      
      // Load aggregate
      const events = await this.eventStore.getEvents(command.aggregateId);
      const aggregate = OrderAggregate.fromOrderEvents(events);
      
      // Add item
      aggregate.addItem(
        command.payload.productId,
        command.payload.productName,
        command.payload.productSku,
        command.payload.quantity,
        Money.fromJSON(command.payload.unitPrice),
        {
          correlationId: command.metadata?.correlationId,
          userId: command.metadata?.userId
        }
      );
      
      // Save new events
      await this.eventStore.save(
        aggregate.id,
        aggregate.uncommittedEvents,
        aggregate.version
      );
      
      logInfo('Item added to order successfully', { 
        orderId: command.aggregateId,
        productId: command.payload.productId 
      });
      
      return { 
        aggregateId: aggregate.id,
        productId: command.payload.productId 
      };
    } catch (error) {
      logError('Failed to add item to order', error as Error, { command });
      throw error;
    }
  }
}

/**
 * Remove Order Item Command Handler
 */
export class RemoveOrderItemCommandHandler implements ICommandHandler<RemoveOrderItemCommand> {
  constructor(private readonly eventStore: EventStore) {}

  async execute(command: RemoveOrderItemCommand): Promise<{ aggregateId: string; productId: string }> {
    try {
      logInfo('Removing item from order', { 
        orderId: command.aggregateId,
        productId: command.payload.productId 
      });
      
      // Load aggregate
      const events = await this.eventStore.getEvents(command.aggregateId);
      const aggregate = OrderAggregate.fromOrderEvents(events);
      
      // Find item by product ID
      const items = aggregate.getItems();
      const itemToRemove = items.find(item => item.productId === command.payload.productId);
      
      if (!itemToRemove) {
        throw new Error(`Item with product ID ${command.payload.productId} not found in order`);
      }
      
      // Remove item
      aggregate.removeItem(itemToRemove.id, {
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      });
      
      // Save new events
      await this.eventStore.save(
        aggregate.id,
        aggregate.uncommittedEvents,
        aggregate.version
      );
      
      logInfo('Item removed from order successfully', { 
        orderId: command.aggregateId,
        productId: command.payload.productId 
      });
      
      return { 
        aggregateId: aggregate.id,
        productId: command.payload.productId 
      };
    } catch (error) {
      logError('Failed to remove item from order', error as Error, { command });
      throw error;
    }
  }
}

/**
 * Update Shipping Address Command Handler
 */
export class UpdateShippingAddressCommandHandler implements ICommandHandler<UpdateShippingAddressCommand> {
  constructor(private readonly eventStore: EventStore) {}

  async execute(command: UpdateShippingAddressCommand): Promise<{ aggregateId: string }> {
    try {
      logInfo('Updating shipping address', { orderId: command.aggregateId });
      
      // Load aggregate
      const events = await this.eventStore.getEvents(command.aggregateId);
      const aggregate = OrderAggregate.fromOrderEvents(events);
      
      // Update shipping info with new address
      const currentShippingInfo = aggregate.getShippingInfo();
      const newAddress = Address.fromJSON(command.payload.address);
      const updatedShippingInfo = ShippingInfo.fromJSON({
        ...currentShippingInfo.toJSON(),
        shippingAddress: newAddress.toJSON()
      });
      
      aggregate.updateShippingInfo(updatedShippingInfo, {
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      });
      
      // Save new events
      await this.eventStore.save(
        aggregate.id,
        aggregate.uncommittedEvents,
        aggregate.version
      );
      
      logInfo('Shipping address updated successfully', { orderId: command.aggregateId });
      
      return { aggregateId: aggregate.id };
    } catch (error) {
      logError('Failed to update shipping address', error as Error, { command });
      throw error;
    }
  }
}

/**
 * Process Payment Command Handler
 */
export class ProcessPaymentCommandHandler implements ICommandHandler<ProcessPaymentCommand> {
  constructor(private readonly eventStore: EventStore) {}

  async execute(command: ProcessPaymentCommand): Promise<{ aggregateId: string; transactionId: string }> {
    try {
      logInfo('Processing payment for order', { 
        orderId: command.aggregateId,
        amount: command.payload.amount 
      });
      
      // Load aggregate
      const events = await this.eventStore.getEvents(command.aggregateId);
      const aggregate = OrderAggregate.fromOrderEvents(events);
      
      // Update payment info
      const updatedPaymentInfo = PaymentInfo.fromJSON({
        method: command.payload.method,
        status: 'captured',
        transactionId: command.payload.transactionId,
        processedAt: new Date().toISOString()
      });
      
      aggregate.updatePaymentInfo(updatedPaymentInfo, {
        correlationId: command.metadata?.correlationId,
        userId: command.metadata?.userId
      });
      
      // Save new events
      await this.eventStore.save(
        aggregate.id,
        aggregate.uncommittedEvents,
        aggregate.version
      );
      
      logInfo('Payment processed successfully', { 
        orderId: command.aggregateId,
        transactionId: command.payload.transactionId 
      });
      
      return { 
        aggregateId: aggregate.id,
        transactionId: command.payload.transactionId 
      };
    } catch (error) {
      logError('Failed to process payment', error as Error, { command });
      throw error;
    }
  }
}

/**
 * Refund Order Command Handler
 */
export class RefundOrderCommandHandler implements ICommandHandler<RefundOrderCommand> {
  constructor(private readonly eventStore: EventStore) {}

  async execute(command: RefundOrderCommand): Promise<{ aggregateId: string; refundAmount: number }> {
    try {
      logInfo('Processing refund for order', { 
        orderId: command.aggregateId,
        amount: command.payload.amount 
      });
      
      // Load aggregate
      const events = await this.eventStore.getEvents(command.aggregateId);
      const aggregate = OrderAggregate.fromOrderEvents(events);
      
      // Process refund
      aggregate.refund(
        Money.fromJSON({ amount: command.payload.amount, currency: command.payload.currency || 'USD' }),
        command.payload.reason,
        command.metadata?.userId || 'system',
        command.payload.transactionId,
        { correlationId: command.metadata?.correlationId }
      );
      
      // Save new events
      await this.eventStore.save(
        aggregate.id,
        aggregate.uncommittedEvents,
        aggregate.version
      );
      
      logInfo('Refund processed successfully', { 
        orderId: command.aggregateId,
        amount: command.payload.amount 
      });
      
      return { 
        aggregateId: aggregate.id,
        refundAmount: command.payload.amount 
      };
    } catch (error) {
      logError('Failed to process refund', error as Error, { command });
      throw error;
    }
  }
}

/**
 * Command handler factory
 */
export function createOrderCommandHandlers(eventStore: EventStore) {
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