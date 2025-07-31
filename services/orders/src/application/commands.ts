import { z } from 'zod';
import type {
  CommandMetadata,
  OrderId,
  OrderNumber,
  OrderStatus,
  PaymentInfo,
  Result,
  ShippingAddress,
} from './types';

/**
 * Command type literals
 */
export const CommandType = {
  CREATE_ORDER: 'CreateOrder',
  UPDATE_ORDER_STATUS: 'UpdateOrderStatus',
  CANCEL_ORDER: 'CancelOrder',
  UPDATE_SHIPPING_INFO: 'UpdateShippingInfo',
  UPDATE_PAYMENT_INFO: 'UpdatePaymentInfo',
  ADD_ORDER_ITEM: 'AddOrderItem',
  REMOVE_ORDER_ITEM: 'RemoveOrderItem',
  UPDATE_ORDER_ITEM_QUANTITY: 'UpdateOrderItemQuantity',
  APPLY_DISCOUNT: 'ApplyDiscount',
  PROCESS_REFUND: 'ProcessRefund',
  UPDATE_SHIPPING_ADDRESS: 'UpdateShippingAddress',
  MARK_AS_SHIPPED: 'MarkAsShipped',
  MARK_AS_DELIVERED: 'MarkAsDelivered',
} as const;

export type CommandType = (typeof CommandType)[keyof typeof CommandType];

/**
 * Command payloads
 */
export interface CreateOrderPayload {
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

export interface UpdateOrderStatusPayload {
  newStatus: OrderStatus;
  reason?: string;
  updatedBy: string;
}

export interface CancelOrderPayload {
  reason: string;
  cancelledBy: string;
  refundAmount?: number;
}

export interface UpdateShippingInfoPayload {
  carrier?: string;
  trackingNumber?: string;
  estimatedDeliveryDate?: Date;
  shippedAt?: Date;
}

export interface UpdatePaymentInfoPayload {
  status: PaymentInfo['status'];
  transactionId?: string;
  paidAt?: Date;
  failureReason?: string;
}

export interface AddOrderItemPayload {
  productId: string;
  quantity: number;
  unitPrice: number;
  addedBy: string;
}

export interface RemoveOrderItemPayload {
  productId: string;
  removedBy: string;
  reason?: string;
}

export interface UpdateOrderItemQuantityPayload {
  productId: string;
  newQuantity: number;
  updatedBy: string;
}

export interface ApplyDiscountPayload {
  discountAmount: number;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountCode?: string;
  appliedBy: string;
}

export interface ProcessRefundPayload {
  refundAmount: number;
  reason: string;
  processedBy: string;
  refundItems?: Array<{
    productId: string;
    quantity: number;
  }>;
}

export interface UpdateShippingAddressPayload {
  shippingAddress: ShippingAddress;
  updatedBy: string;
}

export interface MarkAsShippedPayload {
  carrier: string;
  trackingNumber: string;
  shippedAt?: Date;
  estimatedDeliveryDate?: Date;
  shippedBy: string;
}

export interface MarkAsDeliveredPayload {
  deliveredAt?: Date;
  deliveredBy: string;
  recipientName?: string;
  deliveryNotes?: string;
}

/**
 * Base command structure
 */
export interface BaseCommand<TType extends CommandType, TPayload> {
  readonly type: TType;
  readonly orderId: OrderId;
  readonly payload: TPayload;
  readonly metadata?: CommandMetadata;
}

/**
 * Command type definitions using discriminated unions
 */
export type CreateOrderCommand = BaseCommand<
  typeof CommandType.CREATE_ORDER,
  CreateOrderPayload
> & {
  orderId: OrderId; // New order ID
};
export type UpdateOrderStatusCommand = BaseCommand<
  typeof CommandType.UPDATE_ORDER_STATUS,
  UpdateOrderStatusPayload
>;
export type CancelOrderCommand = BaseCommand<typeof CommandType.CANCEL_ORDER, CancelOrderPayload>;
export type UpdateShippingInfoCommand = BaseCommand<
  typeof CommandType.UPDATE_SHIPPING_INFO,
  UpdateShippingInfoPayload
>;
export type UpdatePaymentInfoCommand = BaseCommand<
  typeof CommandType.UPDATE_PAYMENT_INFO,
  UpdatePaymentInfoPayload
>;
export type AddOrderItemCommand = BaseCommand<
  typeof CommandType.ADD_ORDER_ITEM,
  AddOrderItemPayload
>;
export type RemoveOrderItemCommand = BaseCommand<
  typeof CommandType.REMOVE_ORDER_ITEM,
  RemoveOrderItemPayload
>;
export type UpdateOrderItemQuantityCommand = BaseCommand<
  typeof CommandType.UPDATE_ORDER_ITEM_QUANTITY,
  UpdateOrderItemQuantityPayload
>;
export type ApplyDiscountCommand = BaseCommand<
  typeof CommandType.APPLY_DISCOUNT,
  ApplyDiscountPayload
>;
export type ProcessRefundCommand = BaseCommand<
  typeof CommandType.PROCESS_REFUND,
  ProcessRefundPayload
>;
export type UpdateShippingAddressCommand = BaseCommand<
  typeof CommandType.UPDATE_SHIPPING_ADDRESS,
  UpdateShippingAddressPayload
>;
export type MarkAsShippedCommand = BaseCommand<
  typeof CommandType.MARK_AS_SHIPPED,
  MarkAsShippedPayload
>;
export type MarkAsDeliveredCommand = BaseCommand<
  typeof CommandType.MARK_AS_DELIVERED,
  MarkAsDeliveredPayload
>;

/**
 * Union type for all order commands
 */
export type OrderCommand =
  | CreateOrderCommand
  | UpdateOrderStatusCommand
  | CancelOrderCommand
  | UpdateShippingInfoCommand
  | UpdatePaymentInfoCommand
  | AddOrderItemCommand
  | RemoveOrderItemCommand
  | UpdateOrderItemQuantityCommand
  | ApplyDiscountCommand
  | ProcessRefundCommand
  | UpdateShippingAddressCommand
  | MarkAsShippedCommand
  | MarkAsDeliveredCommand;

/**
 * Command validation schemas
 */
const shippingAddressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  country: z.string().min(1),
  postalCode: z.string().min(1),
  recipientName: z.string().optional(),
  phoneNumber: z.string().optional(),
});

