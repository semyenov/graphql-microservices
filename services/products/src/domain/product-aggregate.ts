import {
  AggregateRoot,
  type DomainEvent,
  EventFactory,
} from '@graphql-microservices/event-sourcing';
import {
  BusinessRuleError,
  generateId,
  ValidationError,
} from '@graphql-microservices/shared-errors';
import { Money, ProductCategory, ProductSKU, ProductTags, StockQuantity } from './value-objects';

/**
 * Product domain events
 */
export interface ProductCreatedEvent extends DomainEvent {
  type: 'ProductCreated';
  data: {
    name: string;
    description: string;
    price: { amount: number; currency: string };
    initialStock: number;
    sku: string;
    category: string;
    tags: string[];
    imageUrl?: string;
  };
}

export interface ProductUpdatedEvent extends DomainEvent {
  type: 'ProductUpdated';
  data: {
    name?: string;
    description?: string;
    imageUrl?: string;
    tags?: string[];
    previousName?: string;
    previousDescription?: string;
    previousImageUrl?: string;
    previousTags?: string[];
  };
}

export interface ProductPriceChangedEvent extends DomainEvent {
  type: 'ProductPriceChanged';
  data: {
    newPrice: { amount: number; currency: string };
    previousPrice: { amount: number; currency: string };
    reason?: string;
    changedBy: string;
  };
}

export interface ProductStockChangedEvent extends DomainEvent {
  type: 'ProductStockChanged';
  data: {
    newStock: number;
    previousStock: number;
    changeAmount: number;
    changeType: 'increase' | 'decrease' | 'adjustment';
    reason?: string;
    changedBy?: string;
  };
}

export interface ProductCategoryChangedEvent extends DomainEvent {
  type: 'ProductCategoryChanged';
  data: {
    newCategory: string;
    previousCategory: string;
    reason?: string;
    changedBy: string;
  };
}

export interface ProductDeactivatedEvent extends DomainEvent {
  type: 'ProductDeactivated';
  data: {
    reason: string;
    deactivatedBy: string;
  };
}

export interface ProductReactivatedEvent extends DomainEvent {
  type: 'ProductReactivated';
  data: {
    reason: string;
    reactivatedBy: string;
  };
}

export interface ProductStockReservedEvent extends DomainEvent {
  type: 'ProductStockReserved';
  data: {
    quantity: number;
    reservationId: string;
    reservedFor: string; // order ID or user ID
    expiresAt?: Date;
  };
}

export interface ProductStockReservationReleasedEvent extends DomainEvent {
  type: 'ProductStockReservationReleased';
  data: {
    quantity: number;
    reservationId: string;
    reason: 'expired' | 'cancelled' | 'fulfilled';
  };
}

export type ProductDomainEvent =
  | ProductCreatedEvent
  | ProductUpdatedEvent
  | ProductPriceChangedEvent
  | ProductStockChangedEvent
  | ProductCategoryChangedEvent
  | ProductDeactivatedEvent
  | ProductReactivatedEvent
  | ProductStockReservedEvent
  | ProductStockReservationReleasedEvent;

/**
 * Product aggregate errors
 */
export class ProductDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ProductDomainError';
  }
}

export class ProductNotFoundError extends ProductDomainError {
  constructor(id: string) {
    super(`Product with id '${id}' not found`, 'PRODUCT_NOT_FOUND');
  }
}

export class ProductAlreadyExistsError extends ProductDomainError {
  constructor(field: string, value: string) {
    super(`Product with ${field} '${value}' already exists`, 'PRODUCT_ALREADY_EXISTS');
  }
}

export class ProductDeactivatedError extends ProductDomainError {
  constructor() {
    super('Product is deactivated and cannot be modified', 'PRODUCT_DEACTIVATED');
  }
}

export class InsufficientStockError extends ProductDomainError {
  constructor(requested: number, available: number) {
    super(
      `Insufficient stock: requested ${requested}, available ${available}`,
      'INSUFFICIENT_STOCK'
    );
  }
}

export class InvalidPriceChangeError extends ProductDomainError {
  constructor(reason: string) {
    super(`Invalid price change: ${reason}`, 'INVALID_PRICE_CHANGE');
  }
}

/**
 * Stock Reservation interface for tracking reserved inventory
 */
interface StockReservation {
  id: string;
  quantity: number;
  reservedFor: string;
  createdAt: Date;
  expiresAt?: Date;
}

/**
 * Product aggregate root
 */
