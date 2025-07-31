import type { CacheService } from '@graphql-microservices/shared-cache';
import type { Prisma, PrismaClient } from '../../generated/prisma';
import {
  publishOrderCancelled,
  publishOrderCreated,
  publishOrderRefunded,
  publishOrderStatusChanged,
} from '../subscriptions';
import {
  type CancelOrderCommand,
  type CommandResult,
  CommandType,
  type CreateOrderCommand,
  type MarkAsDeliveredCommand,
  type MarkAsShippedCommand,
  type OrderCommand,
  type ProcessRefundCommand,
  type UpdateOrderStatusCommand,
  type UpdateShippingAddressCommand,
  validateCommand,
} from './commands';
import { ok, err, isOk, isErr } from '@graphql-microservices/shared-type-utils';
import {
  cacheKey,
  canTransitionStatus,
  generateOrderNumber,
  type OrderId,
  type OrderNumber,
  type OrderStatus,
} from './types';

/**
 * Command handler interface
 */
export interface CommandHandler<TCommand extends OrderCommand = OrderCommand> {
  readonly commandType: TCommand['type'];
  handle(command: TCommand): Promise<CommandResult>;
  canHandle(command: OrderCommand): command is TCommand;
}

/**
 * Base command handler with common functionality
 */
abstract class BaseCommandHandler<TCommand extends OrderCommand = OrderCommand>
  implements CommandHandler<TCommand>
{
  abstract readonly commandType: TCommand['type'];

  constructor(
    protected readonly prisma: PrismaClient,
    protected readonly cacheService: CacheService,
    protected readonly pubsub: any // PubSub type
  ) {}

  abstract handle(command: TCommand): Promise<CommandResult>;

  canHandle(command: OrderCommand): command is TCommand {
    return command.type === this.commandType;
  }

  /**
   * Invalidate order cache
   */
  protected async invalidateOrderCache(orderId: OrderId, orderNumber?: OrderNumber): Promise<void> {
    const keys = [
      cacheKey.order(orderId),
      orderNumber && cacheKey.orderByNumber(orderNumber),
    ].filter(Boolean) as string[];

    await Promise.all(keys.map((key) => this.cacheService.delete(key)));
  }

  /**
   * Invalidate list caches
   */
  protected async invalidateListCaches(userId?: string, status?: OrderStatus): Promise<void> {
    const patterns = [
      'orders:list:*',
      userId && `orders:user:${userId}`,
      status && `orders:status:${status}`,
    ].filter(Boolean) as string[];

    await Promise.all(patterns.map((pattern) => this.cacheService.clearPattern(pattern)));
  }

  /**
   * Calculate order totals
   */
  protected calculateOrderTotals(items: Array<{ quantity: number; unitPrice: number }>) {
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const tax = subtotal * 0.1; // 10% tax (simplified)
    const shipping = 10; // Fixed shipping (simplified)
    const totalAmount = subtotal + tax + shipping;

    return { subtotal, tax, shipping, totalAmount };
  }
}

/**
 * Create Order Command Handler
 */
export class CreateOrderCommandHandler extends BaseCommandHandler<CreateOrderCommand> {
  readonly commandType = CommandType.CREATE_ORDER as const;

  async handle(command: CreateOrderCommand): Promise<CommandResult> {
    try {
      validateCommand(command);

      const orderNumber = generateOrderNumber();
      const { subtotal, tax, shipping, totalAmount } = this.calculateOrderTotals(
        command.payload.items
      );

      // Create order and items in transaction
      const order = await this.prisma.$transaction(async (tx) => {
        // Create order
        const newOrder = await tx.order.create({
          data: {
            id: command.orderId,
            orderNumber,
            userId: command.payload.userId,
            status: 'PENDING',
            subtotal,
            tax,
            shipping,
            totalAmount,
            discount: 0,
            notes: command.payload.notes,
            shippingAddress: command.payload.shippingAddress as Prisma.JsonObject,
            paymentInfo: {
              method: command.payload.paymentMethod,
              status: 'PENDING',
            } as Prisma.JsonObject,
            shippingInfo: {
              status: 'NOT_SHIPPED',
            } as Prisma.JsonObject,
          },
        });

        // Create order items
        await tx.orderItem.createMany({
          data: command.payload.items.map((item) => ({
            orderId: newOrder.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
          })),
        });

        return newOrder;
      });

      // Publish event
      await publishOrderCreated(this.pubsub, {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          status: order.status,
          totalAmount: order.totalAmount,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
        },
      });

      // Invalidate list caches
      await this.invalidateListCaches(order.userId);

      return ok({
        orderId: order.id as OrderId,
        orderNumber: order.orderNumber as OrderNumber,
        success: true,
      });
    } catch (error) {
      console.error('CreateOrder command failed:', error);
      return err({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      });
    }
  }
}

