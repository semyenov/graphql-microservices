import type { DomainEvent } from '@graphql-microservices/event-sourcing';
import type { CacheService } from '@graphql-microservices/shared-cache';
import type { PubSubService } from '@graphql-microservices/shared-pubsub';
import type { PrismaClient } from '../../generated/prisma';
import type {
  ProductCategoryChangedEvent,
  ProductCreatedEvent,
  ProductDeactivatedEvent,
  ProductDomainEvent,
  ProductPriceChangedEvent,
  ProductReactivatedEvent,
  ProductStockChangedEvent,
  ProductStockReservationReleasedEvent,
  ProductStockReservedEvent,
  ProductUpdatedEvent,
} from '../domain/product-aggregate';

/**
 * Event handler interface
 */
export interface EventHandler<T extends DomainEvent = DomainEvent> {
  handle(event: T): Promise<void>;
  canHandle(event: DomainEvent): boolean;
}

/**
 * Base event handler with common functionality
 */
abstract class BaseEventHandler<T extends ProductDomainEvent> implements EventHandler<T> {
  constructor(
    protected readonly prisma: PrismaClient,
    protected readonly cacheService?: CacheService,
    protected readonly pubSubService?: PubSubService
  ) {}

  abstract handle(event: T): Promise<void>;
  abstract canHandle(event: DomainEvent): boolean;

  /**
   * Invalidate product cache
   */
  protected async invalidateProductCache(productId: string, sku?: string): Promise<void> {
    if (!this.cacheService) return;

    await Promise.all([
      this.cacheService.delete(`product:${productId}`),
      sku ? this.cacheService.delete(`product:sku:${sku}`) : Promise.resolve(),
      // Invalidate category and search caches
      this.cacheService.delete(`product:category:*`),
      this.cacheService.delete(`product:search:*`),
    ]);
  }

  /**
   * Publish GraphQL subscription event
   */
  protected async publishSubscriptionEvent(
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.pubSubService) return;

    try {
      const pubsub = this.pubSubService.getPubSub();
      await pubsub.publish(eventType, payload);
    } catch (error) {
      console.error(`Failed to publish subscription event ${eventType}:`, error);
    }
  }

  /**
   * Log event processing
   */
  protected logEventProcessing(
    event: DomainEvent,
    status: 'started' | 'completed' | 'failed',
    error?: Error
  ): void {
    const logData = {
      eventId: event.id,
      eventType: event.type,
      aggregateId: event.aggregateId,
      version: event.version,
      status,
      timestamp: new Date().toISOString(),
      ...(error && { error: error.message }),
    };

    if (status === 'failed') {
      console.error('Event processing failed:', logData);
    } else {
      console.log('Event processing:', logData);
    }
  }
}

/**
 * Product Created Event Handler
 * Creates the product in the read model
 */
export class ProductCreatedEventHandler extends BaseEventHandler<ProductCreatedEvent> {
  canHandle(event: DomainEvent): boolean {
    return event.type === 'ProductCreated';
  }

  async handle(event: ProductCreatedEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Create product in read model
      await this.prisma.product.upsert({
        where: { id: event.aggregateId },
        update: {
          name: event.data.name,
          description: event.data.description,
          price: event.data.price.amount,
          stock: event.data.initialStock,
          sku: event.data.sku,
          category: event.data.category,
          tags: event.data.tags,
          imageUrl: event.data.imageUrl,
          isActive: true,
          updatedAt: event.occurredAt,
        },
        create: {
          id: event.aggregateId,
          name: event.data.name,
          description: event.data.description,
          price: event.data.price.amount,
          stock: event.data.initialStock,
          sku: event.data.sku,
          category: event.data.category,
          tags: event.data.tags,
          imageUrl: event.data.imageUrl,
          isActive: true,
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt,
        },
      });

      // Publish GraphQL subscription
      const productPayload = {
        id: event.aggregateId,
        name: event.data.name,
        description: event.data.description,
        price: event.data.price,
        stock: event.data.initialStock,
        sku: event.data.sku,
        category: event.data.category,
        tags: event.data.tags,
        imageUrl: event.data.imageUrl,
        isActive: true,
        createdAt: event.occurredAt.toISOString(),
        updatedAt: event.occurredAt.toISOString(),
      };

      await this.publishSubscriptionEvent('productCreated', { productCreated: productPayload });

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(event, 'failed', error as Error);
      throw error;
    }
  }
}