export class Product extends AggregateRoot {
  private name: string = '';
  private description: string = '';
  private price: Money = Money.zero();
  private stock: StockQuantity = StockQuantity.zero();
  private sku: ProductSKU = ProductSKU.fromString('TEMP-0001');
  private category: ProductCategory = ProductCategory.fromString('uncategorized');
  private tags: ProductTags = ProductTags.empty();
  private imageUrl?: string;
  private isActive: boolean = true;
  private createdAt: Date = new Date();
  private updatedAt: Date = new Date();
  private stockReservations: Map<string, StockReservation> = new Map();

  /**
   * Create a new product
   */
  static create(
    id: string,
    name: string,
    description: string,
    price: Money,
    initialStock: StockQuantity,
    sku: ProductSKU,
    category: ProductCategory,
    tags: ProductTags = ProductTags.empty(),
    imageUrl?: string,
    metadata?: { correlationId?: string; userId?: string }
  ): Product {
    const product = new Product(id, {});

    // Validate required fields
    if (!name || name.trim().length === 0) {
      throw new ValidationError('Product name is required');
    }

    if (name.length > 200) {
      throw new ValidationError('Product name cannot exceed 200 characters');
    }

    if (!description || description.trim().length === 0) {
      throw new ValidationError('Product description is required');
    }

    if (description.length > 2000) {
      throw new ValidationError('Product description cannot exceed 2000 characters');
    }

    // Business rules validation
    if (price.getAmount() <= 0) {
      throw new BusinessRuleError('Product price must be greater than zero');
    }

    if (price.getAmount() > 999999.99) {
      throw new BusinessRuleError('Product price cannot exceed $999,999.99');
    }

    const event = EventFactory.create(
      'ProductCreated',
      id,
      'Product',
      {
        name: name.trim(),
        description: description.trim(),
        price: price.toJSON(),
        initialStock: initialStock.getValue(),
        sku: sku.getValue(),
        category: category.getValue(),
        tags: tags.getTags(),
        imageUrl,
      },
      {
        source: 'products-service',
        correlationId: metadata?.correlationId,
        userId: metadata?.userId,
      },
      1
    );

    product.applyEvent(event);
    return product;
  }

  /**
   * Create product from events (for event sourcing reconstruction)
   */
  static fromEvents(events: DomainEvent[]): Product {
    if (events.length === 0) {
      throw new Error('Cannot create product from empty event stream');
    }

    const firstEvent = events[0];
    const product = new Product(firstEvent?.aggregateId ?? '', {});

    // Apply all events to reconstruct state
    for (const event of events) {
      product.applyEventData(event);
    }

    product.markEventsAsCommitted();
    return product;
  }