/**
 * Update Order Status Command Handler
 */
export class UpdateOrderStatusCommandHandler extends BaseCommandHandler<UpdateOrderStatusCommand> {
  readonly commandType = CommandType.UPDATE_ORDER_STATUS as const;

  async handle(command: UpdateOrderStatusCommand): Promise<CommandResult> {
    try {
      validateCommand(command);

      // Get current order
      const currentOrder = await this.prisma.order.findUnique({
        where: { id: command.orderId },
      });

      if (!currentOrder) {
        return err({
          code: 'NOT_FOUND',
          message: 'Order not found',
          details: { orderId: command.orderId },
        });
      }

      // Validate status transition
      if (!canTransitionStatus(currentOrder.status as OrderStatus, command.payload.newStatus)) {
        return err({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot transition from ${currentOrder.status} to ${command.payload.newStatus}`,
          details: {
            currentStatus: currentOrder.status,
            requestedStatus: command.payload.newStatus,
          },
        });
      }

      // Update order
      const order = await this.prisma.order.update({
        where: { id: command.orderId },
        data: {
          status: command.payload.newStatus,
          updatedAt: new Date(),
        },
      });

      // Publish event
      await publishOrderStatusChanged(this.pubsub, {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          status: order.status,
          totalAmount: order.totalAmount,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
        },
        previousStatus: currentOrder.status,
        newStatus: command.payload.newStatus,
        reason: command.payload.reason,
      });

      // Invalidate caches
      await this.invalidateOrderCache(command.orderId as OrderId, order.orderNumber as OrderNumber);
      await this.invalidateListCaches(order.userId, command.payload.newStatus);

      return ok({
        orderId: order.id as OrderId,
        orderNumber: order.orderNumber as OrderNumber,
        success: true,
        updatedFields: ['status'],
      });
    } catch (error) {
      console.error('UpdateOrderStatus command failed:', error);
      return err({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      });
    }
  }
}

/**
 * Cancel Order Command Handler
 */
export class CancelOrderCommandHandler extends BaseCommandHandler<CancelOrderCommand> {
  readonly commandType = CommandType.CANCEL_ORDER as const;

  async handle(command: CancelOrderCommand): Promise<CommandResult> {
    try {
      validateCommand(command);

      // Get current order
      const currentOrder = await this.prisma.order.findUnique({
        where: { id: command.orderId },
        include: { items: true },
      });

      if (!currentOrder) {
        return err({
          code: 'NOT_FOUND',
          message: 'Order not found',
          details: { orderId: command.orderId },
        });
      }

      // Validate can cancel
      if (!canTransitionStatus(currentOrder.status as OrderStatus, 'CANCELLED')) {
        return err({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot cancel order in ${currentOrder.status} status`,
          details: { currentStatus: currentOrder.status },
        });
      }

      // Update order
      const order = await this.prisma.order.update({
        where: { id: command.orderId },
        data: {
          status: 'CANCELLED',
          updatedAt: new Date(),
        },
      });

      // TODO: In real implementation, restore inventory for cancelled items

      // Publish event
      await publishOrderCancelled(this.pubsub, {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          status: order.status,
          totalAmount: order.totalAmount,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
        },
        reason: command.payload.reason,
        cancelledBy: command.payload.cancelledBy,
        refundAmount: command.payload.refundAmount,
      });

      // Invalidate caches
      await this.invalidateOrderCache(command.orderId as OrderId, order.orderNumber as OrderNumber);
      await this.invalidateListCaches(order.userId, 'CANCELLED');

      return ok({
        orderId: order.id as OrderId,
        orderNumber: order.orderNumber as OrderNumber,
        success: true,
        updatedFields: ['status'],
      });
    } catch (error) {
      console.error('CancelOrder command failed:', error);
      return err({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      });
    }
  }
}

/**
 * Mark As Shipped Command Handler
 */
export class MarkAsShippedCommandHandler extends BaseCommandHandler<MarkAsShippedCommand> {
  readonly commandType = CommandType.MARK_AS_SHIPPED as const;

