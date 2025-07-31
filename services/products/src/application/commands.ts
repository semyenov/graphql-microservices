import { z } from 'zod';
import type { CommandMetadata, ProductId } from './types';
import type { Result } from '@graphql-microservices/shared-type-utils';

/**
 * Command type literals
 */
export const CommandType = {
  CREATE_PRODUCT: 'CreateProduct',
  UPDATE_PRODUCT: 'UpdateProduct',
  UPDATE_PRODUCT_STOCK: 'UpdateProductStock',
  BULK_UPDATE_STOCK: 'BulkUpdateStock',
  ACTIVATE_PRODUCT: 'ActivateProduct',
  DEACTIVATE_PRODUCT: 'DeactivateProduct',
  ADJUST_STOCK: 'AdjustStock',
  RESERVE_STOCK: 'ReserveStock',
  RELEASE_STOCK: 'ReleaseStock',
} as const;

export type CommandType = (typeof CommandType)[keyof typeof CommandType];

/**
 * Command payloads
 */
export interface CreateProductPayload {
  name: string;
  description: string;
  price: number;
  stock: number;
  sku: string;
  category: string;
  tags?: string[];
  imageUrl?: string;
}

export interface UpdateProductPayload {
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  tags?: string[];
  imageUrl?: string | null;
}

export interface UpdateProductStockPayload {
  stock: number;
  reason?: string;
}

export interface BulkStockUpdate {
  productId: ProductId;
  stock: number;
}

export interface BulkUpdateStockPayload {
  updates: BulkStockUpdate[];
  reason?: string;
}

export interface ActivateProductPayload {
  activatedBy: string;
  reason?: string;
}

export interface DeactivateProductPayload {
  deactivatedBy: string;
  reason: string;
}

export interface AdjustStockPayload {
  adjustment: number; // Can be positive or negative
  reason: string;
  adjustedBy: string;
}

export interface ReserveStockPayload {
  quantity: number;
  orderId: string;
  expiresAt?: Date;
}

export interface ReleaseStockPayload {
  quantity: number;
  orderId: string;
  reason?: string;
}

/**
 * Base command structure
 */
export interface BaseCommand<TType extends CommandType, TPayload> {
  readonly type: TType;
  readonly productId: ProductId;
  readonly payload: TPayload;
  readonly metadata?: CommandMetadata;
}

/**
 * Command type definitions using discriminated unions
 */
export type CreateProductCommand = BaseCommand<
  typeof CommandType.CREATE_PRODUCT,
  CreateProductPayload
> & {
  productId: ProductId; // New product ID
};

export type UpdateProductCommand = BaseCommand<
  typeof CommandType.UPDATE_PRODUCT,
  UpdateProductPayload
>;
export type UpdateProductStockCommand = BaseCommand<
  typeof CommandType.UPDATE_PRODUCT_STOCK,
  UpdateProductStockPayload
>;
export type BulkUpdateStockCommand = Omit<
  BaseCommand<typeof CommandType.BULK_UPDATE_STOCK, BulkUpdateStockPayload>,
  'productId'
> & {
  productId?: never; // This command doesn't have a single productId
};
export type ActivateProductCommand = BaseCommand<
  typeof CommandType.ACTIVATE_PRODUCT,
  ActivateProductPayload
>;
export type DeactivateProductCommand = BaseCommand<
  typeof CommandType.DEACTIVATE_PRODUCT,
  DeactivateProductPayload
>;
export type AdjustStockCommand = BaseCommand<typeof CommandType.ADJUST_STOCK, AdjustStockPayload>;
export type ReserveStockCommand = BaseCommand<
  typeof CommandType.RESERVE_STOCK,
  ReserveStockPayload
>;
export type ReleaseStockCommand = BaseCommand<
  typeof CommandType.RELEASE_STOCK,
  ReleaseStockPayload
>;

/**
 * Union type for all product commands
 */
export type ProductCommand =
  | CreateProductCommand
  | UpdateProductCommand
  | UpdateProductStockCommand
  | BulkUpdateStockCommand
  | ActivateProductCommand
  | DeactivateProductCommand
  | AdjustStockCommand
  | ReserveStockCommand
  | ReleaseStockCommand;

/**
 * Command validation schemas
 */
