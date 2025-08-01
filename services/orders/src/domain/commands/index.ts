import { z } from 'zod';

// Base command interface
export interface Command {
  readonly aggregateId: string;
  readonly type: string;
  readonly timestamp: Date;
}

// Command payloads with validation schemas

// Create Order
export const createOrderPayloadSchema = z.object({
  customerId: z.uuid('Invalid customer ID format'),
  items: z.array(z.object({
    productId: z.uuid('Invalid product ID format'),
    quantity: z.number().int().positive('Quantity must be positive'),
    price: z.number().positive('Price must be positive'),
    name: z.string().min(1, 'Product name is required'),
  })).min(1, 'Order must have at least one item'),
  shippingAddress: z.object({
    street: z.string().min(1, 'Street is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(1, 'Country is required'),
  }),
  billingAddress: z.object({
    street: z.string().min(1, 'Street is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(1, 'Country is required'),
  }).optional(),
  paymentMethod: z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'PAYPAL', 'BANK_TRANSFER']),
  notes: z.string().optional(),
});

export type CreateOrderPayload = z.infer<typeof createOrderPayloadSchema>;

export interface CreateOrderCommand extends Command {
  readonly type: 'CreateOrder';
  readonly payload: CreateOrderPayload;
}

// Cancel Order
export const cancelOrderPayloadSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required'),
  cancelledBy: z.uuid('Invalid user ID format'),
});

export type CancelOrderPayload = z.infer<typeof cancelOrderPayloadSchema>;

export interface CancelOrderCommand extends Command {
  readonly type: 'CancelOrder';
  readonly payload: CancelOrderPayload;
}

// Update Order Status
export const updateOrderStatusPayloadSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
  updatedBy: z.uuid('Invalid user ID format'),
  notes: z.string().optional(),
});

export type UpdateOrderStatusPayload = z.infer<typeof updateOrderStatusPayloadSchema>;

export interface UpdateOrderStatusCommand extends Command {
  readonly type: 'UpdateOrderStatus';
  readonly payload: UpdateOrderStatusPayload;
}

// Ship Order
export const shipOrderPayloadSchema = z.object({
  trackingNumber: z.string().min(1, 'Tracking number is required'),
  carrier: z.string().min(1, 'Carrier is required'),
  estimatedDeliveryDate: z.string().datetime('Invalid date format'),
  shippedBy: z.uuid('Invalid user ID format'),
});

export type ShipOrderPayload = z.infer<typeof shipOrderPayloadSchema>;

export interface ShipOrderCommand extends Command {
  readonly type: 'ShipOrder';
  readonly payload: ShipOrderPayload;
}

// Add Order Item
export const addOrderItemPayloadSchema = z.object({
  productId: z.uuid('Invalid product ID format'),
  quantity: z.number().int().positive('Quantity must be positive'),
  price: z.number().positive('Price must be positive'),
  name: z.string().min(1, 'Product name is required'),
  addedBy: z.uuid('Invalid user ID format'),
});

export type AddOrderItemPayload = z.infer<typeof addOrderItemPayloadSchema>;

export interface AddOrderItemCommand extends Command {
  readonly type: 'AddOrderItem';
  readonly payload: AddOrderItemPayload;
}

// Remove Order Item
export const removeOrderItemPayloadSchema = z.object({
  productId: z.uuid('Invalid product ID format'),
  removedBy: z.uuid('Invalid user ID format'),
  reason: z.string().optional(),
});

export type RemoveOrderItemPayload = z.infer<typeof removeOrderItemPayloadSchema>;

export interface RemoveOrderItemCommand extends Command {
  readonly type: 'RemoveOrderItem';
  readonly payload: RemoveOrderItemPayload;
}

