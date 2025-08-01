import { BusinessRuleError, ValidationError } from '@graphql-microservices/shared-errors';
import type { Product } from './product-aggregate';
import type { Money, ProductCategory, StockQuantity } from './value-objects';

/**
 * Inventory management policies and business rules
 */

/**
 * Stock level policies for different product categories
 */
export class StockLevelPolicy {
  private static readonly CATEGORY_MINIMUMS = new Map<string, number>([
    ['electronics', 20],
    ['clothing', 50],
    ['books', 100],
    ['consumables', 200],
    ['default', 10],
  ]);

  private static readonly CATEGORY_MAXIMUMS = new Map<string, number>([
    ['electronics', 1000],
    ['clothing', 2000],
    ['books', 5000],
    ['consumables', 10000],
    ['default', 1000],
  ]);

  /**
   * Get minimum stock level for product category
   */
  static getMinimumStockLevel(category: ProductCategory): number {
    return (
      StockLevelPolicy.CATEGORY_MINIMUMS.get(category.getValue()) ??
      (StockLevelPolicy.CATEGORY_MINIMUMS.get('default') || 10)
    );
  }

  /**
   * Get maximum stock level for product category
   */
  static getMaximumStockLevel(category: ProductCategory): number {
    return (
      StockLevelPolicy.CATEGORY_MAXIMUMS.get(category.getValue()) ??
      (StockLevelPolicy.CATEGORY_MAXIMUMS.get('default') || 1000)
    );
  }

  /**
   * Check if stock level is appropriate for category
   */
  static validateStockLevel(stock: StockQuantity, category: ProductCategory): void {
    const minimum = StockLevelPolicy.getMinimumStockLevel(category);
    const maximum = StockLevelPolicy.getMaximumStockLevel(category);

    if (stock.getValue() > maximum) {
      throw new BusinessRuleError(
        `Stock level ${stock.getValue()} exceeds maximum ${maximum} for category ${category.getDisplayName()}`
      );
    }

    // Note: Minimum is a warning, not an error - products can be temporarily low
    if (stock.getValue() < minimum) {
      console.warn(
        `Stock level ${stock.getValue()} is below recommended minimum ${minimum} for category ${category.getDisplayName()}`
      );
    }
  }

  /**
   * Check if stock needs replenishment
   */
  static needsReplenishment(stock: StockQuantity, category: ProductCategory): boolean {
    const minimum = StockLevelPolicy.getMinimumStockLevel(category);
    return stock.getValue() < minimum;
  }

  /**
   * Calculate suggested reorder quantity
   */
  static getSuggestedReorderQuantity(
    currentStock: StockQuantity,
    category: ProductCategory,
    averageDailySales: number = 1
  ): number {
    const minimum = StockLevelPolicy.getMinimumStockLevel(category);
    const maximum = StockLevelPolicy.getMaximumStockLevel(category);

    // Calculate for 30 days of sales plus buffer
    const suggestedStock = Math.max(
      minimum,
      Math.ceil(averageDailySales * 30 * 1.2) // 20% buffer
    );

    // Don't exceed maximum
    const targetStock = Math.min(suggestedStock, maximum);

    // Only suggest reorder if needed
    return Math.max(0, targetStock - currentStock.getValue());
  }
}

/**
 * Pricing policies and validation
 */
export class PricingPolicy {
  private static readonly CATEGORY_PRICE_RANGES = new Map<string, { min: number; max: number }>([
    ['electronics', { min: 10.0, max: 50000.0 }],
    ['clothing', { min: 5.0, max: 2000.0 }],
    ['books', { min: 0.99, max: 500.0 }],
    ['consumables', { min: 0.5, max: 1000.0 }],
    ['default', { min: 0.01, max: 999999.99 }],
  ]);

  /**
   * Validate price for product category
   */
  static validatePrice(price: Money, category: ProductCategory): void {
    const range =
      PricingPolicy.CATEGORY_PRICE_RANGES.get(category.getValue()) ??
      (PricingPolicy.CATEGORY_PRICE_RANGES.get('default') || { min: 0.01, max: 999999.99 });

    if (price.getAmount() < range.min) {
      throw new BusinessRuleError(
        `Price ${price.toString()} is below minimum ${range.min} for category ${category.getDisplayName()}`
      );
    }

    if (price.getAmount() > range.max) {
      throw new BusinessRuleError(
        `Price ${price.toString()} exceeds maximum ${range.max} for category ${category.getDisplayName()}`
      );
    }
  }

