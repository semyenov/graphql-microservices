import { CommandBus as BaseCommandBus } from '@graphql-microservices/event-sourcing';
import type { EventStore } from '@graphql-microservices/event-sourcing';
import { createOrderCommandHandlers } from './handlers';
import type { OrderCommand } from '../../domain/commands';

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
  private commandBus: BaseCommandBus;
  private handlers: ReturnType<typeof createOrderCommandHandlers>;

  constructor(private readonly eventStore: EventStore) {
    this.commandBus = new BaseCommandBus();
    this.handlers = createOrderCommandHandlers(eventStore);
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Register all command handlers
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

  async execute(command: OrderCommand): Promise<CommandResult> {
    try {
      const result = await this.commandBus.execute(command);

      // Map the result based on command type
      switch (command.type) {
        case 'CreateOrder':
          return {
            success: true,
            aggregateId: result.aggregateId,
            orderNumber: result.orderNumber,
          };

        case 'CancelOrder':
          return {
            success: true,
            aggregateId: result.aggregateId,
          };

        case 'UpdateOrderStatus':
          return {
            success: true,
            aggregateId: result.aggregateId,
            newStatus: result.newStatus,
          };

        case 'ShipOrder':
          return {
            success: true,
            aggregateId: result.aggregateId,
            trackingNumber: result.trackingNumber,
          };

        case 'AddOrderItem':
          return {
            success: true,
            aggregateId: result.aggregateId,
            productId: result.productId,
          };

        case 'RemoveOrderItem':
          return {
            success: true,
            aggregateId: result.aggregateId,
            productId: result.productId,
          };

        case 'UpdateShippingAddress':
          return {
            success: true,
            aggregateId: result.aggregateId,
          };

        case 'ProcessPayment':
          return {
            success: true,
            aggregateId: result.aggregateId,
            transactionId: result.transactionId,
          };

        case 'RefundOrder':
          return {
            success: true,
            aggregateId: result.aggregateId,
            refundAmount: result.refundAmount,
          };

        default:
          return {
            success: false,
            error: `Unknown command type: ${(command as any).type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async executeWithRetry(
    command: OrderCommand,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<CommandResult> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.execute(command);
      } catch (error) {
        lastError = error as Error;

        // Don't retry on business rule violations
        if (error instanceof Error &&
          (error.message.includes('BusinessRuleError') ||
            error.message.includes('ValidationError'))) {
          throw error;
        }

        // Wait before retrying (exponential backoff)
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Command execution failed after retries',
    };
  }
}