export const createOrderCommandSchema = z.object({
  type: z.literal(CommandType.CREATE_ORDER),
  orderId: z.string().uuid(),
  payload: z.object({
    userId: z.string().uuid(),
    items: z
      .array(
        z.object({
          productId: z.string().uuid(),
          quantity: z.number().int().positive(),
          unitPrice: z.number().min(0).finite(),
        })
      )
      .min(1),
    shippingAddress: shippingAddressSchema,
    paymentMethod: z.enum([
      'CREDIT_CARD',
      'DEBIT_CARD',
      'PAYPAL',
      'BANK_TRANSFER',
      'CASH_ON_DELIVERY',
    ]),
    notes: z.string().optional(),
  }),
  metadata: z.any().optional(),
});

export const updateOrderStatusCommandSchema = z.object({
  type: z.literal(CommandType.UPDATE_ORDER_STATUS),
  orderId: z.string().uuid(),
  payload: z.object({
    newStatus: z.enum([
      'PENDING',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
      'REFUNDED',
    ]),
    reason: z.string().optional(),
    updatedBy: z.string(),
  }),
  metadata: z.any().optional(),
});

export const cancelOrderCommandSchema = z.object({
  type: z.literal(CommandType.CANCEL_ORDER),
  orderId: z.string().uuid(),
  payload: z.object({
    reason: z.string().min(1),
    cancelledBy: z.string(),
    refundAmount: z.number().min(0).optional(),
  }),
  metadata: z.any().optional(),
});