export const createProductCommandSchema = z.object({
  type: z.literal(CommandType.CREATE_PRODUCT),
  productId: z.string().uuid(),
  payload: z.object({
    name: z.string().min(1).max(255),
    description: z.string().min(1),
    price: z.number().min(0).finite(),
    stock: z.number().int().min(0),
    sku: z.string().regex(/^[A-Z0-9-]+$/i),
    category: z.string().min(1).max(100),
    tags: z.array(z.string()).optional(),
    imageUrl: z.string().url().optional(),
  }),
  metadata: z.any().optional(),
});

export const updateProductCommandSchema = z.object({
  type: z.literal(CommandType.UPDATE_PRODUCT),
  productId: z.string().uuid(),
  payload: z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().min(1).optional(),
    price: z.number().min(0).finite().optional(),
    category: z.string().min(1).max(100).optional(),
    tags: z.array(z.string()).optional(),
    imageUrl: z.string().url().nullable().optional(),
  }),
  metadata: z.any().optional(),
});

export const updateProductStockCommandSchema = z.object({
  type: z.literal(CommandType.UPDATE_PRODUCT_STOCK),
  productId: z.string().uuid(),
  payload: z.object({
    stock: z.number().int().min(0),
    reason: z.string().optional(),
  }),
  metadata: z.any().optional(),
});

export const bulkUpdateStockCommandSchema = z.object({
  type: z.literal(CommandType.BULK_UPDATE_STOCK),
  payload: z.object({
    updates: z.array(
      z.object({
        productId: z.string().uuid(),
        stock: z.number().int().min(0),
      })
    ),
    reason: z.string().optional(),
  }),
  metadata: z.any().optional(),
});

export const activateProductCommandSchema = z.object({
  type: z.literal(CommandType.ACTIVATE_PRODUCT),
  productId: z.string().uuid(),
  payload: z.object({
    activatedBy: z.string(),
    reason: z.string().optional(),
  }),
  metadata: z.any().optional(),
});

export const deactivateProductCommandSchema = z.object({
  type: z.literal(CommandType.DEACTIVATE_PRODUCT),
  productId: z.string().uuid(),
  payload: z.object({
    deactivatedBy: z.string(),
    reason: z.string().min(1),
  }),
  metadata: z.any().optional(),
});

export const adjustStockCommandSchema = z.object({
  type: z.literal(CommandType.ADJUST_STOCK),
  productId: z.string().uuid(),
  payload: z.object({
    adjustment: z.number().int(),
    reason: z.string().min(1),
    adjustedBy: z.string(),
  }),
  metadata: z.any().optional(),
});

export const reserveStockCommandSchema = z.object({
  type: z.literal(CommandType.RESERVE_STOCK),
  productId: z.string().uuid(),
  payload: z.object({
    quantity: z.number().int().positive(),
    orderId: z.string(),
    expiresAt: z.date().optional(),
  }),
  metadata: z.any().optional(),
});

export const releaseStockCommandSchema = z.object({
  type: z.literal(CommandType.RELEASE_STOCK),
  productId: z.string().uuid(),
  payload: z.object({
    quantity: z.number().int().positive(),
    orderId: z.string(),
    reason: z.string().optional(),
  }),
  metadata: z.any().optional(),
});

/**
 * Command validation schema map
 */
export const commandSchemas = {
  [CommandType.CREATE_PRODUCT]: createProductCommandSchema,
  [CommandType.UPDATE_PRODUCT]: updateProductCommandSchema,
  [CommandType.UPDATE_PRODUCT_STOCK]: updateProductStockCommandSchema,
  [CommandType.BULK_UPDATE_STOCK]: bulkUpdateStockCommandSchema,
  [CommandType.ACTIVATE_PRODUCT]: activateProductCommandSchema,
  [CommandType.DEACTIVATE_PRODUCT]: deactivateProductCommandSchema,
  [CommandType.ADJUST_STOCK]: adjustStockCommandSchema,
  [CommandType.RESERVE_STOCK]: reserveStockCommandSchema,
  [CommandType.RELEASE_STOCK]: releaseStockCommandSchema,
} as const;

/**
 * Type helper to get command from type
 */
export type CommandFromType<T extends CommandType> = Extract<ProductCommand, { type: T }>;

/**
 * Type-safe command validation
 */