/**
 * Product Updated Event Handler
 */
export class ProductUpdatedEventHandler extends BaseEventHandler<ProductUpdatedEvent> {
  canHandle(event: DomainEvent): boolean {
    return event.type === 'ProductUpdated';
  }

  async handle(event: ProductUpdatedEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Update read model
      const updateData: Record<string, unknown> = { updatedAt: event.occurredAt };

      if (event.data.name !== undefined) {
        updateData.name = event.data.name;
      }
      if (event.data.description !== undefined) {
        updateData.description = event.data.description;
      }
      if (event.data.imageUrl !== undefined) {
        updateData.imageUrl = event.data.imageUrl;
      }
      if (event.data.tags !== undefined) {
        updateData.tags = event.data.tags;
      }

      const updatedProduct = await this.prisma.product.update({
        where: { id: event.aggregateId },
        data: updateData,
      });

      // Invalidate cache
      await this.invalidateProductCache(event.aggregateId, updatedProduct.sku);

      // Publish GraphQL subscription
      await this.publishSubscriptionEvent('productUpdated', {
        productUpdated: {
          id: updatedProduct.id,
          name: updatedProduct.name,
          description: updatedProduct.description,
          price: updatedProduct.price,
          stock: updatedProduct.stock,
          sku: updatedProduct.sku,
          category: updatedProduct.category,
          tags: updatedProduct.tags,
          imageUrl: updatedProduct.imageUrl,
          isActive: updatedProduct.isActive,
          createdAt: updatedProduct.createdAt.toISOString(),
          updatedAt: updatedProduct.updatedAt.toISOString(),
        },
      });

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(event, 'failed', error as Error);
      throw error;
    }
  }
}

/**
 * Product Price Changed Event Handler
 */
export class ProductPriceChangedEventHandler extends BaseEventHandler<ProductPriceChangedEvent> {
  canHandle(event: DomainEvent): boolean {
    return event.type === 'ProductPriceChanged';
  }

  async handle(event: ProductPriceChangedEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Update price in read model
      const updatedProduct = await this.prisma.product.update({
        where: { id: event.aggregateId },
        data: {
          price: event.data.newPrice.amount,
          updatedAt: event.occurredAt,
        },
      });

      // Invalidate cache
      await this.invalidateProductCache(event.aggregateId, updatedProduct.sku);

      // Publish GraphQL subscription
      await this.publishSubscriptionEvent('productPriceChanged', {
        productPriceChanged: {
          id: updatedProduct.id,
          newPrice: event.data.newPrice,
          previousPrice: event.data.previousPrice,
          reason: event.data.reason,
          changedBy: event.data.changedBy,
          changedAt: event.occurredAt.toISOString(),
        },
      });

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(event, 'failed', error as Error);
      throw error;
    }
  }
}

/**
 * Product Stock Changed Event Handler
 */
export class ProductStockChangedEventHandler extends BaseEventHandler<ProductStockChangedEvent> {
  canHandle(event: DomainEvent): boolean {
    return event.type === 'ProductStockChanged';
  }

  async handle(event: ProductStockChangedEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Update stock in read model
      const updatedProduct = await this.prisma.product.update({
        where: { id: event.aggregateId },
        data: {
          stock: event.data.newStock,
          updatedAt: event.occurredAt,
        },
      });

      // Invalidate cache
      await this.invalidateProductCache(event.aggregateId, updatedProduct.sku);

      // Publish GraphQL subscription
      await this.publishSubscriptionEvent('productStockChanged', {
        productStockChanged: {
          id: updatedProduct.id,
          newStock: event.data.newStock,
          previousStock: event.data.previousStock,
          changeAmount: event.data.changeAmount,
          changeType: event.data.changeType,
          reason: event.data.reason,
          changedBy: event.data.changedBy,
          changedAt: event.occurredAt.toISOString(),
        },
      });

      // Publish low stock alert if applicable
      if (event.data.newStock < 10) {
        await this.publishSubscriptionEvent('productLowStock', {
          productLowStock: {
            id: updatedProduct.id,
            name: updatedProduct.name,
            sku: updatedProduct.sku,
            currentStock: event.data.newStock,
            threshold: 10,
          },
        });
      }

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(event, 'failed', error as Error);
      throw error;
    }
  }
}

