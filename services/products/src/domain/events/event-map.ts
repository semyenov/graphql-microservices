/**
 * Type-safe event map for Products service
 */

import type { DefineEventMap } from '@graphql-microservices/event-sourcing';
import type {
  ProductCategoryChangedEvent,
  ProductCreatedEvent,
  ProductDeactivatedEvent,
  ProductPriceChangedEvent,
  ProductReactivatedEvent,
  ProductStockChangedEvent,
  ProductStockReservationReleasedEvent,
  ProductStockReservedEvent,
  ProductUpdatedEvent,
} from '../product-aggregate';

/**
 * Products service event map for type-safe event bus
 */
export type ProductEventMap = DefineEventMap<{
  ProductCreated: ProductCreatedEvent;
  ProductUpdated: ProductUpdatedEvent;
  ProductPriceChanged: ProductPriceChangedEvent;
  ProductStockChanged: ProductStockChangedEvent;
  ProductCategoryChanged: ProductCategoryChangedEvent;
  ProductDeactivated: ProductDeactivatedEvent;
  ProductReactivated: ProductReactivatedEvent;
  ProductStockReserved: ProductStockReservedEvent;
  ProductStockReservationReleased: ProductStockReservationReleasedEvent;
}>;

/**
 * Helper type to extract all product events
 */
export type ProductDomainEventUnion = ProductEventMap[keyof ProductEventMap];
