import type { CacheService } from '@graphql-microservices/shared-cache';
import type { PrismaClient } from '../../generated/prisma';
import {
  publishProductCreated,
  publishProductDeactivated,
  publishProductStockChanged,
  publishProductUpdated,
} from '../subscriptions';
import {
  type ActivateProductCommand,
  type BulkUpdateStockCommand,
  type CommandResult,
  CommandType,
  type CreateProductCommand,
  type DeactivateProductCommand,
  type ProductCommand,
  type UpdateProductCommand,
  type UpdateProductStockCommand,
  validateCommand,
} from './commands';
import { cacheKey, type ProductId } from './types';
import { err as ResultErr, ok as ResultOk } from '@graphql-microservices/shared-type-utils';

/**
 * Command handler interface
 */
export interface CommandHandler<TCommand extends ProductCommand = ProductCommand> {
  readonly commandType: TCommand['type'];
  handle(command: TCommand): Promise<CommandResult>;
  canHandle(command: ProductCommand): command is TCommand;
}

/**
 * Base command handler with common functionality
 */
abstract class BaseCommandHandler<TCommand extends ProductCommand = ProductCommand>
  implements CommandHandler<TCommand>
{
  abstract readonly commandType: TCommand['type'];

  constructor(
    protected readonly prisma: PrismaClient,
    protected readonly cacheService: CacheService,
    protected readonly pubsub: any // PubSub type
  ) {}

  abstract handle(command: TCommand): Promise<CommandResult>;

  canHandle(command: ProductCommand): command is TCommand {
    return command.type === this.commandType;
  }

  /**
   * Invalidate product cache
   */
  protected async invalidateProductCache(productId: ProductId, sku?: string): Promise<void> {
    const keys = [cacheKey.product(productId), sku && cacheKey.productBySku(sku as any)].filter(
      Boolean
    ) as string[];

    await Promise.all(keys.map((key) => this.cacheService.delete(key)));
  }

  /**
   * Invalidate list caches
   */
  protected async invalidateListCaches(): Promise<void> {
    // In production, you might want to be more selective
    await this.cacheService.clearPattern('products:*');
  }
}

/**
 * Create Product Command Handler
 */
export class CreateProductCommandHandler extends BaseCommandHandler<CreateProductCommand> {
  readonly commandType = CommandType.CREATE_PRODUCT as const;

  async handle(command: CreateProductCommand): Promise<CommandResult> {
    try {
      validateCommand(command);

      // Check if SKU already exists
      const existingProduct = await this.prisma.product.findUnique({
        where: { sku: command.payload.sku },
      });

      if (existingProduct) {
        return ResultErr({
          code: 'BUSINESS_RULE_VIOLATION',
          message: 'Product with this SKU already exists',
          details: { sku: command.payload.sku },
        });
      }

      // Create product
      const product = await this.prisma.product.create({
        data: {
          id: command.productId,
          name: command.payload.name,
          description: command.payload.description,
          price: command.payload.price,
          stock: command.payload.stock,
          sku: command.payload.sku,
          category: command.payload.category,
          tags: command.payload.tags || [],
          imageUrl: command.payload.imageUrl,
          isActive: true,
        },
      });

      // Publish event
      await publishProductCreated(this.pubsub, {
        product: {
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          stock: product.stock,
          sku: product.sku,
          category: product.category,
          tags: product.tags,
          imageUrl: product.imageUrl,
          isActive: product.isActive,
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
        },
      });

      // Invalidate list caches
      await this.invalidateListCaches();

      return ResultOk({
        productId: product.id as ProductId,
        success: true,
      });
    } catch (error) {
      console.error('CreateProduct command failed:', error);
      return ResultErr({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      });
    }
  }
}

/**
 * Update Product Command Handler
 */
export class UpdateProductCommandHandler extends BaseCommandHandler<UpdateProductCommand> {
  readonly commandType = CommandType.UPDATE_PRODUCT as const;

