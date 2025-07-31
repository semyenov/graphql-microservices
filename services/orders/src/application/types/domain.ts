/**
 * Domain types for Orders service with branded types for type safety
 */

import type {
  Brand,
  NonEmptyString,
  NonNegativeNumber,
  PositiveNumber,
} from '@graphql-microservices/shared-type-utils';
import { ok, err, type Result, ValidationError } from '@graphql-microservices/shared-type-utils';

export { type Result } from "@graphql-microservices/shared-type-utils";

// Branded primitive types specific to Orders
export type OrderId = Brand<string, 'OrderId'>;
export type OrderNumber = Brand<string, 'OrderNumber'>;
export type UserId = Brand<string, 'UserId'>;
export type ProductId = Brand<string, 'ProductId'>;
export type Amount = NonNegativeNumber & Brand<number, 'Amount'>;
export type Quantity = PositiveNumber & Brand<number, 'Quantity'>;
export type TrackingNumber = NonEmptyString & Brand<string, 'TrackingNumber'>;
export type TransactionId = Brand<string, 'TransactionId'>;

// Order status as literal type
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

// Payment status as literal type
export type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REFUNDED'
  | 'CANCELLED';

// Shipping status as literal type
export type ShippingStatus =
  | 'NOT_SHIPPED'
  | 'PREPARING'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'RETURNED';

// Type guards
export const isOrderId = (value: unknown): value is OrderId =>
  typeof value === 'string' && value.length > 0;

export const isOrderNumber = (value: unknown): value is OrderNumber =>
  typeof value === 'string' && /^ORD-\d{8,}$/.test(value);

export const isUserId = (value: unknown): value is UserId =>
  typeof value === 'string' && value.length > 0;

export const isProductId = (value: unknown): value is ProductId =>
  typeof value === 'string' && value.length > 0;

export const isAmount = (value: unknown): value is Amount =>
  typeof value === 'number' && value >= 0 && Number.isFinite(value);

export const isQuantity = (value: unknown): value is Quantity =>
  typeof value === 'number' && value > 0 && Number.isInteger(value);

export const isTrackingNumber = (value: unknown): value is TrackingNumber =>
  typeof value === 'string' && value.length > 0;

export const isOrderStatus = (value: unknown): value is OrderStatus =>
  typeof value === 'string' &&
  ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].includes(
    value
  );

// Type constructors with validation
export const createOrderId = (value: string): Result<OrderId, ValidationError> => {
  if (!value || value.trim().length === 0) {
    return err(new ValidationError('OrderId cannot be empty', 'orderId', value));
  }
  return ok(value as OrderId);
};

export const createOrderNumber = (value: string): Result<OrderNumber, ValidationError> => {
  if (!value || !/^ORD-\d{8,}$/.test(value)) {
    return err(new ValidationError('OrderNumber must match pattern ORD-XXXXXXXX', 'orderNumber', value));
  }
  return ok(value as OrderNumber);
};

export const generateOrderNumber = (): OrderNumber => {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `ORD-${timestamp}${random}` as OrderNumber;
};

export const createAmount = (value: number): Result<Amount, ValidationError> => {
  if (value < 0 || !Number.isFinite(value)) {
    return err(new ValidationError('Amount must be a non-negative finite number', 'amount', value));
  }
  // Round to 2 decimal places
  const rounded = Math.round(value * 100) / 100;
  return ok(rounded as Amount);
};

export const createQuantity = (value: number): Result<Quantity, ValidationError> => {
  if (value <= 0 || !Number.isInteger(value)) {
    return err(new ValidationError('Quantity must be a positive integer', 'quantity', value));
  }
  return ok(value as Quantity);
};

export const createTrackingNumber = (value: string): Result<TrackingNumber, ValidationError> => {
  const trimmed = value.trim();
  if (!trimmed) {
    return err(new ValidationError('Tracking number cannot be empty', 'trackingNumber', value));
  }
  return ok(trimmed as TrackingNumber);
};

// Cache key templates with type safety
import { CacheKeyBuilder, type CacheKeyTemplate } from '@graphql-microservices/shared-type-utils';

const orderCache = new CacheKeyBuilder('order');
const ordersCache = new CacheKeyBuilder('orders');

export const cacheKey = {
  order: (id: OrderId): CacheKeyTemplate => orderCache.key(id),
  orderByNumber: (number: OrderNumber): CacheKeyTemplate => orderCache.keys('number', number),
  ordersByUser: (userId: UserId): CacheKeyTemplate => ordersCache.keys('user', userId),
  ordersByStatus: (status: OrderStatus): CacheKeyTemplate => ordersCache.keys('status', status),
  ordersList: (page: number, limit: number): CacheKeyTemplate =>
    ordersCache.keys('list', String(page), String(limit)),
} as const;

// Domain value objects
export interface Money {
  amount: Amount;
  currency: string;
}

export interface OrderItem {
  productId: ProductId;
  quantity: Quantity;
  unitPrice: Amount;
  totalPrice: Amount;
  productName?: string;
  productSku?: string;
}

export interface ShippingAddress {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  recipientName?: string;
  phoneNumber?: string;
}

export interface PaymentInfo {
  method: 'CREDIT_CARD' | 'DEBIT_CARD' | 'PAYPAL' | 'BANK_TRANSFER' | 'CASH_ON_DELIVERY';
  status: PaymentStatus;
  transactionId?: TransactionId;
  paidAt?: Date;
  failureReason?: string;
}

export interface ShippingInfo {
  carrier?: string;
  trackingNumber?: TrackingNumber;
  shippedAt?: Date;
  deliveredAt?: Date;
  estimatedDeliveryDate?: Date;
  status: ShippingStatus;
}

// Order status transitions
export const VALID_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

export const canTransitionStatus = (from: OrderStatus, to: OrderStatus): boolean => {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
};

// Filter types
export interface OrderFilter {
  userId?: UserId;
  status?: OrderStatus;
  minAmount?: Amount;
  maxAmount?: Amount;
  fromDate?: Date;
  toDate?: Date;
  hasShipped?: boolean;
}

// Sort types
export type SortField = 'orderNumber' | 'totalAmount' | 'createdAt' | 'updatedAt' | 'status';
export type SortDirection = 'ASC' | 'DESC';

export interface OrderSort {
  field: SortField;
  direction: SortDirection;
}

// Command metadata
export interface CommandMetadata {
  userId?: string;
  correlationId?: string;
  timestamp?: Date;
  ipAddress?: string;
  userAgent?: string;
}