export const updateShippingInfoCommandSchema = z.object({
  type: z.literal(CommandType.UPDATE_SHIPPING_INFO),
  orderId: z.string().uuid(),
  payload: z.object({
    carrier: z.string().optional(),
    trackingNumber: z.string().optional(),
    estimatedDeliveryDate: z.date().optional(),
    shippedAt: z.date().optional(),
  }),
  metadata: z.any().optional(),
});

export const updatePaymentInfoCommandSchema = z.object({
  type: z.literal(CommandType.UPDATE_PAYMENT_INFO),
  orderId: z.string().uuid(),
  payload: z.object({
    status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED']),
    transactionId: z.string().optional(),
    paidAt: z.date().optional(),
    failureReason: z.string().optional(),
  }),
  metadata: z.any().optional(),
});

export const addOrderItemCommandSchema = z.object({
  type: z.literal(CommandType.ADD_ORDER_ITEM),
  orderId: z.string().uuid(),
  payload: z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().min(0).finite(),
    addedBy: z.string(),
  }),
  metadata: z.any().optional(),
});

export const removeOrderItemCommandSchema = z.object({
  type: z.literal(CommandType.REMOVE_ORDER_ITEM),
  orderId: z.string().uuid(),
  payload: z.object({
    productId: z.string().uuid(),
    removedBy: z.string(),
    reason: z.string().optional(),
  }),
  metadata: z.any().optional(),
});

export const updateOrderItemQuantityCommandSchema = z.object({
  type: z.literal(CommandType.UPDATE_ORDER_ITEM_QUANTITY),
  orderId: z.string().uuid(),
  payload: z.object({
    productId: z.string().uuid(),
    newQuantity: z.number().int().positive(),
    updatedBy: z.string(),
  }),
  metadata: z.any().optional(),
});

export const applyDiscountCommandSchema = z.object({
  type: z.literal(CommandType.APPLY_DISCOUNT),
  orderId: z.string().uuid(),
  payload: z.object({
    discountAmount: z.number().min(0).finite(),
    discountType: z.enum(['PERCENTAGE', 'FIXED']),
    discountCode: z.string().optional(),
    appliedBy: z.string(),
  }),
  metadata: z.any().optional(),
});

export const processRefundCommandSchema = z.object({
  type: z.literal(CommandType.PROCESS_REFUND),
  orderId: z.string().uuid(),
  payload: z.object({
    refundAmount: z.number().min(0).finite(),
    reason: z.string().min(1),
    processedBy: z.string(),
    refundItems: z
      .array(
        z.object({
          productId: z.string().uuid(),
          quantity: z.number().int().positive(),
        })
      )
      .optional(),
  }),
  metadata: z.any().optional(),
});

export const updateShippingAddressCommandSchema = z.object({
  type: z.literal(CommandType.UPDATE_SHIPPING_ADDRESS),
  orderId: z.string().uuid(),
  payload: z.object({
    shippingAddress: shippingAddressSchema,
    updatedBy: z.string(),
  }),
  metadata: z.any().optional(),
});

export const markAsShippedCommandSchema = z.object({
  type: z.literal(CommandType.MARK_AS_SHIPPED),
  orderId: z.string().uuid(),
  payload: z.object({
    carrier: z.string().min(1),
    trackingNumber: z.string().min(1),
    shippedAt: z.date().optional(),
    estimatedDeliveryDate: z.date().optional(),
    shippedBy: z.string(),
  }),
  metadata: z.any().optional(),
});

export const markAsDeliveredCommandSchema = z.object({
  type: z.literal(CommandType.MARK_AS_DELIVERED),
  orderId: z.string().uuid(),
  payload: z.object({
    deliveredAt: z.date().optional(),
    deliveredBy: z.string(),
    recipientName: z.string().optional(),
    deliveryNotes: z.string().optional(),
  }),
  metadata: z.any().optional(),
});

/**
 * Command validation schema map
 */
