import type { DomainEvent } from '@graphql-microservices/event-sourcing';
import { generateId } from '@graphql-microservices/shared-errors';
import { z } from 'zod';

/**
 * Command metadata for tracking and auditing
 */
export interface CommandMetadata {
  correlationId?: string;
  userId?: string;
  timestamp?: Date;
}

/**
 * Base command interface
 */
export interface Command {
  readonly id: string;
  readonly type: string;
  readonly aggregateId: string;
  readonly payload: Record<string, unknown>;
  readonly metadata: CommandMetadata;
}

/**
 * Command execution result
 */
export interface CommandResult {
  success: boolean;
  aggregateId: string;
  version: number;
  events?: DomainEvent[];
  error?: string;
}

/**
 * Product Commands
 */

// Create Product Command
export interface CreateProductCommand extends Command {
  type: 'CreateProduct';
  payload: {
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

// Update Product Command
export interface UpdateProductCommand extends Command {
  type: 'UpdateProduct';
  payload: {
    name?: string;
    description?: string;
    imageUrl?: string;
    tags?: string[];
  };
}

// Change Product Price Command
export interface ChangeProductPriceCommand extends Command {
  type: 'ChangeProductPrice';
  payload: {
    newPrice: { amount: number; currency: string };
    reason: string;
    changedBy: string;
  };
}

// Update Product Stock Command
export interface UpdateProductStockCommand extends Command {
  type: 'UpdateProductStock';
  payload: {
    newStock: number;
    changeType: 'increase' | 'decrease' | 'adjustment';
    reason?: string;
    changedBy?: string;
  };
}

// Change Product Category Command
export interface ChangeProductCategoryCommand extends Command {
  type: 'ChangeProductCategory';
  payload: {
    newCategory: string;
    reason: string;
    changedBy: string;
  };
}

// Reserve Product Stock Command
export interface ReserveProductStockCommand extends Command {
  type: 'ReserveProductStock';
  payload: {
    quantity: number;
    reservedFor: string; // order ID or user ID
    expiresAt?: Date;
  };
}

// Release Product Stock Reservation Command
export interface ReleaseProductStockReservationCommand extends Command {
  type: 'ReleaseProductStockReservation';
  payload: {
    reservationId: string;
    reason: 'expired' | 'cancelled' | 'fulfilled';
  };
}

// Deactivate Product Command
export interface DeactivateProductCommand extends Command {
  type: 'DeactivateProduct';
  payload: {
    reason: string;
    deactivatedBy: string;
  };
}

// Reactivate Product Command
export interface ReactivateProductCommand extends Command {
  type: 'ReactivateProduct';
  payload: {
    reason: string;
    reactivatedBy: string;
  };
}

// Union type for all product commands
export type ProductCommand =
  | CreateProductCommand
  | UpdateProductCommand
  | ChangeProductPriceCommand
  | UpdateProductStockCommand
  | ChangeProductCategoryCommand
  | ReserveProductStockCommand
  | ReleaseProductStockReservationCommand
  | DeactivateProductCommand
  | ReactivateProductCommand;

/**
 * Command validation schemas using Zod
 */

const moneySchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().length(3, 'Currency must be a 3-letter code'),
});

export const createProductCommandSchema = z.object({
  id: z.uuid(),
  type: z.literal('CreateProduct'),
  aggregateId: z.uuid(),
  payload: z.object({
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    price: moneySchema,
    initialStock: z.number().int().nonnegative(),
    sku: z.string().regex(/^[A-Z]{2,10}-\d{4,10}$/, 'Invalid SKU format'),
    category: z.string().min(1),
    tags: z.array(z.string()).max(10, 'Maximum 10 tags allowed'),
    imageUrl: z.string().url().optional(),
  }),
  metadata: z.object({
    correlationId: z.uuid().optional(),
    userId: z.uuid().optional(),
    timestamp: z.date().optional(),
  }),
});