  async handle(command: MarkAsShippedCommand): Promise<CommandResult> {
    try {
      validateCommand(command);

      // Get current order
      const currentOrder = await this.prisma.order.findUnique({
        where: { id: command.orderId },
      });

      if (!currentOrder) {
        return err({
          code: 'NOT_FOUND',
          message: 'Order not found',
          details: { orderId: command.orderId },
        });
      }

      // Validate can ship
      if (!canTransitionStatus(currentOrder.status as OrderStatus, 'SHIPPED')) {
        return err({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot ship order in ${currentOrder.status} status`,
          details: { currentStatus: currentOrder.status },
        });
      }

      // Update order
      const order = await this.prisma.order.update({
        where: { id: command.orderId },
        data: {
          status: 'SHIPPED',
          shippingInfo: {
            status: 'SHIPPED',
            carrier: command.payload.carrier,
            trackingNumber: command.payload.trackingNumber,
            shippedAt: command.payload.shippedAt?.toISOString() || new Date().toISOString(),
            estimatedDeliveryDate: command.payload.estimatedDeliveryDate?.toISOString(),
          } as Prisma.JsonObject,
          updatedAt: new Date(),
        },
      });

      // Publish event
      await publishOrderStatusChanged(this.pubsub, {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          status: order.status,
          totalAmount: order.totalAmount,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
        },
        previousStatus: currentOrder.status,
        newStatus: 'SHIPPED',
        reason: `Shipped by ${command.payload.shippedBy}`,
      });

      // Invalidate caches
      await this.invalidateOrderCache(command.orderId as OrderId, order.orderNumber as OrderNumber);
      await this.invalidateListCaches(order.userId, 'SHIPPED');

      return ok({
        orderId: order.id as OrderId,
        orderNumber: order.orderNumber as OrderNumber,
        success: true,
        updatedFields: ['status', 'shippingInfo'],
      });
    } catch (error) {
      console.error('MarkAsShipped command failed:', error);
      return err({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      });
    }
  }
}

/**
 * Mark As Delivered Command Handler
 */
export class MarkAsDeliveredCommandHandler extends BaseCommandHandler<MarkAsDeliveredCommand> {
  readonly commandType = CommandType.MARK_AS_DELIVERED as const;

  async handle(command: MarkAsDeliveredCommand): Promise<CommandResult> {
    try {
      validateCommand(command);

      // Get current order
      const currentOrder = await this.prisma.order.findUnique({
        where: { id: command.orderId },
      });

      if (!currentOrder) {
        return err({
          code: 'NOT_FOUND',
          message: 'Order not found',
          details: { orderId: command.orderId },
        });
      }

      // Validate can deliver
      if (!canTransitionStatus(currentOrder.status as OrderStatus, 'DELIVERED')) {
        return err({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot deliver order in ${currentOrder.status} status`,
          details: { currentStatus: currentOrder.status },
        });
      }

      // Get existing shipping info
      const existingShippingInfo = (currentOrder.shippingInfo as any) || {};

      // Update order
      const order = await this.prisma.order.update({
        where: { id: command.orderId },
        data: {
          status: 'DELIVERED',
          shippingInfo: {
            ...existingShippingInfo,
            status: 'DELIVERED',
            deliveredAt: command.payload.deliveredAt?.toISOString() || new Date().toISOString(),
            recipientName: command.payload.recipientName,
            deliveryNotes: command.payload.deliveryNotes,
          } as Prisma.JsonObject,
          updatedAt: new Date(),
        },
      });

      // Publish event
      await publishOrderStatusChanged(this.pubsub, {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          status: order.status,
          totalAmount: order.totalAmount,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
        },
        previousStatus: currentOrder.status,
        newStatus: 'DELIVERED',
        reason: `Delivered by ${command.payload.deliveredBy}`,
      });

      // Invalidate caches
      await this.invalidateOrderCache(command.orderId as OrderId, order.orderNumber as OrderNumber);
      await this.invalidateListCaches(order.userId, 'DELIVERED');

      return ok({
        orderId: order.id as OrderId,
        orderNumber: order.orderNumber as OrderNumber,
        success: true,
        updatedFields: ['status', 'shippingInfo'],
      });
    } catch (error) {
      console.error('MarkAsDelivered command failed:', error);
      return err({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      });
    }
  }
}

/**
 * Process Refund Command Handler
 */
export class ProcessRefundCommandHandler extends BaseCommandHandler<ProcessRefundCommand> {
  readonly commandType = CommandType.PROCESS_REFUND as const;