/**
 * Product Category Changed Event Handler
 */
export class ProductCategoryChangedEventHandler extends BaseEventHandler<ProductCategoryChangedEvent> {
  canHandle(event: DomainEvent): boolean {
    return event.type === 'ProductCategoryChanged';
  }

  async handle(event: ProductCategoryChangedEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Update category in read model
      const updatedProduct = await this.prisma.product.update({
        where: { id: event.aggregateId },
        data: {
          category: event.data.newCategory,
          updatedAt: event.occurredAt,
        },
      });

      // Invalidate cache
      await this.invalidateProductCache(event.aggregateId, updatedProduct.sku);

      // Publish GraphQL subscription
      await this.publishSubscriptionEvent('productUpdated', {
        productUpdated: {
          id: updatedProduct.id,
          name: updatedProduct.name,
          description: updatedProduct.description,
          price: { amount: updatedProduct.price, currency: 'USD' },
          stock: updatedProduct.stock,
          sku: updatedProduct.sku,
          category: updatedProduct.category,
          tags: updatedProduct.tags,
          imageUrl: updatedProduct.imageUrl,
          isActive: updatedProduct.isActive,
          createdAt: updatedProduct.createdAt.toISOString(),
          updatedAt: updatedProduct.updatedAt.toISOString(),
        },
      });

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(event, 'failed', error as Error);
      throw error;
    }
  }
}

/**
 * Product Deactivated Event Handler
 */
export class ProductDeactivatedEventHandler extends BaseEventHandler<ProductDeactivatedEvent> {
  canHandle(event: DomainEvent): boolean {
    return event.type === 'ProductDeactivated';
  }

  async handle(event: ProductDeactivatedEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Update read model
      const updatedProduct = await this.prisma.product.update({
        where: { id: event.aggregateId },
        data: {
          isActive: false,
          updatedAt: event.occurredAt,
        },
      });

      // Invalidate cache
      await this.invalidateProductCache(event.aggregateId, updatedProduct.sku);

      // Publish GraphQL subscription
      await this.publishSubscriptionEvent('productDeactivated', {
        productDeactivated: {
          id: updatedProduct.id,
          name: updatedProduct.name,
          sku: updatedProduct.sku,
          reason: event.data.reason,
          deactivatedBy: event.data.deactivatedBy,
          deactivatedAt: event.occurredAt.toISOString(),
        },
      });

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(event, 'failed', error as Error);
      throw error;
    }
  }
}

/**
 * Product Reactivated Event Handler
 */
export class ProductReactivatedEventHandler extends BaseEventHandler<ProductReactivatedEvent> {
  canHandle(event: DomainEvent): boolean {
    return event.type === 'ProductReactivated';
  }

  async handle(event: ProductReactivatedEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Update read model
      const updatedProduct = await this.prisma.product.update({
        where: { id: event.aggregateId },
        data: {
          isActive: true,
          updatedAt: event.occurredAt,
        },
      });

      // Invalidate cache
      await this.invalidateProductCache(event.aggregateId, updatedProduct.sku);

      // Publish GraphQL subscription
      await this.publishSubscriptionEvent('productReactivated', {
        productReactivated: {
          id: updatedProduct.id,
          name: updatedProduct.name,
          sku: updatedProduct.sku,
          reason: event.data.reason,
          reactivatedBy: event.data.reactivatedBy,
          reactivatedAt: event.occurredAt.toISOString(),
        },
      });

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(event, 'failed', error as Error);
      throw error;
    }
  }
}

