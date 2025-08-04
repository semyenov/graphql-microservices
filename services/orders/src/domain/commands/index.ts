import type { ICommandMetadata } from '@graphql-microservices/event-sourcing';
import type { ICommand } from '@graphql-microservices/event-sourcing/cqrs';
import { z } from 'zod';

// Base command interface - extends CQRS ICommand
export interface Command<TPayload = unknown> extends ICommand<TPayload> {
  readonly id: string;
  readonly type: string;
  readonly payload: TPayload;
  readonly metadata: ICommandMetadata;
  readonly createdAt: Date;
}

// Command payloads with validation schemas

// Create Order
export const createOrderPayloadSchema = z.object({
  orderNumber: z.string().min(1, 'Order number is required'),
  customerId: z.uuid('Invalid customer ID format'),
  items: z
    .array(
      z.object({
        productId: z.uuid('Invalid product ID format'),
        productName: z.string().min(1, 'Product name is required'),
        productSku: z.string().min(1, 'Product SKU is required'),
        quantity: z.number().int().positive('Quantity must be positive'),
        unitPrice: z.object({
          amount: z.number().positive('Price must be positive'),
          currency: z.string().default('USD'),
        }),
      })
    )
    .min(1, 'Order must have at least one item'),
  shippingAddress: z.object({
    street: z.string().min(1, 'Street is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(1, 'Country is required'),
  }),
  billingAddress: z
    .object({
      street: z.string().min(1, 'Street is required'),
      city: z.string().min(1, 'City is required'),
      state: z.string().min(1, 'State is required'),
      postalCode: z.string().min(1, 'Postal code is required'),
      country: z.string().min(1, 'Country is required'),
    })
    .optional(),
  paymentInfo: z.object({
    method: z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'PAYPAL', 'BANK_TRANSFER']),
    status: z.enum(['pending', 'authorized', 'captured', 'failed']).default('pending'),
    transactionId: z.string().optional(),
    processedAt: z.string().optional(),
  }),
  shippingInfo: z.object({
    method: z.string().min(1, 'Shipping method is required'),
    cost: z.object({
      amount: z.number().min(0, 'Shipping cost must be non-negative'),
      currency: z.string().default('USD'),
    }),
    estimatedDeliveryDate: z.string().optional(),
    trackingNumber: z.string().optional(),
    carrier: z.string().optional(),
  }),
  notes: z.string().optional(),
});

export type CreateOrderPayload = z.infer<typeof createOrderPayloadSchema>;

export interface CreateOrderCommand extends Command<CreateOrderPayload> {
  readonly type: 'CreateOrder';
  readonly payload: CreateOrderPayload;
}

// Cancel Order
export const cancelOrderPayloadSchema = z.object({
  orderId: z.uuid('Invalid order ID format'),
  reason: z.string().min(1, 'Cancellation reason is required'),
  cancelledBy: z.uuid('Invalid user ID format'),
});

export type CancelOrderPayload = z.infer<typeof cancelOrderPayloadSchema>;

export interface CancelOrderCommand extends Command<CancelOrderPayload> {
  readonly type: 'CancelOrder';
  readonly payload: CancelOrderPayload;
}

// Update Order Status
export const updateOrderStatusPayloadSchema = z.object({
  orderId: z.uuid('Invalid order ID format'),
  status: z.enum([
    'PENDING',
    'CONFIRMED',
    'PROCESSING',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'REFUNDED',
  ]),
  updatedBy: z.uuid('Invalid user ID format'),
  notes: z.string().optional(),
});

export type UpdateOrderStatusPayload = z.infer<typeof updateOrderStatusPayloadSchema>;

export interface UpdateOrderStatusCommand extends Command<UpdateOrderStatusPayload> {
  readonly type: 'UpdateOrderStatus';
  readonly payload: UpdateOrderStatusPayload;
}

// Ship Order
export const shipOrderPayloadSchema = z.object({
  orderId: z.uuid('Invalid order ID format'),
  trackingNumber: z.string().min(1, 'Tracking number is required'),
  carrier: z.string().min(1, 'Carrier is required'),
  estimatedDeliveryDate: z.string().datetime('Invalid date format'),
  shippedBy: z.uuid('Invalid user ID format'),
});

export type ShipOrderPayload = z.infer<typeof shipOrderPayloadSchema>;

export interface ShipOrderCommand extends Command<ShipOrderPayload> {
  readonly type: 'ShipOrder';
  readonly payload: ShipOrderPayload;
}

// Add Order Item
export const addOrderItemPayloadSchema = z.object({
  orderId: z.uuid('Invalid order ID format'),
  productId: z.uuid('Invalid product ID format'),
  productName: z.string().min(1, 'Product name is required'),
  productSku: z.string().min(1, 'Product SKU is required'),
  quantity: z.number().int().positive('Quantity must be positive'),
  unitPrice: z.object({
    amount: z.number().positive('Price must be positive'),
    currency: z.string().default('USD'),
  }),
  addedBy: z.uuid('Invalid user ID format'),
});

export type AddOrderItemPayload = z.infer<typeof addOrderItemPayloadSchema>;

export interface AddOrderItemCommand extends Command<AddOrderItemPayload> {
  readonly type: 'AddOrderItem';
  readonly payload: AddOrderItemPayload;
}

// Remove Order Item
export const removeOrderItemPayloadSchema = z.object({
  orderId: z.uuid('Invalid order ID format'),
  productId: z.uuid('Invalid product ID format'),
  removedBy: z.uuid('Invalid user ID format'),
  reason: z.string().optional(),
});

export type RemoveOrderItemPayload = z.infer<typeof removeOrderItemPayloadSchema>;

export interface RemoveOrderItemCommand extends Command<RemoveOrderItemPayload> {
  readonly type: 'RemoveOrderItem';
  readonly payload: RemoveOrderItemPayload;
}