  async handle(command: UpdateProductCommand): Promise<CommandResult> {
    try {
      validateCommand(command);

      // Check if product exists
      const existingProduct = await this.prisma.product.findUnique({
        where: { id: command.productId },
      });

      if (!existingProduct) {
        return ResultErr({
          code: 'NOT_FOUND',
          message: 'Product not found',
          details: { productId: command.productId },
        });
      }

      // Update product
      const product = await this.prisma.product.update({
        where: { id: command.productId },
        data: {
          name: command.payload.name,
          description: command.payload.description,
          price: command.payload.price,
          category: command.payload.category,
          tags: command.payload.tags,
          imageUrl: command.payload.imageUrl,
          updatedAt: new Date(),
        },
      });

      // Publish event
      await publishProductUpdated(this.pubsub, {
        product: {
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          stock: product.stock,
          sku: product.sku,
          category: product.category,
          tags: product.tags,
          imageUrl: product.imageUrl,
          isActive: product.isActive,
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
        },
        updatedFields: Object.keys(command.payload).filter(
          (key) => command.payload[key as keyof typeof command.payload] !== undefined
        ),
      });

      // Invalidate caches
      await this.invalidateProductCache(command.productId, existingProduct.sku);
      await this.invalidateListCaches();

      return ResultOk({
        productId: product.id as ProductId,
        success: true,
        updatedFields: Object.keys(command.payload).filter(
          (key) => command.payload[key as keyof typeof command.payload] !== undefined
        ),
      });
    } catch (error) {
      console.error('UpdateProduct command failed:', error);
      return ResultErr({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      });
    }
  }
}

/**
 * Update Product Stock Command Handler
 */
export class UpdateProductStockCommandHandler extends BaseCommandHandler<UpdateProductStockCommand> {
  readonly commandType = CommandType.UPDATE_PRODUCT_STOCK as const;

  async handle(command: UpdateProductStockCommand): Promise<CommandResult> {
    try {
      validateCommand(command);

      // Check if product exists
      const existingProduct = await this.prisma.product.findUnique({
        where: { id: command.productId },
      });

      if (!existingProduct) {
        return ResultErr({
          code: 'NOT_FOUND',
          message: 'Product not found',
          details: { productId: command.productId },
        });
      }

      // Update stock
      const product = await this.prisma.product.update({
        where: { id: command.productId },
        data: {
          stock: command.payload.stock,
          updatedAt: new Date(),
        },
      });

      // Publish event
      await publishProductStockChanged(this.pubsub, {
        product: {
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          stock: product.stock,
          sku: product.sku,
          category: product.category,
          tags: product.tags,
          imageUrl: product.imageUrl,
          isActive: product.isActive,
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
        },
        previousStock: existingProduct.stock,
        newStock: product.stock,
        changeReason: command.payload.reason,
      });

      // Invalidate caches
      await this.invalidateProductCache(command.productId, existingProduct.sku);
      await this.invalidateListCaches();

      return ResultOk({
        productId: product.id as ProductId,
        success: true,
        updatedFields: ['stock'],
      });
    } catch (error) {
      console.error('UpdateProductStock command failed:', error);
      return ResultErr({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      });
    }
  }
}

/**
 * Bulk Update Stock Command Handler
 */
export class BulkUpdateStockCommandHandler extends BaseCommandHandler<BulkUpdateStockCommand> {
  readonly commandType = CommandType.BULK_UPDATE_STOCK as const;

  async handle(command: BulkUpdateStockCommand): Promise<CommandResult> {
    try {
      validateCommand(command);

      const results = [];

      // Process each update in a transaction
      await this.prisma.$transaction(async (tx) => {
        for (const update of command.payload.updates) {
          const product = await tx.product.update({
            where: { id: update.productId },
            data: {
              stock: update.stock,
              updatedAt: new Date(),
            },
          });

          // Publish event for each product
          await publishProductStockChanged(this.pubsub, {
            product: {
              id: product.id,
              name: product.name,
              description: product.description,
              price: product.price,
              stock: product.stock,
              sku: product.sku,
              category: product.category,
              tags: product.tags,
              imageUrl: product.imageUrl,
              isActive: product.isActive,
              createdAt: product.createdAt.toISOString(),
              updatedAt: product.updatedAt.toISOString(),
            },
            previousStock: 0, // Would need to query this beforehand
            newStock: product.stock,
            changeReason: command.payload.reason,
          });

          results.push(product);
        }
      });

      // Invalidate all caches
      await this.cacheService.clearPattern('product*');

      return ResultOk({
        productId: '' as ProductId, // Bulk operation doesn't have single ID
        success: true,
        updatedFields: ['stock'],
      });
    } catch (error) {
      console.error('BulkUpdateStock command failed:', error);
      return ResultErr({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      });
    }
  }
}

/**
 * Activate Product Command Handler
 */
export class ActivateProductCommandHandler extends BaseCommandHandler<ActivateProductCommand> {
  readonly commandType = CommandType.ACTIVATE_PRODUCT as const;