/**
 * Product Stock Reserved Event Handler
 * Note: This doesn't update the read model stock directly,
 * as reservations are tracked in the aggregate
 */
export class ProductStockReservedEventHandler extends BaseEventHandler<ProductStockReservedEvent> {
  canHandle(event: DomainEvent): boolean {
    return event.type === 'ProductStockReserved';
  }

  async handle(event: ProductStockReservedEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Invalidate cache to ensure fresh data
      await this.invalidateProductCache(event.aggregateId);

      // Publish GraphQL subscription
      await this.publishSubscriptionEvent('productStockReserved', {
        productStockReserved: {
          productId: event.aggregateId,
          quantity: event.data.quantity,
          reservationId: event.data.reservationId,
          reservedFor: event.data.reservedFor,
          expiresAt: event.data.expiresAt?.toISOString(),
          reservedAt: event.occurredAt.toISOString(),
        },
      });

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(event, 'failed', error as Error);
      throw error;
    }
  }
}

/**
 * Product Stock Reservation Released Event Handler
 */
export class ProductStockReservationReleasedEventHandler extends BaseEventHandler<ProductStockReservationReleasedEvent> {
  canHandle(event: DomainEvent): boolean {
    return event.type === 'ProductStockReservationReleased';
  }

  async handle(event: ProductStockReservationReleasedEvent): Promise<void> {
    this.logEventProcessing(event, 'started');

    try {
      // Invalidate cache to ensure fresh data
      await this.invalidateProductCache(event.aggregateId);

      // Publish GraphQL subscription
      await this.publishSubscriptionEvent('productStockReservationReleased', {
        productStockReservationReleased: {
          productId: event.aggregateId,
          quantity: event.data.quantity,
          reservationId: event.data.reservationId,
          reason: event.data.reason,
          releasedAt: event.occurredAt.toISOString(),
        },
      });

      this.logEventProcessing(event, 'completed');
    } catch (error) {
      this.logEventProcessing(event, 'failed', error as Error);
      throw error;
    }
  }
}

/**
 * Event Dispatcher - Routes events to appropriate handlers
 */
export class ProductEventDispatcher {
  private readonly handlers: EventHandler[] = [];

  constructor(prisma: PrismaClient, cacheService?: CacheService, pubSubService?: PubSubService) {
    // Register all event handlers
    this.handlers = [
      new ProductCreatedEventHandler(prisma, cacheService, pubSubService),
      new ProductUpdatedEventHandler(prisma, cacheService, pubSubService),
      new ProductPriceChangedEventHandler(prisma, cacheService, pubSubService),
      new ProductStockChangedEventHandler(prisma, cacheService, pubSubService),
      new ProductCategoryChangedEventHandler(prisma, cacheService, pubSubService),
      new ProductDeactivatedEventHandler(prisma, cacheService, pubSubService),
      new ProductReactivatedEventHandler(prisma, cacheService, pubSubService),
      new ProductStockReservedEventHandler(prisma, cacheService, pubSubService),
      new ProductStockReservationReleasedEventHandler(prisma, cacheService, pubSubService),
    ];
  }

  /**
   * Dispatch an event to appropriate handlers
   */
  async dispatch(event: DomainEvent): Promise<void> {
    const applicableHandlers = this.handlers.filter((handler) => handler.canHandle(event));

    if (applicableHandlers.length === 0) {
      console.warn(`No handlers found for event type: ${event.type}`);
      return;
    }

    // Process all handlers in parallel
    const promises = applicableHandlers.map((handler) => handler.handle(event));

    try {
      await Promise.all(promises);
    } catch (error) {
      console.error(`Failed to process event ${event.id} (${event.type}):`, error);
      throw error;
    }
  }

  /**
   * Dispatch multiple events
   */
  async dispatchBatch(events: DomainEvent[]): Promise<void> {
    const promises = events.map((event) => this.dispatch(event));
    await Promise.all(promises);
  }

  /**
   * Register a custom event handler
   */
  registerHandler(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Get registered handlers
   */
  getHandlers(): EventHandler[] {
    return [...this.handlers];
  }
}