export const commandSchemas = {
  [CommandType.CREATE_ORDER]: createOrderCommandSchema,
  [CommandType.UPDATE_ORDER_STATUS]: updateOrderStatusCommandSchema,
  [CommandType.CANCEL_ORDER]: cancelOrderCommandSchema,
  [CommandType.UPDATE_SHIPPING_INFO]: updateShippingInfoCommandSchema,
  [CommandType.UPDATE_PAYMENT_INFO]: updatePaymentInfoCommandSchema,
  [CommandType.ADD_ORDER_ITEM]: addOrderItemCommandSchema,
  [CommandType.REMOVE_ORDER_ITEM]: removeOrderItemCommandSchema,
  [CommandType.UPDATE_ORDER_ITEM_QUANTITY]: updateOrderItemQuantityCommandSchema,
  [CommandType.APPLY_DISCOUNT]: applyDiscountCommandSchema,
  [CommandType.PROCESS_REFUND]: processRefundCommandSchema,
  [CommandType.UPDATE_SHIPPING_ADDRESS]: updateShippingAddressCommandSchema,
  [CommandType.MARK_AS_SHIPPED]: markAsShippedCommandSchema,
  [CommandType.MARK_AS_DELIVERED]: markAsDeliveredCommandSchema,
} as const;

/**
 * Type helper to get command from type
 */
export type CommandFromType<T extends CommandType> = Extract<OrderCommand, { type: T }>;

/**
 * Type-safe command validation
 */