  async handle(command: ActivateProductCommand): Promise<CommandResult> {
    try {
      validateCommand(command);

      // Check if product exists
      const existingProduct = await this.prisma.product.findUnique({
        where: { id: command.productId },
      });

      if (!existingProduct) {
        return ResultErr({
          code: 'NOT_FOUND',
          message: 'Product not found',
          details: { productId: command.productId },
        });
      }

      if (existingProduct.isActive) {
        return ResultErr({
          code: 'BUSINESS_RULE_VIOLATION',
          message: 'Product is already active',
          details: { productId: command.productId },
        });
      }

      // Activate product
      const product = await this.prisma.product.update({
        where: { id: command.productId },
        data: {
          isActive: true,
          updatedAt: new Date(),
        },
      });

      // Publish event
      await publishProductUpdated(this.pubsub, {
        product: {
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          stock: product.stock,
          sku: product.sku,
          category: product.category,
          tags: product.tags,
          imageUrl: product.imageUrl,
          isActive: product.isActive,
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
        },
        updatedFields: ['isActive'],
      });

      // Invalidate caches
      await this.invalidateProductCache(command.productId, existingProduct.sku);
      await this.invalidateListCaches();

      return ResultOk({
        productId: product.id as ProductId,
        success: true,
        updatedFields: ['isActive'],
      });
    } catch (error) {
      console.error('ActivateProduct command failed:', error);
      return ResultErr({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      });
    }
  }
}

/**
 * Deactivate Product Command Handler
 */
export class DeactivateProductCommandHandler extends BaseCommandHandler<DeactivateProductCommand> {
  readonly commandType = CommandType.DEACTIVATE_PRODUCT as const;

  async handle(command: DeactivateProductCommand): Promise<CommandResult> {
    try {
      validateCommand(command);

      // Check if product exists
      const existingProduct = await this.prisma.product.findUnique({
        where: { id: command.productId },
      });

      if (!existingProduct) {
        return ResultErr({
          code: 'NOT_FOUND',
          message: 'Product not found',
          details: { productId: command.productId },
        });
      }

      if (!existingProduct.isActive) {
        return ResultErr({
          code: 'BUSINESS_RULE_VIOLATION',
          message: 'Product is already inactive',
          details: { productId: command.productId },
        });
      }

      // Deactivate product
      const product = await this.prisma.product.update({
        where: { id: command.productId },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

      // Publish event
      await publishProductDeactivated(this.pubsub, {
        product: {
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          stock: product.stock,
          sku: product.sku,
          category: product.category,
          tags: product.tags,
          imageUrl: product.imageUrl,
          isActive: product.isActive,
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
        },
        reason: command.payload.reason,
        deactivatedBy: command.payload.deactivatedBy,
      });

      // Invalidate caches
      await this.invalidateProductCache(command.productId, existingProduct.sku);
      await this.invalidateListCaches();

      return ResultOk({
        productId: product.id as ProductId,
        success: true,
        updatedFields: ['isActive'],
      });
    } catch (error) {
      console.error('DeactivateProduct command failed:', error);
      return ResultErr({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      });
    }
  }
}

/**
 * Command Bus - Routes commands to appropriate handlers
 */
export class ProductCommandBus {
  private readonly handlers: Map<CommandType, CommandHandler<any>> = new Map();

  constructor(prisma: PrismaClient, cacheService: CacheService, pubsub: any) {
    // Register command handlers
    const handlers: CommandHandler<any>[] = [
      new CreateProductCommandHandler(prisma, cacheService, pubsub),
      new UpdateProductCommandHandler(prisma, cacheService, pubsub),
      new UpdateProductStockCommandHandler(prisma, cacheService, pubsub),
      new BulkUpdateStockCommandHandler(prisma, cacheService, pubsub),
      new ActivateProductCommandHandler(prisma, cacheService, pubsub),
      new DeactivateProductCommandHandler(prisma, cacheService, pubsub),
    ];

    handlers.forEach((handler) => {
      this.handlers.set(handler.commandType, handler);
    });
  }

  /**
   * Execute a command
   */
  async execute<TCommand extends ProductCommand = ProductCommand>(
    command: TCommand
  ): Promise<CommandResult> {
    const handler = this.handlers.get(command.type) as CommandHandler<TCommand>;

    if (!handler) {
      throw new Error(`No handler found for command type: ${command.type}`);
    }

    try {
      return await handler.handle(command);
    } catch (error) {
      console.error(`Command execution failed:`, error);

      return ResultErr({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: { commandType: command.type },
      });
    }
  }

  /**
   * Get all registered command types
   */
  getRegisteredCommands(): string[] {
    return Array.from(this.handlers.keys());
  }
}