export const updateProductCommandSchema = z.object({
  id: z.uuid(),
  type: z.literal('UpdateProduct'),
  aggregateId: z.uuid(),
  payload: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(2000).optional(),
    imageUrl: z.string().url().optional(),
    tags: z.array(z.string()).max(10).optional(),
  }),
  metadata: z.object({
    correlationId: z.uuid().optional(),
    userId: z.uuid().optional(),
    timestamp: z.date().optional(),
  }),
});

export const changeProductPriceCommandSchema = z.object({
  id: z.uuid(),
  type: z.literal('ChangeProductPrice'),
  aggregateId: z.uuid(),
  payload: z.object({
    newPrice: moneySchema,
    reason: z.string().min(1).max(500),
    changedBy: z.uuid(),
  }),
  metadata: z.object({
    correlationId: z.uuid().optional(),
    userId: z.uuid().optional(),
    timestamp: z.date().optional(),
  }),
});

export const updateProductStockCommandSchema = z.object({
  id: z.uuid(),
  type: z.literal('UpdateProductStock'),
  aggregateId: z.uuid(),
  payload: z.object({
    newStock: z.number().int().nonnegative(),
    changeType: z.enum(['increase', 'decrease', 'adjustment']),
    reason: z.string().max(500).optional(),
    changedBy: z.uuid().optional(),
  }),
  metadata: z.object({
    correlationId: z.uuid().optional(),
    userId: z.uuid().optional(),
    timestamp: z.date().optional(),
  }),
});

export const changeProductCategoryCommandSchema = z.object({
  id: z.uuid(),
  type: z.literal('ChangeProductCategory'),
  aggregateId: z.uuid(),
  payload: z.object({
    newCategory: z.string().min(1),
    reason: z.string().min(1).max(500),
    changedBy: z.uuid(),
  }),
  metadata: z.object({
    correlationId: z.uuid().optional(),
    userId: z.uuid().optional(),
    timestamp: z.date().optional(),
  }),
});

export const reserveProductStockCommandSchema = z.object({
  id: z.uuid(),
  type: z.literal('ReserveProductStock'),
  aggregateId: z.uuid(),
  payload: z.object({
    quantity: z.number().int().positive(),
    reservedFor: z.uuid(),
    expiresAt: z.date().optional(),
  }),
  metadata: z.object({
    correlationId: z.uuid().optional(),
    userId: z.uuid().optional(),
    timestamp: z.date().optional(),
  }),
});

export const releaseProductStockReservationCommandSchema = z.object({
  id: z.uuid(),
  type: z.literal('ReleaseProductStockReservation'),
  aggregateId: z.uuid(),
  payload: z.object({
    reservationId: z.uuid(),
    reason: z.enum(['expired', 'cancelled', 'fulfilled']),
  }),
  metadata: z.object({
    correlationId: z.uuid().optional(),
    userId: z.uuid().optional(),
    timestamp: z.date().optional(),
  }),
});

export const deactivateProductCommandSchema = z.object({
  id: z.uuid(),
  type: z.literal('DeactivateProduct'),
  aggregateId: z.uuid(),
  payload: z.object({
    reason: z.string().min(1).max(500),
    deactivatedBy: z.uuid(),
  }),
  metadata: z.object({
    correlationId: z.uuid().optional(),
    userId: z.uuid().optional(),
    timestamp: z.date().optional(),
  }),
});

export const reactivateProductCommandSchema = z.object({
  id: z.uuid(),
  type: z.literal('ReactivateProduct'),
  aggregateId: z.uuid(),
  payload: z.object({
    reason: z.string().min(1).max(500),
    reactivatedBy: z.uuid(),
  }),
  metadata: z.object({
    correlationId: z.uuid().optional(),
    userId: z.uuid().optional(),
    timestamp: z.date().optional(),
  }),
});

/**
 * Command validation function
 */