export function validateCommand<T extends OrderCommand>(command: T): T {
  const schema = commandSchemas[command.type];
  if (!schema) {
    throw new Error(`Unknown command type: ${command.type}`);
  }

  const result = schema.safeParse(command);

  if (!result.success) {
    const messages = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Command validation failed: ${messages}`);
  }

  return result.data as T;
}

/**
 * Command factory functions for type-safe creation
 */
export const createCommand = {
  createOrder: (
    orderId: OrderId,
    payload: CreateOrderPayload,
    metadata?: CommandMetadata
  ): CreateOrderCommand => ({
    type: CommandType.CREATE_ORDER,
    orderId,
    payload,
    metadata,
  }),

  updateOrderStatus: (
    orderId: OrderId,
    payload: UpdateOrderStatusPayload,
    metadata?: CommandMetadata
  ): UpdateOrderStatusCommand => ({
    type: CommandType.UPDATE_ORDER_STATUS,
    orderId,
    payload,
    metadata,
  }),

  cancelOrder: (
    orderId: OrderId,
    payload: CancelOrderPayload,
    metadata?: CommandMetadata
  ): CancelOrderCommand => ({
    type: CommandType.CANCEL_ORDER,
    orderId,
    payload,
    metadata,
  }),

  updateShippingInfo: (
    orderId: OrderId,
    payload: UpdateShippingInfoPayload,
    metadata?: CommandMetadata
  ): UpdateShippingInfoCommand => ({
    type: CommandType.UPDATE_SHIPPING_INFO,
    orderId,
    payload,
    metadata,
  }),

  updatePaymentInfo: (
    orderId: OrderId,
    payload: UpdatePaymentInfoPayload,
    metadata?: CommandMetadata
  ): UpdatePaymentInfoCommand => ({
    type: CommandType.UPDATE_PAYMENT_INFO,
    orderId,
    payload,
    metadata,
  }),

  addOrderItem: (
    orderId: OrderId,
    payload: AddOrderItemPayload,
    metadata?: CommandMetadata
  ): AddOrderItemCommand => ({
    type: CommandType.ADD_ORDER_ITEM,
    orderId,
    payload,
    metadata,
  }),

  removeOrderItem: (
    orderId: OrderId,
    payload: RemoveOrderItemPayload,
    metadata?: CommandMetadata
  ): RemoveOrderItemCommand => ({
    type: CommandType.REMOVE_ORDER_ITEM,
    orderId,
    payload,
    metadata,
  }),

  updateOrderItemQuantity: (
    orderId: OrderId,
    payload: UpdateOrderItemQuantityPayload,
    metadata?: CommandMetadata
  ): UpdateOrderItemQuantityCommand => ({
    type: CommandType.UPDATE_ORDER_ITEM_QUANTITY,
    orderId,
    payload,
    metadata,
  }),

  applyDiscount: (
    orderId: OrderId,
    payload: ApplyDiscountPayload,
    metadata?: CommandMetadata
  ): ApplyDiscountCommand => ({
    type: CommandType.APPLY_DISCOUNT,
    orderId,
    payload,
    metadata,
  }),

  processRefund: (
    orderId: OrderId,
    payload: ProcessRefundPayload,
    metadata?: CommandMetadata
  ): ProcessRefundCommand => ({
    type: CommandType.PROCESS_REFUND,
    orderId,
    payload,
    metadata,
  }),

  updateShippingAddress: (
    orderId: OrderId,
    payload: UpdateShippingAddressPayload,
    metadata?: CommandMetadata
  ): UpdateShippingAddressCommand => ({
    type: CommandType.UPDATE_SHIPPING_ADDRESS,
    orderId,
    payload,
    metadata,
  }),

  markAsShipped: (
    orderId: OrderId,
    payload: MarkAsShippedPayload,
    metadata?: CommandMetadata
  ): MarkAsShippedCommand => ({
    type: CommandType.MARK_AS_SHIPPED,
    orderId,
    payload,
    metadata,
  }),

  markAsDelivered: (
    orderId: OrderId,
    payload: MarkAsDeliveredPayload,
    metadata?: CommandMetadata
  ): MarkAsDeliveredCommand => ({
    type: CommandType.MARK_AS_DELIVERED,
    orderId,
    payload,
    metadata,
  }),
} as const;

/**
 * Command result with proper error types
 */
export type CommandResult = Result<
  {
    orderId: OrderId;
    orderNumber: OrderNumber;
    success: true;
    updatedFields?: string[];
  },
  {
    code:
      | 'VALIDATION_ERROR'
      | 'NOT_FOUND'
      | 'BUSINESS_RULE_VIOLATION'
      | 'INTERNAL_ERROR'
      | 'INVALID_STATUS_TRANSITION'
      | 'INSUFFICIENT_STOCK';
    message: string;
    details?: unknown;
  }
>;

/**
 * Type guard for command types
 */
export const isCommand = {
  createOrder: (command: OrderCommand): command is CreateOrderCommand =>
    command.type === CommandType.CREATE_ORDER,
  updateOrderStatus: (command: OrderCommand): command is UpdateOrderStatusCommand =>
    command.type === CommandType.UPDATE_ORDER_STATUS,
  cancelOrder: (command: OrderCommand): command is CancelOrderCommand =>
    command.type === CommandType.CANCEL_ORDER,
  updateShippingInfo: (command: OrderCommand): command is UpdateShippingInfoCommand =>
    command.type === CommandType.UPDATE_SHIPPING_INFO,
  updatePaymentInfo: (command: OrderCommand): command is UpdatePaymentInfoCommand =>
    command.type === CommandType.UPDATE_PAYMENT_INFO,
  addOrderItem: (command: OrderCommand): command is AddOrderItemCommand =>
    command.type === CommandType.ADD_ORDER_ITEM,
  removeOrderItem: (command: OrderCommand): command is RemoveOrderItemCommand =>
    command.type === CommandType.REMOVE_ORDER_ITEM,
  updateOrderItemQuantity: (command: OrderCommand): command is UpdateOrderItemQuantityCommand =>
    command.type === CommandType.UPDATE_ORDER_ITEM_QUANTITY,
  applyDiscount: (command: OrderCommand): command is ApplyDiscountCommand =>
    command.type === CommandType.APPLY_DISCOUNT,
  processRefund: (command: OrderCommand): command is ProcessRefundCommand =>
    command.type === CommandType.PROCESS_REFUND,
  updateShippingAddress: (command: OrderCommand): command is UpdateShippingAddressCommand =>
    command.type === CommandType.UPDATE_SHIPPING_ADDRESS,
  markAsShipped: (command: OrderCommand): command is MarkAsShippedCommand =>
    command.type === CommandType.MARK_AS_SHIPPED,
  markAsDelivered: (command: OrderCommand): command is MarkAsDeliveredCommand =>
    command.type === CommandType.MARK_AS_DELIVERED,
} as const;