  /**
   * Update product information
   */
  updateProduct(
    name?: string,
    description?: string,
    imageUrl?: string,
    tags?: string[],
    metadata?: { correlationId?: string; userId?: string }
  ): void {
    if (!this.isActive) {
      throw new ProductDeactivatedError();
    }

    const previousName = this.name;
    const previousDescription = this.description;
    const previousImageUrl = this.imageUrl;
    const previousTags = this.tags.getTags();

    // Validate updates
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        throw new ValidationError('Product name cannot be empty');
      }
      if (name.length > 200) {
        throw new ValidationError('Product name cannot exceed 200 characters');
      }
    }

    if (description !== undefined) {
      if (!description || description.trim().length === 0) {
        throw new ValidationError('Product description cannot be empty');
      }
      if (description.length > 2000) {
        throw new ValidationError('Product description cannot exceed 2000 characters');
      }
    }

    // Check if there are actual changes
    const hasChanges =
      (name !== undefined && name.trim() !== this.name) ||
      (description !== undefined && description.trim() !== this.description) ||
      (imageUrl !== undefined && imageUrl !== this.imageUrl) ||
      (tags !== undefined && JSON.stringify(tags.sort()) !== JSON.stringify(previousTags));

    if (!hasChanges) {
      return; // No changes to apply
    }

    const event = EventFactory.create(
      'ProductUpdated',
      this.id,
      'Product',
      {
        name: name?.trim(),
        description: description?.trim(),
        imageUrl,
        tags,
        previousName,
        previousDescription,
        previousImageUrl,
        previousTags,
      },
      {
        source: 'products-service',
        correlationId: metadata?.correlationId,
        userId: metadata?.userId,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Change product price
   */
  changePrice(
    newPrice: Money,
    reason: string,
    changedBy: string,
    metadata?: { correlationId?: string }
  ): void {
    if (!this.isActive) {
      throw new ProductDeactivatedError();
    }

    // Business rules for price changes
    if (newPrice.getAmount() <= 0) {
      throw new InvalidPriceChangeError('Price must be greater than zero');
    }

    if (newPrice.getAmount() > 999999.99) {
      throw new InvalidPriceChangeError('Price cannot exceed $999,999.99');
    }

    if (newPrice.getCurrency() !== this.price.getCurrency()) {
      throw new InvalidPriceChangeError('Cannot change currency');
    }

    if (newPrice.equals(this.price)) {
      return; // No change needed
    }

    // Business rule: Price increases over 50% require approval
    const increasePercentage =
      ((newPrice.getAmount() - this.price.getAmount()) / this.price.getAmount()) * 100;
    if (increasePercentage > 50) {
      throw new InvalidPriceChangeError('Price increases over 50% require approval');
    }

    const previousPrice = this.price;

    const event = EventFactory.create(
      'ProductPriceChanged',
      this.id,
      'Product',
      {
        newPrice: newPrice.toJSON(),
        previousPrice: previousPrice.toJSON(),
        reason,
        changedBy,
      },
      {
        source: 'products-service',
        correlationId: metadata?.correlationId,
        userId: changedBy,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Update stock quantity
   */
  updateStock(
    newStock: StockQuantity,
    changeType: 'increase' | 'decrease' | 'adjustment',
    reason?: string,
    changedBy?: string,
    metadata?: { correlationId?: string }
  ): void {
    if (!this.isActive) {
      throw new ProductDeactivatedError();
    }

    const previousStock = this.stock;
    const changeAmount = newStock.getValue() - previousStock.getValue();

    if (changeAmount === 0) {
      return; // No change needed
    }

    // Check stock reservations don't exceed new stock level
    const totalReserved = this.getTotalReservedStock();
    if (newStock.getValue() < totalReserved) {
      throw new BusinessRuleError(
        `Cannot reduce stock below reserved quantity. Reserved: ${totalReserved}, New stock: ${newStock.getValue()}`
      );
    }

    const event = EventFactory.create(
      'ProductStockChanged',
      this.id,
      'Product',
      {
        newStock: newStock.getValue(),
        previousStock: previousStock.getValue(),
        changeAmount,
        changeType,
        reason,
        changedBy,
      },
      {
        source: 'products-service',
        correlationId: metadata?.correlationId,
        userId: changedBy,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Change product category
   */
  changeCategory(
    newCategory: ProductCategory,
    reason: string,
    changedBy: string,
    metadata?: { correlationId?: string }
  ): void {
    if (!this.isActive) {
      throw new ProductDeactivatedError();
    }

    if (newCategory.equals(this.category)) {
      return; // No change needed
    }

    const previousCategory = this.category;

    const event = EventFactory.create(
      'ProductCategoryChanged',
      this.id,
      'Product',
      {
        newCategory: newCategory.getValue(),
        previousCategory: previousCategory.getValue(),
        reason,
        changedBy,
      },
      {
        source: 'products-service',
        correlationId: metadata?.correlationId,
        userId: changedBy,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Reserve stock for an order
   */
  reserveStock(
    quantity: number,
    reservedFor: string,
    expiresAt?: Date,
    metadata?: { correlationId?: string }
  ): string {
    if (!this.isActive) {
      throw new ProductDeactivatedError();
    }

    if (quantity <= 0) {
      throw new ValidationError('Reservation quantity must be positive');
    }

    const availableStock = this.getAvailableStock();
    if (quantity > availableStock) {
      throw new InsufficientStockError(quantity, availableStock);
    }

    const reservationId = generateId();

    const event = EventFactory.create(
      'ProductStockReserved',
      this.id,
      'Product',
      {
        quantity,
        reservationId,
        reservedFor,
        expiresAt,
      },
      {
        source: 'products-service',
        correlationId: metadata?.correlationId,
      },
      this.version + 1
    );

    this.applyEvent(event);
    return reservationId;
  }

  /**
   * Release stock reservation
   */
  releaseReservation(
    reservationId: string,
    reason: 'expired' | 'cancelled' | 'fulfilled',
    metadata?: { correlationId?: string }
  ): void {
    const reservation = this.stockReservations.get(reservationId);
    if (!reservation) {
      throw new ValidationError(`Reservation ${reservationId} not found`);
    }

    const event = EventFactory.create(
      'ProductStockReservationReleased',
      this.id,
      'Product',
      {
        quantity: reservation.quantity,
        reservationId,
        reason,
      },
      {
        source: 'products-service',
        correlationId: metadata?.correlationId,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Deactivate product
   */
  deactivate(reason: string, deactivatedBy: string, metadata?: { correlationId?: string }): void {
    if (!this.isActive) {
      return; // Already deactivated
    }

    const event = EventFactory.create(
      'ProductDeactivated',
      this.id,
      'Product',
      {
        reason,
        deactivatedBy,
      },
      {
        source: 'products-service',
        correlationId: metadata?.correlationId,
        userId: deactivatedBy,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Reactivate product
   */
  reactivate(reason: string, reactivatedBy: string, metadata?: { correlationId?: string }): void {
    if (this.isActive) {
      return; // Already active
    }

    const event = EventFactory.create(
      'ProductReactivated',
      this.id,
      'Product',
      {
        reason,
        reactivatedBy,
      },
      {
        source: 'products-service',
        correlationId: metadata?.correlationId,
        userId: reactivatedBy,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Apply event data to aggregate state
   */
  protected override applyEventData(event: DomainEvent): void {
    switch (event.type) {
      case 'ProductCreated': {
        const data = event.data as ProductCreatedEvent['data'];
        this.name = data.name;
        this.description = data.description;
        this.price = Money.fromJSON(data.price);
        this.stock = StockQuantity.fromNumber(data.initialStock);
        this.sku = ProductSKU.fromString(data.sku);
        this.category = ProductCategory.fromString(data.category);
        this.tags = ProductTags.fromArray(data.tags);
        this.imageUrl = data.imageUrl;
        this.isActive = true;
        this.createdAt = event.occurredAt;
        this.updatedAt = event.occurredAt;
        break;
      }

      case 'ProductUpdated': {
        const data = event.data as ProductUpdatedEvent['data'];
        if (data.name !== undefined) this.name = data.name;
        if (data.description !== undefined) this.description = data.description;
        if (data.imageUrl !== undefined) this.imageUrl = data.imageUrl;
        if (data.tags !== undefined) this.tags = ProductTags.fromArray(data.tags);
        this.updatedAt = event.occurredAt;
        break;
      }

      case 'ProductPriceChanged': {
        const data = event.data as ProductPriceChangedEvent['data'];
        this.price = Money.fromJSON(data.newPrice);
        this.updatedAt = event.occurredAt;
        break;
      }

      case 'ProductStockChanged': {
        const data = event.data as ProductStockChangedEvent['data'];
        this.stock = StockQuantity.fromNumber(data.newStock);
        this.updatedAt = event.occurredAt;
        break;
      }

      case 'ProductCategoryChanged': {
        const data = event.data as ProductCategoryChangedEvent['data'];
        this.category = ProductCategory.fromString(data.newCategory);
        this.updatedAt = event.occurredAt;
        break;
      }

      case 'ProductDeactivated':
        this.isActive = false;
        this.updatedAt = event.occurredAt;
        break;

      case 'ProductReactivated':
        this.isActive = true;
        this.updatedAt = event.occurredAt;
        break;

      case 'ProductStockReserved': {
        const data = event.data as ProductStockReservedEvent['data'];
        this.stockReservations.set(data.reservationId, {
          id: data.reservationId,
          quantity: data.quantity,
          reservedFor: data.reservedFor,
          createdAt: event.occurredAt,
          expiresAt: data.expiresAt,
        });
        break;
      }

      case 'ProductStockReservationReleased': {
        const data = event.data as ProductStockReservationReleasedEvent['data'];
        this.stockReservations.delete(data.reservationId);
        break;
      }

      default:
        throw new Error(`Unknown event type: ${(event as { type: string }).type}`);
    }
  }

  // Getters
  getName(): string {
    return this.name;
  }

  getDescription(): string {
    return this.description;
  }

  getPrice(): Money {
    return this.price;
  }

  getStock(): StockQuantity {
    return this.stock;
  }

  getSKU(): ProductSKU {
    return this.sku;
  }

  getCategory(): ProductCategory {
    return this.category;
  }

  getTags(): ProductTags {
    return this.tags;
  }

  getImageUrl(): string | undefined {
    return this.imageUrl;
  }

  getIsActive(): boolean {
    return this.isActive;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  getStockReservations(): StockReservation[] {
    return Array.from(this.stockReservations.values());
  }

  /**
   * Get total reserved stock quantity
   */
  getTotalReservedStock(): number {
    return Array.from(this.stockReservations.values()).reduce(
      (total, reservation) => total + reservation.quantity,
      0
    );
  }

  /**
   * Get available stock (total stock - reserved stock)
   */
  getAvailableStock(): number {
    return this.stock.getValue() - this.getTotalReservedStock();
  }

  /**
   * Check if product is available for purchase
   */
  isAvailableForPurchase(): boolean {
    return this.isActive && this.getAvailableStock() > 0;
  }

  /**
   * Check if product is low on stock
   */
  isLowStock(): boolean {
    return this.getAvailableStock() < 10;
  }
}
