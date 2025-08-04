/**
 * Type-safe event map for Orders service
 */

import type { DefineEventMap } from '@graphql-microservices/event-sourcing/cqrs';
import type {
  OrderCancelledEvent,
  OrderCreatedEvent,
  OrderItemAddedEvent,
  OrderItemQuantityChangedEvent,
  OrderItemRemovedEvent,
  OrderPaymentUpdatedEvent,
  OrderRefundedEvent,
  OrderShippingUpdatedEvent,
  OrderStatusChangedEvent,
} from '../order-aggregate';

/**
 * Orders service event map for type-safe event bus
 */
export type OrderEventMap = DefineEventMap<{
  OrderCreated: OrderCreatedEvent;
  OrderCancelled: OrderCancelledEvent;
  OrderStatusChanged: OrderStatusChangedEvent;
  OrderItemAdded: OrderItemAddedEvent;
  OrderItemRemoved: OrderItemRemovedEvent;
  OrderItemQuantityChanged: OrderItemQuantityChangedEvent;
  OrderPaymentUpdated: OrderPaymentUpdatedEvent;
  OrderShippingUpdated: OrderShippingUpdatedEvent;
  OrderRefunded: OrderRefundedEvent;
}>;

/**
 * Helper type to extract all order events
 */
export type OrderDomainEvent = OrderEventMap[keyof OrderEventMap];