export function validateCommand<T extends ProductCommand>(command: T): T {
  const schema = commandSchemas[command.type];
  if (!schema) {
    throw new Error(`Unknown command type: ${command.type}`);
  }

  const result = schema.safeParse(command);

  if (!result.success) {
    const messages = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Command validation failed: ${messages}`);
  }

  return result.data as T;
}

/**
 * Command factory functions for type-safe creation
 */
export const createCommand = {
  createProduct: (
    productId: ProductId,
    payload: CreateProductPayload,
    metadata?: CommandMetadata
  ): CreateProductCommand => ({
    type: CommandType.CREATE_PRODUCT,
    productId,
    payload,
    metadata,
  }),

  updateProduct: (
    productId: ProductId,
    payload: UpdateProductPayload,
    metadata?: CommandMetadata
  ): UpdateProductCommand => ({
    type: CommandType.UPDATE_PRODUCT,
    productId,
    payload,
    metadata,
  }),

  updateProductStock: (
    productId: ProductId,
    payload: UpdateProductStockPayload,
    metadata?: CommandMetadata
  ): UpdateProductStockCommand => ({
    type: CommandType.UPDATE_PRODUCT_STOCK,
    productId,
    payload,
    metadata,
  }),

  bulkUpdateStock: (
    payload: BulkUpdateStockPayload,
    metadata?: CommandMetadata
  ): BulkUpdateStockCommand => ({
    type: CommandType.BULK_UPDATE_STOCK,
    payload,
    metadata,
  }),

  activateProduct: (
    productId: ProductId,
    payload: ActivateProductPayload,
    metadata?: CommandMetadata
  ): ActivateProductCommand => ({
    type: CommandType.ACTIVATE_PRODUCT,
    productId,
    payload,
    metadata,
  }),

  deactivateProduct: (
    productId: ProductId,
    payload: DeactivateProductPayload,
    metadata?: CommandMetadata
  ): DeactivateProductCommand => ({
    type: CommandType.DEACTIVATE_PRODUCT,
    productId,
    payload,
    metadata,
  }),

  adjustStock: (
    productId: ProductId,
    payload: AdjustStockPayload,
    metadata?: CommandMetadata
  ): AdjustStockCommand => ({
    type: CommandType.ADJUST_STOCK,
    productId,
    payload,
    metadata,
  }),

  reserveStock: (
    productId: ProductId,
    payload: ReserveStockPayload,
    metadata?: CommandMetadata
  ): ReserveStockCommand => ({
    type: CommandType.RESERVE_STOCK,
    productId,
    payload,
    metadata,
  }),

  releaseStock: (
    productId: ProductId,
    payload: ReleaseStockPayload,
    metadata?: CommandMetadata
  ): ReleaseStockCommand => ({
    type: CommandType.RELEASE_STOCK,
    productId,
    payload,
    metadata,
  }),
} as const;

/**
 * Command result with proper error types
 */
export type CommandResult = Result<
  {
    productId: ProductId;
    success: true;
    updatedFields?: string[];
  },
  {
    code:
      | 'VALIDATION_ERROR'
      | 'NOT_FOUND'
      | 'BUSINESS_RULE_VIOLATION'
      | 'INTERNAL_ERROR'
      | 'INSUFFICIENT_STOCK';
    message: string;
    details?: unknown;
  }
>;

/**
 * Type guard for command types
 */
export const isCommand = {
  createProduct: (command: ProductCommand): command is CreateProductCommand =>
    command.type === CommandType.CREATE_PRODUCT,
  updateProduct: (command: ProductCommand): command is UpdateProductCommand =>
    command.type === CommandType.UPDATE_PRODUCT,
  updateProductStock: (command: ProductCommand): command is UpdateProductStockCommand =>
    command.type === CommandType.UPDATE_PRODUCT_STOCK,
  bulkUpdateStock: (command: ProductCommand): command is BulkUpdateStockCommand =>
    command.type === CommandType.BULK_UPDATE_STOCK,
  activateProduct: (command: ProductCommand): command is ActivateProductCommand =>
    command.type === CommandType.ACTIVATE_PRODUCT,
  deactivateProduct: (command: ProductCommand): command is DeactivateProductCommand =>
    command.type === CommandType.DEACTIVATE_PRODUCT,
  adjustStock: (command: ProductCommand): command is AdjustStockCommand =>
    command.type === CommandType.ADJUST_STOCK,
  reserveStock: (command: ProductCommand): command is ReserveStockCommand =>
    command.type === CommandType.RESERVE_STOCK,
  releaseStock: (command: ProductCommand): command is ReleaseStockCommand =>
    command.type === CommandType.RELEASE_STOCK,
} as const;
