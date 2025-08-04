import {
  type AsyncResult,
  type CommandBus,
  createCommandBus,
  type DomainError,
  type TypedCommandMap,
} from '@graphql-microservices/event-sourcing';
import { Result } from '@graphql-microservices/shared-result';
import type {
  AddOrderItemCommand,
  CancelOrderCommand,
  CreateOrderCommand,
  OrderCommand,
  ProcessPaymentCommand,
  RefundOrderCommand,
  RemoveOrderItemCommand,
  ShipOrderCommand,
  UpdateOrderStatusCommand,
  UpdateShippingAddressCommand,
} from '../../domain/commands';
import type { OrderRepository } from '../../infrastructure/order-repository';
import { createOrderCommandHandlers } from './handlers';

// Define the order command map for type safety
export type OrderCommandMap = TypedCommandMap<{
  CreateOrder: CreateOrderCommand;
  CancelOrder: CancelOrderCommand;
  UpdateOrderStatus: UpdateOrderStatusCommand;
  ShipOrder: ShipOrderCommand;
  AddOrderItem: AddOrderItemCommand;
  RemoveOrderItem: RemoveOrderItemCommand;
  UpdateShippingAddress: UpdateShippingAddressCommand;
  ProcessPayment: ProcessPaymentCommand;
  RefundOrder: RefundOrderCommand;
}>;

export interface CommandResult {
  success: boolean;
  aggregateId?: string;
  orderNumber?: string;
  trackingNumber?: string;
  productId?: string;
  transactionId?: string;
  refundAmount?: number;
  newStatus?: string;
  error?: string;
}

export class OrderCommandBus {
  private commandBus: CommandBus<OrderCommandMap>;
  private handlers: ReturnType<typeof createOrderCommandHandlers>;

  constructor(repository: OrderRepository) {
    this.commandBus = createCommandBus<OrderCommandMap>({
      enableTracing: true,
      enableMetrics: true,
      validateCommands: true,
    });

    this.handlers = createOrderCommandHandlers(repository);
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Register all command handlers with the modern command bus
    this.commandBus.register('CreateOrder', this.handlers.createOrder);
    this.commandBus.register('CancelOrder', this.handlers.cancelOrder);
    this.commandBus.register('UpdateOrderStatus', this.handlers.updateOrderStatus);
    this.commandBus.register('ShipOrder', this.handlers.shipOrder);
    this.commandBus.register('AddOrderItem', this.handlers.addOrderItem);
    this.commandBus.register('RemoveOrderItem', this.handlers.removeOrderItem);
    this.commandBus.register('UpdateShippingAddress', this.handlers.updateShippingAddress);
    this.commandBus.register('ProcessPayment', this.handlers.processPayment);
    this.commandBus.register('RefundOrder', this.handlers.refundOrder);
  }

  async execute<K extends keyof OrderCommandMap>(
    commandType: K,
    command: OrderCommandMap[K]
  ): AsyncResult<any, DomainError> {
    return this.commandBus.execute(commandType, command);
  }

  // Legacy execute method for backward compatibility
  async executeLegacy(command: OrderCommand, aggregateId?: string): Promise<CommandResult> {
    const result = await this.execute(command.type as keyof OrderCommandMap, command as any);

    return Result.match(result, {
      ok: (value) => ({
        success: true,
        aggregateId: value?.aggregateId,
        orderNumber: value?.orderNumber,
        trackingNumber: value?.trackingNumber,
        productId: value?.productId,
        transactionId: value?.transactionId,
        refundAmount: value?.refundAmount,
        newStatus: value?.newStatus,
      }),
      err: (error) => ({
        success: false,
        error: error.message,
      }),
    });
  }

  async executeWithRetry<K extends keyof OrderCommandMap>(
    commandType: K,
    command: OrderCommandMap[K],
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): AsyncResult<any, DomainError> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.execute(commandType, command);

      if (Result.isOk(result)) {
        return result;
      }

      // Don't retry on business rule violations
      const error = result.error;
      if (error.code === 'BUSINESS_RULE_ERROR' || error.code === 'VALIDATION_ERROR') {
        return result;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
      }
    }

    // Return the last failed result
    return this.execute(commandType, command);
  }

  // Legacy retry method for backward compatibility
  async executeWithRetryLegacy(
    command: OrderCommand,
    aggregateId?: string,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<CommandResult> {
    const result = await this.executeWithRetry(
      command.type as keyof OrderCommandMap,
      command as any,
      maxRetries,
      retryDelay
    );

    return Result.match(result, {
      ok: (value) => ({
        success: true,
        aggregateId: value?.aggregateId,
        orderNumber: value?.orderNumber,
        trackingNumber: value?.trackingNumber,
        productId: value?.productId,
        transactionId: value?.transactionId,
        refundAmount: value?.refundAmount,
        newStatus: value?.newStatus,
      }),
      err: (error) => ({
        success: false,
        error: error.message,
      }),
    });
  }
}
