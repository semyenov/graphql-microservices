import { ValidationError } from '@graphql-microservices/shared-errors';

/**
 * Money value object for handling currency and amounts
 */
export class Money {
  private readonly amount: number;
  private readonly currency: string;

  constructor(amount: number, currency: string = 'USD') {
    if (amount < 0) {
      throw new ValidationError('Amount cannot be negative', [
        { field: 'amount', message: 'Must be non-negative', value: amount },
      ]);
    }

    if (!currency || currency.length !== 3) {
      throw new ValidationError('Invalid currency code', [
        { field: 'currency', message: 'Must be a valid 3-letter currency code', value: currency },
      ]);
    }

    this.amount = Math.round(amount * 100) / 100; // Round to 2 decimal places
    this.currency = currency.toUpperCase();
  }

  getAmount(): number {
    return this.amount;
  }

  getCurrency(): string {
    return this.currency;
  }

  /**
   * Add two money values (must be same currency)
   */
  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new ValidationError('Cannot add different currencies', [
        {
          field: 'currency',
          message: 'Currencies must match',
          value: `${this.currency} vs ${other.currency}`,
        },
      ]);
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  /**
   * Subtract two money values (must be same currency)
   */
  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new ValidationError('Cannot subtract different currencies', [
        {
          field: 'currency',
          message: 'Currencies must match',
          value: `${this.currency} vs ${other.currency}`,
        },
      ]);
    }
    return new Money(this.amount - other.amount, this.currency);
  }

  /**
   * Multiply money by a scalar
   */
  multiply(multiplier: number): Money {
    if (multiplier < 0) {
      throw new ValidationError('Multiplier cannot be negative', [
        { field: 'multiplier', message: 'Must be non-negative', value: multiplier },
      ]);
    }
    return new Money(this.amount * multiplier, this.currency);
  }

  /**
   * Check if this money is greater than other
   */
  isGreaterThan(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new ValidationError('Cannot compare different currencies');
    }
    return this.amount > other.amount;
  }

  /**
   * Check if this money is equal to other
   */
  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  /**
   * Convert to string representation
   */
  toString(): string {
    return `${this.amount} ${this.currency}`;
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON(): { amount: number; currency: string } {
    return {
      amount: this.amount,
      currency: this.currency,
    };
  }

  /**
   * Create Money from plain object
   */
  static fromJSON(data: { amount: number; currency: string }): Money {
    return new Money(data.amount, data.currency);
  }

  /**
   * Zero money value
   */
  static zero(currency: string = 'USD'): Money {
    return new Money(0, currency);
  }
}

/**
 * Product SKU value object with validation
 */
export class ProductSKU {
  private readonly value: string;

  constructor(sku: string) {
    if (!sku || typeof sku !== 'string') {
      throw new ValidationError('SKU is required', [
        { field: 'sku', message: 'Must be a non-empty string', value: sku },
      ]);
    }

    const normalizedSku = sku.trim().toUpperCase();

    // SKU format: 2-3 letter prefix, hyphen, 4-8 alphanumeric characters
    const skuPattern = /^[A-Z]{2,3}-[A-Z0-9]{4,8}$/;
    if (!skuPattern.test(normalizedSku)) {
      throw new ValidationError('Invalid SKU format', [
        {
          field: 'sku',
          message: 'Must follow format: XX-XXXX or XXX-XXXXXXXX (letters-alphanumeric)',
          value: sku,
        },
      ]);
    }

    this.value = normalizedSku;
  }

  getValue(): string {
    return this.value;
  }

  /**
   * Get the category prefix from SKU
   */
  getCategoryPrefix(): string {
    return this.value.split('-')[0] || '';
  }

  /**
   * Get the product code from SKU
   */
  getProductCode(): string {
    return this.value.split('-')[1] || '';
  }

  equals(other: ProductSKU): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }

  static fromString(sku: string): ProductSKU {
    return new ProductSKU(sku);
  }
}

/**
 * Product Category value object
 */
export class ProductCategory {
  private readonly value: string;

