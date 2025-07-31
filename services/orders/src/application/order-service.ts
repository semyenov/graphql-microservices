import type { CacheService } from '@graphql-microservices/shared-cache';
import type { PubSubService } from '@graphql-microservices/shared-pubsub';
import { DomainErrors, ok, err, isOk, isErr, type Result } from '@graphql-microservices/shared-type-utils';
import type {
  PrismaClient,
  Order as PrismaOrder,
  OrderItem as PrismaOrderItem,
} from '../../generated/prisma';
import { OrderCommandBus } from './command-handlers';
import { type CommandResult, createCommand, type OrderCommand } from './commands';
import {
  createQuery,
  type OrderStatistics,
  type OrderViewModel,
  type PaginatedResult,
  type QueryResult,
  type UserOrderHistory,
} from './queries';
import { OrderQueryBus } from './query-handlers';
import {
  type Amount,
  type CommandMetadata,
  cacheKey,
  canTransitionStatus,
  createAmount,
  createOrderId,
  createOrderNumber,
  createQuantity,
  createTrackingNumber,
  generateOrderNumber,
  type OrderFilter,
  type OrderId,
  type OrderItem,
  type OrderNumber,
  type OrderSort,
  type OrderStatus,
  type Pagination,
  type PaymentInfo,
  type ProductId,
  type Quantity,
  type ShippingAddress,
  type UserId,
} from './types';

/**
 * Service error types
 */
export interface ServiceError {
  code:
    | 'VALIDATION'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'INSUFFICIENT_STOCK'
    | 'INVALID_STATUS_TRANSITION'
    | 'INTERNAL';
  message: string;
  details?: unknown;
}

/**
 * Order service interface
 */
export interface IOrderService {
  // Query operations
  getOrderById(id: string): Promise<Result<OrderViewModel | null, ServiceError>>;
  getOrderByNumber(orderNumber: string): Promise<Result<OrderViewModel | null, ServiceError>>;
  getOrdersByUser(
    userId: string,
    filter?: Omit<OrderFilter, 'userId'>,
    pagination?: Pagination,
    sorting?: OrderSort
  ): Promise<Result<PaginatedResult<OrderViewModel>, ServiceError>>;
  getAllOrders(
    filter?: OrderFilter,
    pagination?: Pagination,
    sorting?: OrderSort
  ): Promise<Result<PaginatedResult<OrderViewModel>, ServiceError>>;
  getOrderStatistics(
    userId?: string,
    fromDate?: Date,
    toDate?: Date
  ): Promise<Result<OrderStatistics, ServiceError>>;
  getUserOrderHistory(
    userId: string,
    limit?: number,
    includeDetails?: boolean
  ): Promise<Result<UserOrderHistory, ServiceError>>;

  // Command operations
  createOrder(
    input: CreateOrderInput,
    metadata?: CommandMetadata
  ): Promise<Result<OrderViewModel, ServiceError>>;
  updateOrderStatus(
    id: string,
    newStatus: OrderStatus,
    updatedBy: string,
    reason?: string,
    metadata?: CommandMetadata
  ): Promise<Result<OrderViewModel, ServiceError>>;
  cancelOrder(
    id: string,
    cancelledBy: string,
    reason: string,
    refundAmount?: number,
    metadata?: CommandMetadata
  ): Promise<Result<OrderViewModel, ServiceError>>;
  markAsShipped(
    id: string,
    input: MarkAsShippedInput,
    metadata?: CommandMetadata
  ): Promise<Result<OrderViewModel, ServiceError>>;
  markAsDelivered(
    id: string,
    input: MarkAsDeliveredInput,
    metadata?: CommandMetadata
  ): Promise<Result<OrderViewModel, ServiceError>>;
  processRefund(
    id: string,
    input: ProcessRefundInput,
    metadata?: CommandMetadata
  ): Promise<Result<OrderViewModel, ServiceError>>;
  updateShippingAddress(
    id: string,
    shippingAddress: ShippingAddress,
    updatedBy: string,
    metadata?: CommandMetadata
  ): Promise<Result<OrderViewModel, ServiceError>>;
}

// Input types
export interface CreateOrderInput {
  userId: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
  }>;
  shippingAddress: ShippingAddress;
  paymentMethod: PaymentInfo['method'];
  notes?: string;
}

export interface MarkAsShippedInput {
  carrier: string;
  trackingNumber: string;
  shippedBy: string;
  shippedAt?: Date;
  estimatedDeliveryDate?: Date;
}

export interface MarkAsDeliveredInput {
  deliveredBy: string;
  deliveredAt?: Date;
  recipientName?: string;
  deliveryNotes?: string;
}

