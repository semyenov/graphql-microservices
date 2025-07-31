/**
 * Domain types for Products service with branded types for type safety
 */

import type {
  Brand,
} from '@graphql-microservices/shared-type-utils';
export { type Result, ok, err } from "@graphql-microservices/shared-type-utils";
  
// Branded primitive types specific to Products
export type ProductId = Brand<string, 'ProductId'>;
export type SKU = Brand<string, 'SKU'>;
export type ProductName = Brand<string, 'ProductName'>;
export type CategoryId = Brand<string, 'CategoryId'>;
export type CategoryName = Brand<string, 'CategoryName'>;
export type Price = Brand<number, 'Price'>;
export type Stock = Brand<number, 'Stock'>;
export type ImageUrl = Brand<string, 'ImageUrl'>;

// Type guards
export const isProductId = (value: unknown): value is ProductId =>
  typeof value === 'string' && value.length > 0;

export const isSKU = (value: unknown): value is SKU =>
  typeof value === 'string' && /^[A-Z0-9-]+$/i.test(value);

export const isProductName = (value: unknown): value is ProductName =>
  typeof value === 'string' && value.length > 0 && value.length <= 255;

export const isPrice = (value: unknown): value is Price =>
  typeof value === 'number' && value >= 0 && Number.isFinite(value);

export const isStock = (value: unknown): value is Stock =>
  typeof value === 'number' && value >= 0 && Number.isInteger(value);

export const isImageUrl = (value: unknown): value is ImageUrl =>
  typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));

// Type constructors with validation
export const createProductId = (value: string): Result<ProductId, ValidationError> => {
  if (!value || value.trim().length === 0) {
    return err(new ValidationError('ProductId cannot be empty', 'productId', value));
  }
  return ok(value as ProductId);
};

export const createSKU = (value: string): Result<SKU, ValidationError> => {
  if (!value || !/^[A-Z0-9-]+$/i.test(value)) {
    return err(new ValidationError('SKU must contain only alphanumeric characters and hyphens', 'sku', value));
  }
  return ok(value.toUpperCase() as SKU);
};

export const createProductName = (value: string): Result<ProductName, ValidationError> => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 255) {
    return err(new ValidationError('Product name must be between 1 and 255 characters', 'name', value));
  }
  return ok(trimmed as ProductName);
};

export const createPrice = (value: number): Result<Price, ValidationError> => {
  if (value < 0 || !Number.isFinite(value)) {
    return err(new ValidationError('Price must be a non-negative finite number', 'price', value));
  }
  // Round to 2 decimal places
  const rounded = Math.round(value * 100) / 100;
  return ok(rounded as Price);
};

export const createStock = (value: number): Result<Stock, ValidationError> => {
  if (value < 0 || !Number.isInteger(value)) {
    return err(new ValidationError('Stock must be a non-negative integer', 'stock', value));
  }
  return ok(value as Stock);
};

export const createImageUrl = (value: string): Result<ImageUrl, ValidationError> => {
  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    return err(new ValidationError('Image URL must start with http:// or https://', 'imageUrl', value));
  }
  try {
    new URL(value); // Validate URL format
    return ok(value as ImageUrl);
  } catch {
    return err(new ValidationError('Invalid URL format', 'imageUrl', value));
  }
};

// Cache key templates with type safety
import { CacheKeyBuilder, type CacheKeyTemplate } from '@graphql-microservices/shared-type-utils';

const productCache = new CacheKeyBuilder('product');
const productsCache = new CacheKeyBuilder('products');

export const cacheKey = {
  product: (id: ProductId): CacheKeyTemplate => productCache.key(id),
  productBySku: (sku: SKU): CacheKeyTemplate => productCache.keys('sku', sku),
  productsByCategory: (category: CategoryName): CacheKeyTemplate =>
    productsCache.keys('category', category),
  productsSearch: (query: string): CacheKeyTemplate =>
    productsCache.keys('search', encodeURIComponent(query)),
  productsList: (page: number, limit: number): CacheKeyTemplate =>
    productsCache.keys('list', String(page), String(limit)),
} as const;

// Domain value objects
export interface Money {
  amount: Price;
  currency: string;
}

export interface StockLevel {
  quantity: Stock;
  reserved: Stock;
  available: Stock;
}

export interface ProductDimensions {
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  unit: 'kg' | 'g' | 'cm' | 'm';
}

// Filter types
export interface ProductFilter {
  category?: CategoryName;
  minPrice?: Price;
  maxPrice?: Price;
  inStock?: boolean;
  isActive?: boolean;
  tags?: string[];
}

// Sort types
export type SortField = 'name' | 'price' | 'createdAt' | 'updatedAt' | 'stock';
export type SortDirection = 'ASC' | 'DESC';

export interface ProductSort {
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

// Error types
export interface DomainError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ValidationError extends DomainError {
  code: 'VALIDATION_ERROR';
  field?: string;
  value?: unknown;
}

export interface BusinessRuleError extends DomainError {
  code: 'BUSINESS_RULE_VIOLATION';
  rule: string;
}

export interface NotFoundError extends DomainError {
  code: 'NOT_FOUND';
  resource: string;
  id: string;
}
