import { CommandHandler, type ICommandHandler } from '@graphql-microservices/event-sourcing';
import { EventStore } from '@graphql-microservices/event-sourcing';
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
import { logInfo, logError } from '@graphql-microservices/shared-logging';

/**
 * Create Order Command Handler
 */
@CommandHandler(CreateOrderCommand)
export class CreateOrderCommandHandler implements ICommandHandler<CreateOrderCommand> {
  constructor(private readonly eventStore: EventStore) {}

  async execute(command: CreateOrderCommand): Promise<{ aggregateId: string; orderNumber: string }> {
    try {
      logInfo('Creating new order', { customerId: command.payload.customerId });
      
      // Create new order aggregate
      const aggregate = OrderAggregate.create(command);
      
      // Save events to event store
      await this.eventStore.save(aggregate.getId(), aggregate.getUncommittedEvents(), 0);
      
      // Get order number from aggregate
      const orderNumber = aggregate.getOrderNumber();
      
      logInfo('Order created successfully', { 
        orderId: aggregate.getId(), 
        orderNumber,
        customerId: command.payload.customerId 
      });
      
      return { 
        aggregateId: aggregate.getId(),
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
@CommandHandler(CancelOrderCommand)
export class CancelOrderCommandHandler implements ICommandHandler<CancelOrderCommand> {
  constructor(private readonly eventStore: EventStore) {}

  async execute(command: CancelOrderCommand): Promise<{ aggregateId: string }> {
    try {
      logInfo('Cancelling order', { orderId: command.aggregateId });
      
      // Load aggregate from event store
      const events = await this.eventStore.getEvents(command.aggregateId);
      const aggregate = new OrderAggregate(command.aggregateId);
      aggregate.loadFromHistory(events);
      
      // Handle command
      aggregate.handle(command);
      
      // Save new events
      await this.eventStore.save(
        aggregate.getId(),
        aggregate.getUncommittedEvents(),
        aggregate.getVersion()
      );
      
      logInfo('Order cancelled successfully', { orderId: command.aggregateId });
      
      return { aggregateId: aggregate.getId() };
    } catch (error) {
      logError('Failed to cancel order', error as Error, { command });
      throw error;
    }
  }
}

/**
 * Update Order Status Command Handler
 */
@CommandHandler(UpdateOrderStatusCommand)
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
      const aggregate = new OrderAggregate(command.aggregateId);
      aggregate.loadFromHistory(events);
      
      // Handle command
      aggregate.handle(command);
      
      // Save new events
      await this.eventStore.save(
        aggregate.getId(),
        aggregate.getUncommittedEvents(),
        aggregate.getVersion()
      );
      
      logInfo('Order status updated successfully', { 
        orderId: command.aggregateId,
        newStatus: command.payload.status 
      });
      
      return { 
        aggregateId: aggregate.getId(),
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
@CommandHandler(ShipOrderCommand)
export class ShipOrderCommandHandler implements ICommandHandler<ShipOrderCommand> {
  constructor(private readonly eventStore: EventStore) {}

  async execute(command: ShipOrderCommand): Promise<{ aggregateId: string; trackingNumber: string }> {
    try {
      logInfo('Shipping order', { orderId: command.aggregateId });
      
      // Load aggregate
      const events = await this.eventStore.getEvents(command.aggregateId);
      const aggregate = new OrderAggregate(command.aggregateId);
      aggregate.loadFromHistory(events);
      
      // Handle command
      aggregate.handle(command);
      
      // Save new events
      await this.eventStore.save(
        aggregate.getId(),
        aggregate.getUncommittedEvents(),
        aggregate.getVersion()
      );
      
      logInfo('Order shipped successfully', { 
        orderId: command.aggregateId,
        trackingNumber: command.payload.trackingNumber 
      });
      
      return { 
        aggregateId: aggregate.getId(),
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
@CommandHandler(AddOrderItemCommand)
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
      const aggregate = new OrderAggregate(command.aggregateId);
      aggregate.loadFromHistory(events);
      
      // Handle command
      aggregate.handle(command);
      
      // Save new events
      await this.eventStore.save(
        aggregate.getId(),
        aggregate.getUncommittedEvents(),
        aggregate.getVersion()
      );
      
      logInfo('Item added to order successfully', { 
        orderId: command.aggregateId,
        productId: command.payload.productId 
      });
      
      return { 
        aggregateId: aggregate.getId(),
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
@CommandHandler(RemoveOrderItemCommand)
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
      const aggregate = new OrderAggregate(command.aggregateId);
      aggregate.loadFromHistory(events);
      
      // Handle command
      aggregate.handle(command);
      
      // Save new events
      await this.eventStore.save(
        aggregate.getId(),
        aggregate.getUncommittedEvents(),
        aggregate.getVersion()
      );
      
      logInfo('Item removed from order successfully', { 
        orderId: command.aggregateId,
        productId: command.payload.productId 
      });
      
      return { 
        aggregateId: aggregate.getId(),
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
@CommandHandler(UpdateShippingAddressCommand)
export class UpdateShippingAddressCommandHandler implements ICommandHandler<UpdateShippingAddressCommand> {
  constructor(private readonly eventStore: EventStore) {}

  async execute(command: UpdateShippingAddressCommand): Promise<{ aggregateId: string }> {
    try {
      logInfo('Updating shipping address', { orderId: command.aggregateId });
      
      // Load aggregate
      const events = await this.eventStore.getEvents(command.aggregateId);
      const aggregate = new OrderAggregate(command.aggregateId);
      aggregate.loadFromHistory(events);
      
      // Handle command
      aggregate.handle(command);
      
      // Save new events
      await this.eventStore.save(
        aggregate.getId(),
        aggregate.getUncommittedEvents(),
        aggregate.getVersion()
      );
      
      logInfo('Shipping address updated successfully', { orderId: command.aggregateId });
      
      return { aggregateId: aggregate.getId() };
    } catch (error) {
      logError('Failed to update shipping address', error as Error, { command });
      throw error;
    }
  }
}

/**
 * Process Payment Command Handler
 */
@CommandHandler(ProcessPaymentCommand)
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
      const aggregate = new OrderAggregate(command.aggregateId);
      aggregate.loadFromHistory(events);
      
      // Handle command
      aggregate.handle(command);
      
      // Save new events
      await this.eventStore.save(
        aggregate.getId(),
        aggregate.getUncommittedEvents(),
        aggregate.getVersion()
      );
      
      logInfo('Payment processed successfully', { 
        orderId: command.aggregateId,
        transactionId: command.payload.transactionId 
      });
      
      return { 
        aggregateId: aggregate.getId(),
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
@CommandHandler(RefundOrderCommand)
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
      const aggregate = new OrderAggregate(command.aggregateId);
      aggregate.loadFromHistory(events);
      
      // Handle command
      aggregate.handle(command);
      
      // Save new events
      await this.eventStore.save(
        aggregate.getId(),
        aggregate.getUncommittedEvents(),
        aggregate.getVersion()
      );
      
      logInfo('Refund processed successfully', { 
        orderId: command.aggregateId,
        amount: command.payload.amount 
      });
      
      return { 
        aggregateId: aggregate.getId(),
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