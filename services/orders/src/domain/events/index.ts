import type { IDomainEvent } from '@graphql-microservices/event-sourcing';
import type {
  AddressProps,
  OrderItemProps,
  PaymentMethodType,
  TrackingInfoProps,
} from '../value-objects/index';

// Order Created Event
export interface OrderCreatedPayload {
  orderNumber: string;
  customerId: string;
  items: Array<OrderItemProps & { total: number }>;
  shippingAddress: AddressProps;
  billingAddress?: AddressProps;
  paymentMethod: PaymentMethodType;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  currency: string;
  notes?: string;
  createdAt: Date;
}

export interface OrderCreatedEvent extends IDomainEvent {
  readonly type: 'OrderCreated';
  readonly payload: OrderCreatedPayload;
}

// Order Cancelled Event
export interface OrderCancelledPayload {
  reason: string;
  cancelledBy: string;
  cancelledAt: Date;
  refundAmount?: number;
}

export interface OrderCancelledEvent extends IDomainEvent {
  readonly type: 'OrderCancelled';
  readonly payload: OrderCancelledPayload;
}

// Order Status Updated Event
export interface OrderStatusUpdatedPayload {
  previousStatus: string;
  newStatus: string;
  updatedBy: string;
  updatedAt: Date;
  notes?: string;
}

export interface OrderStatusUpdatedEvent extends IDomainEvent {
  readonly type: 'OrderStatusUpdated';
  readonly payload: OrderStatusUpdatedPayload;
}

// Order Shipped Event
export interface OrderShippedPayload extends TrackingInfoProps {
  shippedBy: string;
}

export interface OrderShippedEvent extends IDomainEvent {
  readonly type: 'OrderShipped';
  readonly payload: OrderShippedPayload;
}

// Order Item Added Event
export interface OrderItemAddedPayload extends OrderItemProps {
  total: number;
  addedBy: string;
  addedAt: Date;
  newSubtotal: number;
  newTotal: number;
}

export interface OrderItemAddedEvent extends IDomainEvent {
  readonly type: 'OrderItemAdded';
  readonly payload: OrderItemAddedPayload;
}

// Order Item Removed Event
export interface OrderItemRemovedPayload {
  productId: string;
  removedQuantity: number;
  removedBy: string;
  removedAt: Date;
  reason?: string;
  newSubtotal: number;
  newTotal: number;
}

export interface OrderItemRemovedEvent extends IDomainEvent {
  readonly type: 'OrderItemRemoved';
  readonly payload: OrderItemRemovedPayload;
}

// Shipping Address Updated Event
export interface ShippingAddressUpdatedPayload {
  previousAddress: AddressProps;
  newAddress: AddressProps;
  updatedBy: string;
  updatedAt: Date;
}

export interface ShippingAddressUpdatedEvent extends IDomainEvent {
  readonly type: 'ShippingAddressUpdated';
  readonly payload: ShippingAddressUpdatedPayload;
}

// Payment Processed Event
export interface PaymentProcessedPayload {
  amount: number;
  currency: string;
  paymentMethod: PaymentMethodType;
  transactionId: string;
  processedBy: string;
  processedAt: Date;
}

export interface PaymentProcessedEvent extends IDomainEvent {
  readonly type: 'PaymentProcessed';
  readonly payload: PaymentProcessedPayload;
}

// Order Refunded Event
export interface OrderRefundedPayload {
  amount: number;
  currency: string;
  reason: string;
  refundedBy: string;
  refundedAt: Date;
  transactionId?: string;
}

export interface OrderRefundedEvent extends IDomainEvent {
  readonly type: 'OrderRefunded';
  readonly payload: OrderRefundedPayload;
}

// Order Delivered Event
export interface OrderDeliveredPayload {
  deliveredAt: Date;
  signedBy?: string;
  deliveryNotes?: string;
}

export interface OrderDeliveredEvent extends IDomainEvent {
  readonly type: 'OrderDelivered';
  readonly payload: OrderDeliveredPayload;
}

// Union type for all events
export type OrderEvent =
  | OrderCreatedEvent
  | OrderCancelledEvent
  | OrderStatusUpdatedEvent
  | OrderShippedEvent
  | OrderItemAddedEvent
  | OrderItemRemovedEvent
  | ShippingAddressUpdatedEvent
  | PaymentProcessedEvent
  | OrderRefundedEvent
  | OrderDeliveredEvent;

// Alias for backward compatibility
export type DomainEvent = OrderEvent;

// Event factory functions
export function createOrderCreatedEvent(
  aggregateId: string,
  payload: OrderCreatedPayload,
  version: number
): OrderCreatedEvent {
  return {
    aggregateId,
    type: 'OrderCreated',
    payload,
    timestamp: new Date(),
    version,
  };
}

export function createOrderCancelledEvent(
  aggregateId: string,
  payload: OrderCancelledPayload,
  version: number
): OrderCancelledEvent {
  return {
    aggregateId,
    type: 'OrderCancelled',
    payload,
    timestamp: new Date(),
    version,
  };
}

export function createOrderStatusUpdatedEvent(
  aggregateId: string,
  payload: OrderStatusUpdatedPayload,
  version: number
): OrderStatusUpdatedEvent {
  return {
    aggregateId,
    type: 'OrderStatusUpdated',
    payload,
    timestamp: new Date(),
    version,
  };
}

export function createOrderShippedEvent(
  aggregateId: string,
  payload: OrderShippedPayload,
  version: number
): OrderShippedEvent {
  return {
    aggregateId,
    type: 'OrderShipped',
    payload,
    timestamp: new Date(),
    version,
  };
}

export function createOrderItemAddedEvent(
  aggregateId: string,
  payload: OrderItemAddedPayload,
  version: number
): OrderItemAddedEvent {
  return {
    aggregateId,
    type: 'OrderItemAdded',
    payload,
    timestamp: new Date(),
    version,
  };
}

export function createOrderItemRemovedEvent(
  aggregateId: string,
  payload: OrderItemRemovedPayload,
  version: number
): OrderItemRemovedEvent {
  return {
    aggregateId,
    type: 'OrderItemRemoved',
    payload,
    timestamp: new Date(),
    version,
  };
}

export function createShippingAddressUpdatedEvent(
  aggregateId: string,
  payload: ShippingAddressUpdatedPayload,
  version: number
): ShippingAddressUpdatedEvent {
  return {
    aggregateId,
    type: 'ShippingAddressUpdated',
    payload,
    timestamp: new Date(),
    version,
  };
}

export function createPaymentProcessedEvent(
  aggregateId: string,
  payload: PaymentProcessedPayload,
  version: number
): PaymentProcessedEvent {
  return {
    aggregateId,
    type: 'PaymentProcessed',
    payload,
    timestamp: new Date(),
    version,
  };
}

export function createOrderRefundedEvent(
  aggregateId: string,
  payload: OrderRefundedPayload,
  version: number
): OrderRefundedEvent {
  return {
    aggregateId,
    type: 'OrderRefunded',
    payload,
    timestamp: new Date(),
    version,
  };
}

export function createOrderDeliveredEvent(
  aggregateId: string,
  payload: OrderDeliveredPayload,
  version: number
): OrderDeliveredEvent {
  return {
    aggregateId,
    type: 'OrderDelivered',
    payload,
    timestamp: new Date(),
    version,
  };
}