// Update Shipping Address
export const updateShippingAddressPayloadSchema = z.object({
  shippingAddress: z.object({
    street: z.string().min(1, 'Street is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(1, 'Country is required'),
  }),
  updatedBy: z.uuid('Invalid user ID format'),
});

export type UpdateShippingAddressPayload = z.infer<typeof updateShippingAddressPayloadSchema>;

export interface UpdateShippingAddressCommand extends Command {
  readonly type: 'UpdateShippingAddress';
  readonly payload: UpdateShippingAddressPayload;
}

// Process Payment
export const processPaymentPayloadSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  paymentMethod: z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'PAYPAL', 'BANK_TRANSFER']),
  transactionId: z.string().min(1, 'Transaction ID is required'),
  processedBy: z.uuid('Invalid user ID format'),
});

export type ProcessPaymentPayload = z.infer<typeof processPaymentPayloadSchema>;

export interface ProcessPaymentCommand extends Command {
  readonly type: 'ProcessPayment';
  readonly payload: ProcessPaymentPayload;
}

// Refund Order
export const refundOrderPayloadSchema = z.object({
  amount: z.number().positive('Refund amount must be positive'),
  reason: z.string().min(1, 'Refund reason is required'),
  refundedBy: z.uuid('Invalid user ID format'),
  transactionId: z.string().optional(),
});

export type RefundOrderPayload = z.infer<typeof refundOrderPayloadSchema>;

export interface RefundOrderCommand extends Command {
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
  aggregateId: string,
  payload: CreateOrderPayload
): CreateOrderCommand {
  return {
    aggregateId,
    type: 'CreateOrder',
    payload: createOrderPayloadSchema.parse(payload),
    timestamp: new Date(),
  };
}

export function cancelOrderCommand(
  aggregateId: string,
  payload: CancelOrderPayload
): CancelOrderCommand {
  return {
    aggregateId,
    type: 'CancelOrder',
    payload: cancelOrderPayloadSchema.parse(payload),
    timestamp: new Date(),
  };
}

export function updateOrderStatusCommand(
  aggregateId: string,
  payload: UpdateOrderStatusPayload
): UpdateOrderStatusCommand {
  return {
    aggregateId,
    type: 'UpdateOrderStatus',
    payload: updateOrderStatusPayloadSchema.parse(payload),
    timestamp: new Date(),
  };
}

export function shipOrderCommand(
  aggregateId: string,
  payload: ShipOrderPayload
): ShipOrderCommand {
  return {
    aggregateId,
    type: 'ShipOrder',
    payload: shipOrderPayloadSchema.parse(payload),
    timestamp: new Date(),
  };
}

export function addOrderItemCommand(
  aggregateId: string,
  payload: AddOrderItemPayload
): AddOrderItemCommand {
  return {
    aggregateId,
    type: 'AddOrderItem',
    payload: addOrderItemPayloadSchema.parse(payload),
    timestamp: new Date(),
  };
}

export function removeOrderItemCommand(
  aggregateId: string,
  payload: RemoveOrderItemPayload
): RemoveOrderItemCommand {
  return {
    aggregateId,
    type: 'RemoveOrderItem',
    payload: removeOrderItemPayloadSchema.parse(payload),
    timestamp: new Date(),
  };
}

export function updateShippingAddressCommand(
  aggregateId: string,
  payload: UpdateShippingAddressPayload
): UpdateShippingAddressCommand {
  return {
    aggregateId,
    type: 'UpdateShippingAddress',
    payload: updateShippingAddressPayloadSchema.parse(payload),
    timestamp: new Date(),
  };
}

export function processPaymentCommand(
  aggregateId: string,
  payload: ProcessPaymentPayload
): ProcessPaymentCommand {
  return {
    aggregateId,
    type: 'ProcessPayment',
    payload: processPaymentPayloadSchema.parse(payload),
    timestamp: new Date(),
  };
}

export function refundOrderCommand(
  aggregateId: string,
  payload: RefundOrderPayload
): RefundOrderCommand {
  return {
    aggregateId,
    type: 'RefundOrder',
    payload: refundOrderPayloadSchema.parse(payload),
    timestamp: new Date(),
  };
}