  /**
   * Calculate discount validation
   */
  static validateDiscount(originalPrice: Money, discountedPrice: Money): void {
    if (discountedPrice.isGreaterThan(originalPrice)) {
      throw new BusinessRuleError('Discounted price cannot be higher than original price');
    }

    const discountPercentage =
      ((originalPrice.getAmount() - discountedPrice.getAmount()) / originalPrice.getAmount()) * 100;

    // Maximum 80% discount allowed
    if (discountPercentage > 80) {
      throw new BusinessRuleError(
        `Discount of ${discountPercentage.toFixed(1)}% exceeds maximum allowed 80%`
      );
    }

    // Minimum $0.01 after discount
    if (discountedPrice.getAmount() < 0.01) {
      throw new BusinessRuleError('Discounted price cannot be less than $0.01');
    }
  }

  /**
   * Calculate suggested price based on cost and category
   */
  static calculateSuggestedPrice(cost: Money, category: ProductCategory): Money {
    // Different markup percentages by category
    const markupPercentages = new Map<string, number>([
      ['electronics', 1.3], // 30% markup
      ['clothing', 2.5], // 150% markup
      ['books', 1.4], // 40% markup
      ['consumables', 1.2], // 20% markup
      ['default', 1.5], // 50% markup
    ]);

    const markup =
      markupPercentages.get(category.getValue()) ?? (markupPercentages.get('default') || 1.5);
    const suggestedPrice = cost.multiply(markup);

    // Validate against category constraints
    PricingPolicy.validatePrice(suggestedPrice, category);

    return suggestedPrice;
  }
}

/**
 * Stock reservation policies
 */
export class ReservationPolicy {
  private static readonly DEFAULT_RESERVATION_DURATION_MINUTES = 30;
  private static readonly MAX_RESERVATION_DURATION_MINUTES = 24 * 60; // 24 hours
  private static readonly MAX_RESERVATIONS_PER_USER = 10;

  /**
   * Validate reservation request
   */
  static validateReservation(
    product: Product,
    quantity: number,
    reservedFor: string,
    durationMinutes?: number
  ): void {
    if (quantity <= 0) {
      throw new ValidationError('Reservation quantity must be positive');
    }

    if (!product.getIsActive()) {
      throw new BusinessRuleError('Cannot reserve stock for inactive product');
    }

    if (product.getAvailableStock() < quantity) {
      throw new BusinessRuleError(
        `Insufficient stock: requested ${quantity}, available ${product.getAvailableStock()}`
      );
    }

    // Check user's existing reservations
    const userReservations = product
      .getStockReservations()
      .filter((r) => r.reservedFor === reservedFor);

    if (userReservations.length >= ReservationPolicy.MAX_RESERVATIONS_PER_USER) {
      throw new BusinessRuleError(
        `User has reached maximum ${ReservationPolicy.MAX_RESERVATIONS_PER_USER} reservations`
      );
    }

    // Validate duration
    if (durationMinutes !== undefined) {
      if (
        durationMinutes <= 0 ||
        durationMinutes > ReservationPolicy.MAX_RESERVATION_DURATION_MINUTES
      ) {
        throw new ValidationError(
          `Reservation duration must be between 1 and ${ReservationPolicy.MAX_RESERVATION_DURATION_MINUTES} minutes`
        );
      }
    }
  }

  /**
   * Calculate reservation expiration
   */
  static calculateReservationExpiry(durationMinutes?: number): Date {
    const duration = durationMinutes ?? ReservationPolicy.DEFAULT_RESERVATION_DURATION_MINUTES;
    return new Date(Date.now() + duration * 60 * 1000);
  }

  /**
   * Check if reservation is expired
   */
  static isReservationExpired(expiresAt?: Date): boolean {
    if (!expiresAt) return false;
    return new Date() > expiresAt;
  }

  /**
   * Get expired reservations for a product
   */
  static getExpiredReservations(product: Product): string[] {
    return product
      .getStockReservations()
      .filter((r) => ReservationPolicy.isReservationExpired(r.expiresAt))
      .map((r) => r.id);
  }
}

/**
 * Product lifecycle policies
 */
export class ProductLifecyclePolicy {
  /**
   * Validate product creation
   */
  static validateProductCreation(
    name: string,
    description: string,
    price: Money,
    category: ProductCategory,
    initialStock: StockQuantity
  ): void {
    // Name validation
    if (!name || name.trim().length === 0) {
      throw new ValidationError('Product name is required');
    }

    if (name.length > 200) {
      throw new ValidationError('Product name cannot exceed 200 characters');
    }

    // Description validation
    if (!description || description.trim().length === 0) {
      throw new ValidationError('Product description is required');
    }

    if (description.length > 2000) {
      throw new ValidationError('Product description cannot exceed 2000 characters');
    }

    // Price validation
    PricingPolicy.validatePrice(price, category);

    // Stock validation
    StockLevelPolicy.validateStockLevel(initialStock, category);
  }