  constructor(category: string) {
    if (!category || typeof category !== 'string') {
      throw new ValidationError('Category is required', [
        { field: 'category', message: 'Must be a non-empty string', value: category },
      ]);
    }

    const normalizedCategory = category.trim().toLowerCase();
    if (normalizedCategory.length < 2 || normalizedCategory.length > 50) {
      throw new ValidationError('Invalid category length', [
        { field: 'category', message: 'Must be between 2 and 50 characters', value: category },
      ]);
    }

    // Only letters, numbers, spaces, and hyphens allowed
    const categoryPattern = /^[a-z0-9\s-]+$/;
    if (!categoryPattern.test(normalizedCategory)) {
      throw new ValidationError('Invalid category format', [
        {
          field: 'category',
          message: 'Can only contain letters, numbers, spaces, and hyphens',
          value: category,
        },
      ]);
    }

    this.value = normalizedCategory;
  }

  getValue(): string {
    return this.value;
  }

  /**
   * Get display name (title case)
   */
  getDisplayName(): string {
    return this.value
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  equals(other: ProductCategory): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }

  static fromString(category: string): ProductCategory {
    return new ProductCategory(category);
  }
}

/**
 * Stock Quantity value object with validation
 */
export class StockQuantity {
  private readonly value: number;

  constructor(quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new ValidationError('Invalid stock quantity', [
        { field: 'quantity', message: 'Must be a non-negative integer', value: quantity },
      ]);
    }

    this.value = quantity;
  }

  getValue(): number {
    return this.value;
  }

  /**
   * Check if stock is available for a given quantity
   */
  canFulfill(requestedQuantity: number): boolean {
    return this.value >= requestedQuantity;
  }

  /**
   * Check if stock is low (less than 10 units)
   */
  isLow(): boolean {
    return this.value < 10;
  }

  /**
   * Check if out of stock
   */
  isOutOfStock(): boolean {
    return this.value === 0;
  }

  /**
   * Add stock
   */
  add(quantity: number): StockQuantity {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new ValidationError('Invalid quantity to add', [
        { field: 'quantity', message: 'Must be a non-negative integer', value: quantity },
      ]);
    }
    return new StockQuantity(this.value + quantity);
  }

  /**
   * Remove stock (returns new instance)
   */
  subtract(quantity: number): StockQuantity {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new ValidationError('Invalid quantity to subtract', [
        { field: 'quantity', message: 'Must be a non-negative integer', value: quantity },
      ]);
    }

    if (quantity > this.value) {
      throw new ValidationError('Insufficient stock', [
        {
          field: 'quantity',
          message: `Cannot subtract ${quantity} from ${this.value}`,
          value: quantity,
        },
      ]);
    }

    return new StockQuantity(this.value - quantity);
  }

  equals(other: StockQuantity): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value.toString();
  }

  toJSON(): number {
    return this.value;
  }

  static fromNumber(quantity: number): StockQuantity {
    return new StockQuantity(quantity);
  }

  static zero(): StockQuantity {
    return new StockQuantity(0);
  }
}

/**
 * Product Tags value object (collection of unique tags)
 */
export class ProductTags {
  private readonly tags: Set<string>;

  constructor(tags: string[] = []) {
    this.tags = new Set();

    for (const tag of tags) {
      if (typeof tag !== 'string' || tag.trim().length === 0) {
        throw new ValidationError('Invalid tag', [
          { field: 'tag', message: 'Must be a non-empty string', value: tag },
        ]);
      }

      const normalizedTag = tag.trim().toLowerCase();

      if (normalizedTag.length > 30) {
        throw new ValidationError('Tag too long', [
          { field: 'tag', message: 'Must be 30 characters or less', value: tag },
        ]);
      }

      this.tags.add(normalizedTag);
    }

    if (this.tags.size > 20) {
      throw new ValidationError('Too many tags', [
        { field: 'tags', message: 'Maximum 20 tags allowed', value: tags.length },
      ]);
    }
  }

  getTags(): string[] {
    return Array.from(this.tags).sort();
  }

  hasTag(tag: string): boolean {
    return this.tags.has(tag.trim().toLowerCase());
  }

  addTag(tag: string): ProductTags {
    const newTags = this.getTags();
    newTags.push(tag);
    return new ProductTags(newTags);
  }

  removeTag(tag: string): ProductTags {
    const newTags = this.getTags().filter((t) => t !== tag.trim().toLowerCase());
    return new ProductTags(newTags);
  }

  size(): number {
    return this.tags.size;
  }

  isEmpty(): boolean {
    return this.tags.size === 0;
  }

  toString(): string {
    return this.getTags().join(', ');
  }

  toJSON(): string[] {
    return this.getTags();
  }

  static fromArray(tags: string[]): ProductTags {
    return new ProductTags(tags);
  }

  static empty(): ProductTags {
    return new ProductTags([]);
  }
}