export function validateCommand(command: ProductCommand): void {
  const schemas: Record<ProductCommand['type'], z.ZodSchema> = {
    CreateProduct: createProductCommandSchema,
    UpdateProduct: updateProductCommandSchema,
    ChangeProductPrice: changeProductPriceCommandSchema,
    UpdateProductStock: updateProductStockCommandSchema,
    ChangeProductCategory: changeProductCategoryCommandSchema,
    ReserveProductStock: reserveProductStockCommandSchema,
    ReleaseProductStockReservation: releaseProductStockReservationCommandSchema,
    DeactivateProduct: deactivateProductCommandSchema,
    ReactivateProduct: reactivateProductCommandSchema,
  };

  const schema = schemas[command.type];
  if (!schema) {
    throw new Error(`Unknown command type: ${command.type}`);
  }

  schema.parse(command);
}

/**
 * Command factory functions
 */

export function createProductCommand(
  aggregateId: string,
  payload: CreateProductCommand['payload'],
  metadata?: CommandMetadata
): CreateProductCommand {
  return {
    id: generateId(),
    type: 'CreateProduct',
    aggregateId,
    payload,
    metadata: {
      timestamp: new Date(),
      ...metadata,
    },
  };
}

export function updateProductCommand(
  aggregateId: string,
  payload: UpdateProductCommand['payload'],
  metadata?: CommandMetadata
): UpdateProductCommand {
  return {
    id: generateId(),
    type: 'UpdateProduct',
    aggregateId,
    payload,
    metadata: {
      timestamp: new Date(),
      ...metadata,
    },
  };
}

export function changeProductPriceCommand(
  aggregateId: string,
  payload: ChangeProductPriceCommand['payload'],
  metadata?: CommandMetadata
): ChangeProductPriceCommand {
  return {
    id: generateId(),
    type: 'ChangeProductPrice',
    aggregateId,
    payload,
    metadata: {
      timestamp: new Date(),
      ...metadata,
    },
  };
}

export function updateProductStockCommand(
  aggregateId: string,
  payload: UpdateProductStockCommand['payload'],
  metadata?: CommandMetadata
): UpdateProductStockCommand {
  return {
    id: generateId(),
    type: 'UpdateProductStock',
    aggregateId,
    payload,
    metadata: {
      timestamp: new Date(),
      ...metadata,
    },
  };
}

export function changeProductCategoryCommand(
  aggregateId: string,
  payload: ChangeProductCategoryCommand['payload'],
  metadata?: CommandMetadata
): ChangeProductCategoryCommand {
  return {
    id: generateId(),
    type: 'ChangeProductCategory',
    aggregateId,
    payload,
    metadata: {
      timestamp: new Date(),
      ...metadata,
    },
  };
}

export function reserveProductStockCommand(
  aggregateId: string,
  payload: ReserveProductStockCommand['payload'],
  metadata?: CommandMetadata
): ReserveProductStockCommand {
  return {
    id: generateId(),
    type: 'ReserveProductStock',
    aggregateId,
    payload,
    metadata: {
      timestamp: new Date(),
      ...metadata,
    },
  };
}

export function releaseProductStockReservationCommand(
  aggregateId: string,
  payload: ReleaseProductStockReservationCommand['payload'],
  metadata?: CommandMetadata
): ReleaseProductStockReservationCommand {
  return {
    id: generateId(),
    type: 'ReleaseProductStockReservation',
    aggregateId,
    payload,
    metadata: {
      timestamp: new Date(),
      ...metadata,
    },
  };
}

export function deactivateProductCommand(
  aggregateId: string,
  payload: DeactivateProductCommand['payload'],
  metadata?: CommandMetadata
): DeactivateProductCommand {
  return {
    id: generateId(),
    type: 'DeactivateProduct',
    aggregateId,
    payload,
    metadata: {
      timestamp: new Date(),
      ...metadata,
    },
  };
}

export function reactivateProductCommand(
  aggregateId: string,
  payload: ReactivateProductCommand['payload'],
  metadata?: CommandMetadata
): ReactivateProductCommand {
  return {
    id: generateId(),
    type: 'ReactivateProduct',
    aggregateId,
    payload,
    metadata: {
      timestamp: new Date(),
      ...metadata,
    },
  };
}