  /**
   * Validate product deactivation
   */
  static validateProductDeactivation(product: Product): void {
    if (!product.getIsActive()) {
      throw new BusinessRuleError('Product is already deactivated');
    }

    // Check for pending reservations
    const activeReservations = product
      .getStockReservations()
      .filter((r) => !ReservationPolicy.isReservationExpired(r.expiresAt));

    if (activeReservations.length > 0) {
      throw new BusinessRuleError(
        `Cannot deactivate product with ${activeReservations.length} active stock reservations`
      );
    }
  }

  /**
   * Validate product reactivation
   */
  static validateProductReactivation(product: Product): void {
    if (product.getIsActive()) {
      throw new BusinessRuleError('Product is already active');
    }

    // Ensure product meets minimum requirements for reactivation
    if (product.getName().trim().length === 0) {
      throw new BusinessRuleError('Cannot reactivate product without a name');
    }

    if (product.getDescription().trim().length === 0) {
      throw new BusinessRuleError('Cannot reactivate product without a description');
    }

    if (product.getPrice().getAmount() <= 0) {
      throw new BusinessRuleError('Cannot reactivate product with invalid price');
    }
  }
}

/**
 * Category management policies
 */
export class CategoryPolicy {
  private static readonly ALLOWED_CATEGORIES = new Set([
    'electronics',
    'clothing',
    'books',
    'consumables',
    'home-garden',
    'sports-outdoors',
    'toys-games',
    'health-beauty',
    'automotive',
    'tools',
    'uncategorized',
  ]);

  /**
   * Validate category
   */
  static validateCategory(category: ProductCategory): void {
    if (!CategoryPolicy.ALLOWED_CATEGORIES.has(category.getValue())) {
      throw new ValidationError(
        `Category '${category.getValue()}' is not allowed. Allowed categories: ${Array.from(CategoryPolicy.ALLOWED_CATEGORIES).join(', ')}`
      );
    }
  }

  /**
   * Get all allowed categories
   */
  static getAllowedCategories(): string[] {
    return Array.from(CategoryPolicy.ALLOWED_CATEGORIES).sort();
  }

  /**
   * Check if category change is allowed
   */
  static validateCategoryChange(
    product: Product,
    newCategory: ProductCategory,
    currentStock: StockQuantity
  ): void {
    CategoryPolicy.validateCategory(newCategory);

    // Validate stock level for new category
    StockLevelPolicy.validateStockLevel(currentStock, newCategory);

    // Validate price for new category
    PricingPolicy.validatePrice(product.getPrice(), newCategory);

    // Special rules for certain category changes
    if (product.getCategory().getValue() === 'electronics' && newCategory.getValue() === 'books') {
      throw new BusinessRuleError('Cannot change electronics to books category');
    }
  }
}

/**
 * Bulk operations policies
 */
export class BulkOperationPolicy {
  private static readonly MAX_BULK_OPERATIONS = 100;

  /**
   * Validate bulk stock update
   */
  static validateBulkStockUpdate(operations: Array<{ productId: string; quantity: number }>): void {
    if (operations.length === 0) {
      throw new ValidationError('No operations provided');
    }

    if (operations.length > BulkOperationPolicy.MAX_BULK_OPERATIONS) {
      throw new ValidationError(
        `Cannot process more than ${BulkOperationPolicy.MAX_BULK_OPERATIONS} operations at once`
      );
    }

    const uniqueProductIds = new Set(operations.map((op) => op.productId));
    if (uniqueProductIds.size !== operations.length) {
      throw new ValidationError('Duplicate product IDs found in bulk operation');
    }

    for (const operation of operations) {
      if (!operation.productId || typeof operation.productId !== 'string') {
        throw new ValidationError('Invalid product ID in bulk operation');
      }

      if (!Number.isInteger(operation.quantity) || operation.quantity < 0) {
        throw new ValidationError(
          `Invalid quantity ${operation.quantity} for product ${operation.productId}`
        );
      }
    }
  }

  /**
   * Validate bulk price update
   */
  static validateBulkPriceUpdate(
    operations: Array<{ productId: string; price: Money; category: ProductCategory }>
  ): void {
    if (operations.length === 0) {
      throw new ValidationError('No operations provided');
    }

    if (operations.length > BulkOperationPolicy.MAX_BULK_OPERATIONS) {
      throw new ValidationError(
        `Cannot process more than ${BulkOperationPolicy.MAX_BULK_OPERATIONS} operations at once`
      );
    }

    for (const operation of operations) {
      if (!operation.productId || typeof operation.productId !== 'string') {
        throw new ValidationError('Invalid product ID in bulk operation');
      }

      PricingPolicy.validatePrice(operation.price, operation.category);
    }
  }
}