  async handle(command: ProcessRefundCommand): Promise<CommandResult> {
    try {
      validateCommand(command);

      // Get current order
      const currentOrder = await this.prisma.order.findUnique({
        where: { id: command.orderId },
      });

      if (!currentOrder) {
        return err({
          code: 'NOT_FOUND',
          message: 'Order not found',
          details: { orderId: command.orderId },
        });
      }

      // Validate can refund
      if (!canTransitionStatus(currentOrder.status as OrderStatus, 'REFUNDED')) {
        return err({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot refund order in ${currentOrder.status} status`,
          details: { currentStatus: currentOrder.status },
        });
      }

      // Validate refund amount
      if (command.payload.refundAmount > currentOrder.totalAmount) {
        return err({
          code: 'BUSINESS_RULE_VIOLATION',
          message: 'Refund amount exceeds order total',
          details: {
            refundAmount: command.payload.refundAmount,
            orderTotal: currentOrder.totalAmount,
          },
        });
      }

      // Get existing payment info
      const existingPaymentInfo = (currentOrder.paymentInfo as any) || {};

      // Update order
      const order = await this.prisma.order.update({
        where: { id: command.orderId },
        data: {
          status: 'REFUNDED',
          paymentInfo: {
            ...existingPaymentInfo,
            status: 'REFUNDED',
            refundAmount: command.payload.refundAmount,
            refundedAt: new Date().toISOString(),
            refundReason: command.payload.reason,
          } as Prisma.JsonObject,
          updatedAt: new Date(),
        },
      });

      // Publish event
      await publishOrderRefunded(this.pubsub, {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          status: order.status,
          totalAmount: order.totalAmount,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
        },
        refundAmount: command.payload.refundAmount,
        reason: command.payload.reason,
        processedBy: command.payload.processedBy,
      });

      // Invalidate caches
      await this.invalidateOrderCache(command.orderId as OrderId, order.orderNumber as OrderNumber);
      await this.invalidateListCaches(order.userId, 'REFUNDED');

      return ok({
        orderId: order.id as OrderId,
        orderNumber: order.orderNumber as OrderNumber,
        success: true,
        updatedFields: ['status', 'paymentInfo'],
      });
    } catch (error) {
      console.error('ProcessRefund command failed:', error);
      return err({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      });
    }
  }
}

/**
 * Update Shipping Address Command Handler
 */
export class UpdateShippingAddressCommandHandler extends BaseCommandHandler<UpdateShippingAddressCommand> {
  readonly commandType = CommandType.UPDATE_SHIPPING_ADDRESS as const;

  async handle(command: UpdateShippingAddressCommand): Promise<CommandResult> {
    try {
      validateCommand(command);

      // Get current order
      const currentOrder = await this.prisma.order.findUnique({
        where: { id: command.orderId },
      });

      if (!currentOrder) {
        return err({
          code: 'NOT_FOUND',
          message: 'Order not found',
          details: { orderId: command.orderId },
        });
      }

      // Can only update address before shipping
      if (['SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].includes(currentOrder.status)) {
        return err({
          code: 'BUSINESS_RULE_VIOLATION',
          message: `Cannot update shipping address for order in ${currentOrder.status} status`,
          details: { currentStatus: currentOrder.status },
        });
      }

      // Update order
      const order = await this.prisma.order.update({
        where: { id: command.orderId },
        data: {
          shippingAddress: command.payload.shippingAddress as Prisma.JsonObject,
          updatedAt: new Date(),
        },
      });

      // Publish event (using status changed for simplicity)
      await publishOrderStatusChanged(this.pubsub, {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          status: order.status,
          totalAmount: order.totalAmount,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
        },
        previousStatus: order.status,
        newStatus: order.status,
        reason: `Shipping address updated by ${command.payload.updatedBy}`,
      });

      // Invalidate caches
      await this.invalidateOrderCache(command.orderId as OrderId, order.orderNumber as OrderNumber);

      return ok({
        orderId: order.id as OrderId,
        orderNumber: order.orderNumber as OrderNumber,
        success: true,
        updatedFields: ['shippingAddress'],
      });
    } catch (error) {
      console.error('UpdateShippingAddress command failed:', error);
      return err({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      });
    }
  }
}

/**
 * Command Bus - Routes commands to appropriate handlers
 */
export class OrderCommandBus {
  private readonly handlers: Map<CommandType, CommandHandler<any>> = new Map();

  constructor(prisma: PrismaClient, cacheService: CacheService, pubsub: any) {
    // Register command handlers
    const handlers: CommandHandler<any>[] = [
      new CreateOrderCommandHandler(prisma, cacheService, pubsub),
      new UpdateOrderStatusCommandHandler(prisma, cacheService, pubsub),
      new CancelOrderCommandHandler(prisma, cacheService, pubsub),
      new MarkAsShippedCommandHandler(prisma, cacheService, pubsub),
      new MarkAsDeliveredCommandHandler(prisma, cacheService, pubsub),
      new ProcessRefundCommandHandler(prisma, cacheService, pubsub),
      new UpdateShippingAddressCommandHandler(prisma, cacheService, pubsub),
    ];

    handlers.forEach((handler) => {
      this.handlers.set(handler.commandType, handler);
    });
  }

  /**
   * Execute a command
   */
  async execute<TCommand extends OrderCommand = OrderCommand>(
    command: TCommand
  ): Promise<CommandResult> {
    const handler = this.handlers.get(command.type) as CommandHandler<TCommand>;

    if (!handler) {
      throw new Error(`No handler found for command type: ${command.type}`);
    }

    try {
      return await handler.handle(command);
    } catch (error) {
      console.error(`Command execution failed:`, error);

      return err({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: { commandType: command.type },
      });
    }
  }

  /**
   * Get all registered command types
   */
  getRegisteredCommands(): string[] {
    return Array.from(this.handlers.keys());
  }
}