export interface ProcessRefundInput {
  refundAmount: number;
  reason: string;
  processedBy: string;
  refundItems?: Array<{
    productId: string;
    quantity: number;
  }>;
}

/**
 * Order service implementation with Result pattern
 */
export class OrderService implements IOrderService {
  private readonly commandBus: OrderCommandBus;
  private readonly queryBus: OrderQueryBus;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
    private readonly pubsubService: PubSubService
  ) {
    const pubsub = pubsubService.getPubSub();
    this.commandBus = new OrderCommandBus(prisma, cacheService, pubsub);
    this.queryBus = new OrderQueryBus(prisma, cacheService);
  }

  /**
   * Get order by ID
   */
  async getOrderById(id: string): Promise<Result<OrderViewModel | null, ServiceError>> {
    try {
      const orderIdResult = createOrderId(id);
      if (isErr(orderIdResult)) {
        return err({
          code: 'VALIDATION',
          message: orderIderror,
          details: { field: 'id' },
        });
      }

      const query = createQuery.getOrderById(orderIdResult.data);
      const result = await this.queryBus.execute(query);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      return ok(result.data.data);
    } catch (error) {
      console.error('GetOrderById failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to get order',
        details: error,
      });
    }
  }

  /**
   * Get order by order number
   */
  async getOrderByNumber(
    orderNumber: string
  ): Promise<Result<OrderViewModel | null, ServiceError>> {
    try {
      const orderNumberResult = createOrderNumber(orderNumber);
      if (isErr(orderNumberResult)) {
        return err({
          code: 'VALIDATION',
          message: orderNumbererror,
          details: { field: 'orderNumber' },
        });
      }

      const query = createQuery.getOrderByNumber(orderNumberResult.data);
      const result = await this.queryBus.execute(query);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      return ok(result.data.data);
    } catch (error) {
      console.error('GetOrderByNumber failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to get order by number',
        details: error,
      });
    }
  }

  /**
   * Get orders by user
   */
  async getOrdersByUser(
    userId: string,
    filter?: Omit<OrderFilter, 'userId'>,
    pagination?: Pagination,
    sorting?: OrderSort
  ): Promise<Result<PaginatedResult<OrderViewModel>, ServiceError>> {
    try {
      const query = createQuery.getOrdersByUser({
        userId: userId as UserId,
        filter,
        pagination,
        sorting,
      });
      const result = await this.queryBus.execute(query);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      return ok(result.data.data as PaginatedResult<OrderViewModel>);
    } catch (error) {
      console.error('GetOrdersByUser failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to get orders by user',
        details: error,
      });
    }
  }

  /**
   * Get all orders with filtering and pagination
   */
  async getAllOrders(
    filter?: OrderFilter,
    pagination?: Pagination,
    sorting?: OrderSort
  ): Promise<Result<PaginatedResult<OrderViewModel>, ServiceError>> {
    try {
      const query = createQuery.getAllOrders({ filter, pagination, sorting });
      const result = await this.queryBus.execute(query);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      return ok(result.data.data as PaginatedResult<OrderViewModel>);
    } catch (error) {
      console.error('GetAllOrders failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to get orders',
        details: error,
      });
    }
  }

  /**
   * Get order statistics
   */
  async getOrderStatistics(
    userId?: string,
    fromDate?: Date,
    toDate?: Date
  ): Promise<Result<OrderStatistics, ServiceError>> {
    try {
      const query = createQuery.getOrderStatistics({
        userId: userId as UserId | undefined,
        fromDate,
        toDate,
      });
      const result = await this.queryBus.execute(query);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      return ok(result.data.data as OrderStatistics);
    } catch (error) {
      console.error('GetOrderStatistics failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to get order statistics',
        details: error,
      });
    }
  }

  /**
   * Get user order history
   */
  async getUserOrderHistory(
    userId: string,
    limit?: number,
    includeDetails?: boolean
  ): Promise<Result<UserOrderHistory, ServiceError>> {
    try {
      const query = createQuery.getUserOrderHistory({
        userId: userId as UserId,
        limit,
        includeDetails,
      });
      const result = await this.queryBus.execute(query);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      return ok(result.data.data as UserOrderHistory);
    } catch (error) {
      console.error('GetUserOrderHistory failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to get user order history',
        details: error,
      });
    }
  }

  /**
   * Create a new order
   */
  async createOrder(
    input: CreateOrderInput,
    metadata?: CommandMetadata
  ): Promise<Result<OrderViewModel, ServiceError>> {
    try {
      // Validate inputs
      const validations = await this.validateCreateOrderInput(input);
      if (isErr(validations)) {
        return validations;
      }

      const { orderId, items, totalAmount } = validations.data;

      // Check product availability (in real implementation, would check inventory service)
      for (const item of items) {
        const product = await this.prisma.product.findUnique({
          where: { id: item.productId },
          select: { stock: true, isActive: true },
        });

        if (!product || !product.isActive) {
          return err({
            code: 'NOT_FOUND',
            message: `Product ${item.productId} not found or inactive`,
            details: { productId: item.productId },
          });
        }

        if (product.stock < item.quantity) {
          return err({
            code: 'INSUFFICIENT_STOCK',
            message: `Insufficient stock for product ${item.productId}`,
            details: {
              productId: item.productId,
              available: product.stock,
              requested: item.quantity,
            },
          });
        }
      }

      // Create order command
      const command = createCommand.createOrder(
        orderId,
        {
          userId: input.userId,
          items: input.items,
          shippingAddress: input.shippingAddress,
          paymentMethod: input.paymentMethod,
          notes: input.notes,
        },
        metadata
      );

      const result = await this.commandBus.execute(command);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      // Get created order
      const orderResult = await this.getOrderById(orderId);
      if (isErr(orderResult) || !orderResult.data) {
        return err({
          code: 'INTERNAL',
          message: 'Failed to retrieve created order',
        });
      }

      return ok(orderResult.data);
    } catch (error) {
      console.error('CreateOrder failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to create order',
        details: error,
      });
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    id: string,
    newStatus: OrderStatus,
    updatedBy: string,
    reason?: string,
    metadata?: CommandMetadata
  ): Promise<Result<OrderViewModel, ServiceError>> {
    try {
      const orderIdResult = createOrderId(id);
      if (isErr(orderIdResult)) {
        return err({
          code: 'VALIDATION',
          message: orderIderror,
          details: { field: 'id' },
        });
      }

      // Check if order exists and get current status
      const existingOrder = await this.prisma.order.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!existingOrder) {
        return err({
          code: 'NOT_FOUND',
          message: 'Order not found',
          details: { id },
        });
      }

      // Validate status transition
      if (!canTransitionStatus(existingOrder.status as OrderStatus, newStatus)) {
        return err({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot transition from ${existingOrder.status} to ${newStatus}`,
          details: {
            currentStatus: existingOrder.status,
            requestedStatus: newStatus,
          },
        });
      }

      // Create command
      const command = createCommand.updateOrderStatus(
        orderIdResult.data,
        { newStatus, updatedBy, reason },
        metadata
      );

      const result = await this.commandBus.execute(command);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      // Get updated order
      const orderResult = await this.getOrderById(id);
      if (isErr(orderResult) || !orderResult.data) {
        return err({
          code: 'INTERNAL',
          message: 'Failed to retrieve updated order',
        });
      }

      return ok(orderResult.data);
    } catch (error) {
      console.error('UpdateOrderStatus failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to update order status',
        details: error,
      });
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(
    id: string,
    cancelledBy: string,
    reason: string,
    refundAmount?: number,
    metadata?: CommandMetadata
  ): Promise<Result<OrderViewModel, ServiceError>> {
    try {
      const orderIdResult = createOrderId(id);
      if (isErr(orderIdResult)) {
        return err({
          code: 'VALIDATION',
          message: orderIderror,
          details: { field: 'id' },
        });
      }

      // Check if order exists and can be cancelled
      const existingOrder = await this.prisma.order.findUnique({
        where: { id },
        select: { status: true, totalAmount: true },
      });

      if (!existingOrder) {
        return err({
          code: 'NOT_FOUND',
          message: 'Order not found',
          details: { id },
        });
      }

      if (!canTransitionStatus(existingOrder.status as OrderStatus, 'CANCELLED')) {
        return err({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot cancel order in ${existingOrder.status} status`,
          details: { currentStatus: existingOrder.status },
        });
      }

      // Create command
      const command = createCommand.cancelOrder(
        orderIdResult.data,
        { reason, cancelledBy, refundAmount },
        metadata
      );

      const result = await this.commandBus.execute(command);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      // Get updated order
      const orderResult = await this.getOrderById(id);
      if (isErr(orderResult) || !orderResult.data) {
        return err({
          code: 'INTERNAL',
          message: 'Failed to retrieve cancelled order',
        });
      }

      return ok(orderResult.data);
    } catch (error) {
      console.error('CancelOrder failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to cancel order',
        details: error,
      });
    }
  }

  /**
   * Mark order as shipped
   */
  async markAsShipped(
    id: string,
    input: MarkAsShippedInput,
    metadata?: CommandMetadata
  ): Promise<Result<OrderViewModel, ServiceError>> {
    try {
      const orderIdResult = createOrderId(id);
      if (isErr(orderIdResult)) {
        return err({
          code: 'VALIDATION',
          message: orderIderror,
          details: { field: 'id' },
        });
      }

      const trackingNumberResult = createTrackingNumber(input.trackingNumber);
      if (isErr(trackingNumberResult)) {
        return err({
          code: 'VALIDATION',
          message: trackingNumbererror,
          details: { field: 'trackingNumber' },
        });
      }

      // Check if order exists and can be shipped
      const existingOrder = await this.prisma.order.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!existingOrder) {
        return err({
          code: 'NOT_FOUND',
          message: 'Order not found',
          details: { id },
        });
      }

      if (!canTransitionStatus(existingOrder.status as OrderStatus, 'SHIPPED')) {
        return err({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot ship order in ${existingOrder.status} status`,
          details: { currentStatus: existingOrder.status },
        });
      }

      // Create command
      const command = createCommand.markAsShipped(
        orderIdResult.data,
        {
          carrier: input.carrier,
          trackingNumber: input.trackingNumber,
          shippedBy: input.shippedBy,
          shippedAt: input.shippedAt,
          estimatedDeliveryDate: input.estimatedDeliveryDate,
        },
        metadata
      );

      const result = await this.commandBus.execute(command);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      // Get updated order
      const orderResult = await this.getOrderById(id);
      if (isErr(orderResult) || !orderResult.data) {
        return err({
          code: 'INTERNAL',
          message: 'Failed to retrieve shipped order',
        });
      }

      return ok(orderResult.data);
    } catch (error) {
      console.error('MarkAsShipped failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to mark order as shipped',
        details: error,
      });
    }
  }

  /**
   * Mark order as delivered
   */
  async markAsDelivered(
    id: string,
    input: MarkAsDeliveredInput,
    metadata?: CommandMetadata
  ): Promise<Result<OrderViewModel, ServiceError>> {
    try {
      const orderIdResult = createOrderId(id);
      if (isErr(orderIdResult)) {
        return err({
          code: 'VALIDATION',
          message: orderIderror,
          details: { field: 'id' },
        });
      }

      // Check if order exists and can be delivered
      const existingOrder = await this.prisma.order.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!existingOrder) {
        return err({
          code: 'NOT_FOUND',
          message: 'Order not found',
          details: { id },
        });
      }

      if (!canTransitionStatus(existingOrder.status as OrderStatus, 'DELIVERED')) {
        return err({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot deliver order in ${existingOrder.status} status`,
          details: { currentStatus: existingOrder.status },
        });
      }

      // Create command
      const command = createCommand.markAsDelivered(
        orderIdResult.data,
        {
          deliveredBy: input.deliveredBy,
          deliveredAt: input.deliveredAt,
          recipientName: input.recipientName,
          deliveryNotes: input.deliveryNotes,
        },
        metadata
      );

      const result = await this.commandBus.execute(command);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      // Get updated order
      const orderResult = await this.getOrderById(id);
      if (isErr(orderResult) || !orderResult.data) {
        return err({
          code: 'INTERNAL',
          message: 'Failed to retrieve delivered order',
        });
      }

      return ok(orderResult.data);
    } catch (error) {
      console.error('MarkAsDelivered failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to mark order as delivered',
        details: error,
      });
    }
  }

  /**
   * Process refund for an order
   */
  async processRefund(
    id: string,
    input: ProcessRefundInput,
    metadata?: CommandMetadata
  ): Promise<Result<OrderViewModel, ServiceError>> {
    try {
      const orderIdResult = createOrderId(id);
      if (isErr(orderIdResult)) {
        return err({
          code: 'VALIDATION',
          message: orderIderror,
          details: { field: 'id' },
        });
      }

      const refundAmountResult = createAmount(input.refundAmount);
      if (isErr(refundAmountResult)) {
        return err({
          code: 'VALIDATION',
          message: refundAmounterror,
          details: { field: 'refundAmount' },
        });
      }

      // Check if order exists and can be refunded
      const existingOrder = await this.prisma.order.findUnique({
        where: { id },
        select: { status: true, totalAmount: true },
      });

      if (!existingOrder) {
        return err({
          code: 'NOT_FOUND',
          message: 'Order not found',
          details: { id },
        });
      }

      if (!canTransitionStatus(existingOrder.status as OrderStatus, 'REFUNDED')) {
        return err({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot refund order in ${existingOrder.status} status`,
          details: { currentStatus: existingOrder.status },
        });
      }

      if (input.refundAmount > existingOrder.totalAmount) {
        return err({
          code: 'VALIDATION',
          message: 'Refund amount exceeds order total',
          details: {
            refundAmount: input.refundAmount,
            orderTotal: existingOrder.totalAmount,
          },
        });
      }

      // Create command
      const command = createCommand.processRefund(
        orderIdResult.data,
        {
          refundAmount: input.refundAmount,
          reason: input.reason,
          processedBy: input.processedBy,
          refundItems: input.refundItems,
        },
        metadata
      );

      const result = await this.commandBus.execute(command);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      // Get updated order
      const orderResult = await this.getOrderById(id);
      if (isErr(orderResult) || !orderResult.data) {
        return err({
          code: 'INTERNAL',
          message: 'Failed to retrieve refunded order',
        });
      }

      return ok(orderResult.data);
    } catch (error) {
      console.error('ProcessRefund failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to process refund',
        details: error,
      });
    }
  }

  /**
   * Update shipping address
   */
  async updateShippingAddress(
    id: string,
    shippingAddress: ShippingAddress,
    updatedBy: string,
    metadata?: CommandMetadata
  ): Promise<Result<OrderViewModel, ServiceError>> {
    try {
      const orderIdResult = createOrderId(id);
      if (isErr(orderIdResult)) {
        return err({
          code: 'VALIDATION',
          message: orderIderror,
          details: { field: 'id' },
        });
      }

      // Check if order exists and address can be updated
      const existingOrder = await this.prisma.order.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!existingOrder) {
        return err({
          code: 'NOT_FOUND',
          message: 'Order not found',
          details: { id },
        });
      }

      // Can only update address before shipping
      if (['SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].includes(existingOrder.status)) {
        return err({
          code: 'VALIDATION',
          message: `Cannot update shipping address for order in ${existingOrder.status} status`,
          details: { currentStatus: existingOrder.status },
        });
      }

      // Create command
      const command = createCommand.updateShippingAddress(
        orderIdResult.data,
        { shippingAddress, updatedBy },
        metadata
      );

      const result = await this.commandBus.execute(command);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      // Get updated order
      const orderResult = await this.getOrderById(id);
      if (isErr(orderResult) || !orderResult.data) {
        return err({
          code: 'INTERNAL',
          message: 'Failed to retrieve updated order',
        });
      }

      return ok(orderResult.data);
    } catch (error) {
      console.error('UpdateShippingAddress failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to update shipping address',
        details: error,
      });
    }
  }

  /**
   * Validate create order input
   */
  private async validateCreateOrderInput(input: CreateOrderInput): Promise<
    Result<
      {
        orderId: OrderId;
        items: OrderItem[];
        totalAmount: Amount;
      },
      ServiceError
    >
  > {
    const orderId = crypto.randomUUID() as OrderId;
    const validatedItems: OrderItem[] = [];
    let totalAmount = 0;

    // Validate items
    if (input.items.length === 0) {
      return err({
        code: 'VALIDATION',
        message: 'Order must have at least one item',
        details: { field: 'items' },
      });
    }

    for (const item of input.items) {
      const quantityResult = createQuantity(item.quantity);
      if (isErr(quantityResult)) {
        return err({
          code: 'VALIDATION',
          message: quantityerror,
          details: { field: 'quantity', productId: item.productId },
        });
      }

      const priceResult = createAmount(item.unitPrice);
      if (isErr(priceResult)) {
        return err({
          code: 'VALIDATION',
          message: priceerror,
          details: { field: 'unitPrice', productId: item.productId },
        });
      }

      const itemTotal = item.quantity * item.unitPrice;
      const itemTotalResult = createAmount(itemTotal);
      if (isErr(itemTotalResult)) {
        return err({
          code: 'VALIDATION',
          message: 'Invalid item total amount',
          details: { productId: item.productId },
        });
      }

      validatedItems.push({
        productId: item.productId as ProductId,
        quantity: quantityResult.data,
        unitPrice: priceResult.data,
        totalPrice: itemTotalResult.data,
      });

      totalAmount += itemTotal;
    }

    const totalAmountResult = createAmount(totalAmount);
    if (isErr(totalAmountResult)) {
      return err({
        code: 'VALIDATION',
        message: 'Invalid total amount',
        details: { totalAmount },
      });
    }

    return ok({
      orderId,
      items: validatedItems,
      totalAmount: totalAmountResult.data,
    });
  }
}