// Update Shipping Address
export const updateShippingAddressPayloadSchema = z.object({
  orderId: z.uuid('Invalid order ID format'),
  address: z.object({
    street: z.string().min(1, 'Street is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(1, 'Country is required'),
  }),
  updatedBy: z.uuid('Invalid user ID format'),
});

export type UpdateShippingAddressPayload = z.infer<typeof updateShippingAddressPayloadSchema>;

export interface UpdateShippingAddressCommand extends Command<UpdateShippingAddressPayload> {
  readonly type: 'UpdateShippingAddress';
  readonly payload: UpdateShippingAddressPayload;
}

// Process Payment
export const processPaymentPayloadSchema = z.object({
  orderId: z.uuid('Invalid order ID format'),
  amount: z.number().positive('Amount must be positive'),
  method: z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'PAYPAL', 'BANK_TRANSFER']),
  transactionId: z.string().min(1, 'Transaction ID is required'),
  processedBy: z.uuid('Invalid user ID format'),
});

export type ProcessPaymentPayload = z.infer<typeof processPaymentPayloadSchema>;

export interface ProcessPaymentCommand extends Command<ProcessPaymentPayload> {
  readonly type: 'ProcessPayment';
  readonly payload: ProcessPaymentPayload;
}

// Refund Order
export const refundOrderPayloadSchema = z.object({
  orderId: z.uuid('Invalid order ID format'),
  amount: z.number().positive('Refund amount must be positive'),
  currency: z.string().default('USD'),
  reason: z.string().min(1, 'Refund reason is required'),
  refundedBy: z.uuid('Invalid user ID format'),
  transactionId: z.string().optional(),
});

export type RefundOrderPayload = z.infer<typeof refundOrderPayloadSchema>;

export interface RefundOrderCommand extends Command<RefundOrderPayload> {
  readonly type: 'RefundOrder';
  readonly payload: RefundOrderPayload;
}

// Union type for all commands
export type OrderCommand =
  | CreateOrderCommand
  | CancelOrderCommand
  | UpdateOrderStatusCommand
  | ShipOrderCommand
  | AddOrderItemCommand
  | RemoveOrderItemCommand
  | UpdateShippingAddressCommand
  | ProcessPaymentCommand
  | RefundOrderCommand;

// Command factory functions
export function createOrderCommand(
  payload: CreateOrderPayload,
  metadata: ICommandMetadata = { source: 'orders-service' }
): CreateOrderCommand {
  return {
    id: crypto.randomUUID(),
    type: 'CreateOrder',
    payload: createOrderPayloadSchema.parse(payload),
    metadata,
    createdAt: new Date(),
  };
}

export function cancelOrderCommand(
  payload: CancelOrderPayload,
  metadata: ICommandMetadata = { source: 'orders-service' }
): CancelOrderCommand {
  return {
    id: crypto.randomUUID(),
    type: 'CancelOrder',
    payload: cancelOrderPayloadSchema.parse(payload),
    metadata,
    createdAt: new Date(),
  };
}

export function updateOrderStatusCommand(
  payload: UpdateOrderStatusPayload,
  metadata: ICommandMetadata = { source: 'orders-service' }
): UpdateOrderStatusCommand {
  return {
    id: crypto.randomUUID(),
    type: 'UpdateOrderStatus',
    payload: updateOrderStatusPayloadSchema.parse(payload),
    metadata,
    createdAt: new Date(),
  };
}

export function shipOrderCommand(
  payload: ShipOrderPayload,
  metadata: ICommandMetadata = { source: 'orders-service' }
): ShipOrderCommand {
  return {
    id: crypto.randomUUID(),
    type: 'ShipOrder',
    payload: shipOrderPayloadSchema.parse(payload),
    metadata,
    createdAt: new Date(),
  };
}

export function addOrderItemCommand(
  payload: AddOrderItemPayload,
  metadata: ICommandMetadata = { source: 'orders-service' }
): AddOrderItemCommand {
  return {
    id: crypto.randomUUID(),
    type: 'AddOrderItem',
    payload: addOrderItemPayloadSchema.parse(payload),
    metadata,
    createdAt: new Date(),
  };
}

export function removeOrderItemCommand(
  payload: RemoveOrderItemPayload,
  metadata: ICommandMetadata = { source: 'orders-service' }
): RemoveOrderItemCommand {
  return {
    id: crypto.randomUUID(),
    type: 'RemoveOrderItem',
    payload: removeOrderItemPayloadSchema.parse(payload),
    metadata,
    createdAt: new Date(),
  };
}

export function updateShippingAddressCommand(
  payload: UpdateShippingAddressPayload,
  metadata: ICommandMetadata = { source: 'orders-service' }
): UpdateShippingAddressCommand {
  return {
    id: crypto.randomUUID(),
    type: 'UpdateShippingAddress',
    payload: updateShippingAddressPayloadSchema.parse(payload),
    metadata,
    createdAt: new Date(),
  };
}

export function processPaymentCommand(
  payload: ProcessPaymentPayload,
  metadata: ICommandMetadata = { source: 'orders-service' }
): ProcessPaymentCommand {
  return {
    id: crypto.randomUUID(),
    type: 'ProcessPayment',
    payload: processPaymentPayloadSchema.parse(payload),
    metadata,
    createdAt: new Date(),
  };
}

export function refundOrderCommand(
  payload: RefundOrderPayload,
  metadata: ICommandMetadata = { source: 'orders-service' }
): RefundOrderCommand {
  return {
    id: crypto.randomUUID(),
    type: 'RefundOrder',
    payload: refundOrderPayloadSchema.parse(payload),
    metadata,
    createdAt: new Date(),
  };
}
