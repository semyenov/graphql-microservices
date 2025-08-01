import {
  OptimisticConcurrencyError,
  type PostgreSQLEventStore,
  type PostgreSQLOutboxStore,
} from '@graphql-microservices/event-sourcing';
import { Product } from '../domain/product-aggregate';
import { Money, ProductCategory, ProductSKU, ProductTags, StockQuantity } from '../domain/value-objects';
import {
  type ChangeProductCategoryCommand,
  type ChangeProductPriceCommand,
  type CommandResult,
  type CreateProductCommand,
  type DeactivateProductCommand,
  type ProductCommand,
  type ReactivateProductCommand,
  type ReleaseProductStockReservationCommand,
  type ReserveProductStockCommand,
  type UpdateProductCommand,
  type UpdateProductStockCommand,
  validateCommand,
} from './commands';

/**
 * Command handler interface
 */
export interface CommandHandler<T extends ProductCommand> {
  handle(command: T): Promise<CommandResult>;
}

/**
 * Base command handler with common functionality
 */
abstract class BaseCommandHandler<T extends ProductCommand> implements CommandHandler<T> {
  constructor(
    protected readonly eventStore: PostgreSQLEventStore,
    protected readonly outboxStore: PostgreSQLOutboxStore
  ) {}

  abstract handle(command: T): Promise<CommandResult>;

  /**
   * Load product aggregate from event store
   */
  protected async loadProduct(aggregateId: string): Promise<Product | null> {
    try {
      const events = await this.eventStore.readStream(aggregateId);

      if (events.length === 0) {
        return null;
      }

      return Product.fromEvents(events);
    } catch (error) {
      console.error(`Failed to load product ${aggregateId}:`, error);
      throw new Error(`Failed to load product: ${error}`);
    }
  }

  /**
   * Save aggregate events to event store and outbox
   */
  protected async saveEvents(
    product: Product,
    expectedVersion?: number,
    routingKey: string = 'product.events'
  ): Promise<void> {
    const uncommittedEvents = product.uncommittedEvents;

    if (uncommittedEvents.length === 0) {
      return;
    }

    try {
      // Save to event store with optimistic concurrency control
      await this.eventStore.appendToStream(product.id, uncommittedEvents.slice(), expectedVersion);

      // Add to outbox for reliable publishing
      await this.outboxStore.addEvents(uncommittedEvents.slice(), routingKey);

      // Mark events as committed
      product.markEventsAsCommitted();
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        throw new Error(`Concurrency conflict: Product was modified by another process`);
      }
      throw error;
    }
  }

  /**
   * Handle common command execution pattern
   */
  protected async executeCommand<R>(
    command: T,
    businessLogicFn: (product: Product) => Promise<R> | R
  ): Promise<CommandResult> {
    try {
      // Validate command
      validateCommand(command);

      // Load product
      const product = await this.loadProduct(command.aggregateId);

      if (!product) {
        throw new Error(`Product not found: ${command.aggregateId}`);
      }

      const initialVersion = product.version;

      // Execute business logic
      await businessLogicFn(product);

      // Save events
      await this.saveEvents(product, initialVersion);

      return {
        success: true,
        aggregateId: command.aggregateId,
        version: product.version,
        events: product.uncommittedEvents.slice(),
      };
    } catch (error) {
      console.error(`Command ${command.type} failed:`, error);

      return {
        success: false,
        aggregateId: command.aggregateId,
        version: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Create Product Command Handler
 */
export class CreateProductCommandHandler extends BaseCommandHandler<CreateProductCommand> {
  async handle(command: CreateProductCommand): Promise<CommandResult> {
    try {
      // Validate command
      validateCommand(command);

      // Check if product already exists
      const existingProduct = await this.loadProduct(command.aggregateId);
      if (existingProduct) {
        throw new Error(`Product already exists: ${command.aggregateId}`);
      }

      // Create value objects
      const price = Money.fromJSON(command.payload.price);
      const stock = StockQuantity.fromNumber(command.payload.initialStock);
      const sku = ProductSKU.fromString(command.payload.sku);
      const category = ProductCategory.fromString(command.payload.category);
      const tags = ProductTags.fromArray(command.payload.tags);

      // Create new product aggregate
      const product = Product.create(
        command.aggregateId,
        command.payload.name,
        command.payload.description,
        price,
        stock,
        sku,
        category,
        tags,
        command.payload.imageUrl,
        command.metadata
      );

      // Save events
      await this.saveEvents(product, 0); // New aggregate, expected version is 0

      return {
        success: true,
        aggregateId: command.aggregateId,
        version: product.version,
        events: product.uncommittedEvents.slice(),
      };
    } catch (error) {
      console.error(`CreateProduct command failed:`, error);

      return {
        success: false,
        aggregateId: command.aggregateId,
        version: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Update Product Command Handler
 */
export class UpdateProductCommandHandler extends BaseCommandHandler<UpdateProductCommand> {
  async handle(command: UpdateProductCommand): Promise<CommandResult> {
    return this.executeCommand(command, (product) => {
      product.updateProduct(
        command.payload.name,
        command.payload.description,
        command.payload.imageUrl,
        command.payload.tags,
        command.metadata
      );
    });
  }
}

/**
 * Change Product Price Command Handler
 */
export class ChangeProductPriceCommandHandler extends BaseCommandHandler<ChangeProductPriceCommand> {
  async handle(command: ChangeProductPriceCommand): Promise<CommandResult> {
    return this.executeCommand(command, (product) => {
      const newPrice = Money.fromJSON(command.payload.newPrice);
      product.changePrice(
        newPrice,
        command.payload.reason,
        command.payload.changedBy,
        command.metadata
      );
    });
  }
}

/**
 * Update Product Stock Command Handler
 */
export class UpdateProductStockCommandHandler extends BaseCommandHandler<UpdateProductStockCommand> {
  async handle(command: UpdateProductStockCommand): Promise<CommandResult> {
    return this.executeCommand(command, (product) => {
      const newStock = StockQuantity.fromNumber(command.payload.newStock);
      product.updateStock(
        newStock,
        command.payload.changeType,
        command.payload.reason,
        command.payload.changedBy,
        command.metadata
      );
    });
  }
}

/**
 * Change Product Category Command Handler
 */
export class ChangeProductCategoryCommandHandler extends BaseCommandHandler<ChangeProductCategoryCommand> {
  async handle(command: ChangeProductCategoryCommand): Promise<CommandResult> {
    return this.executeCommand(command, (product) => {
      const newCategory = ProductCategory.fromString(command.payload.newCategory);
      product.changeCategory(
        newCategory,
        command.payload.reason,
        command.payload.changedBy,
        command.metadata
      );
    });
  }
}

/**
 * Reserve Product Stock Command Handler
 */
export class ReserveProductStockCommandHandler extends BaseCommandHandler<ReserveProductStockCommand> {
  async handle(command: ReserveProductStockCommand): Promise<CommandResult> {
    return this.executeCommand(command, (product) => {
      const reservationId = product.reserveStock(
        command.payload.quantity,
        command.payload.reservedFor,
        command.payload.expiresAt,
        command.metadata
      );

      // Store reservation ID in the result
      return { reservationId };
    });
  }
}

/**
 * Release Product Stock Reservation Command Handler
 */
export class ReleaseProductStockReservationCommandHandler extends BaseCommandHandler<ReleaseProductStockReservationCommand> {
  async handle(command: ReleaseProductStockReservationCommand): Promise<CommandResult> {
    return this.executeCommand(command, (product) => {
      product.releaseReservation(
        command.payload.reservationId,
        command.payload.reason,
        command.metadata
      );
    });
  }
}

/**
 * Deactivate Product Command Handler
 */
export class DeactivateProductCommandHandler extends BaseCommandHandler<DeactivateProductCommand> {
  async handle(command: DeactivateProductCommand): Promise<CommandResult> {
    return this.executeCommand(command, (product) => {
      product.deactivate(command.payload.reason, command.payload.deactivatedBy, command.metadata);
    });
  }
}

/**
 * Reactivate Product Command Handler
 */
export class ReactivateProductCommandHandler extends BaseCommandHandler<ReactivateProductCommand> {
  async handle(command: ReactivateProductCommand): Promise<CommandResult> {
    return this.executeCommand(command, (product) => {
      product.reactivate(command.payload.reason, command.payload.reactivatedBy, command.metadata);
    });
  }
}

/**
 * Command Bus - Routes commands to appropriate handlers
 */
export class ProductCommandBus {
  private readonly handlers = new Map<string, CommandHandler<ProductCommand>>();

  constructor(eventStore: PostgreSQLEventStore, outboxStore: PostgreSQLOutboxStore) {
    // Register command handlers
    this.handlers.set('CreateProduct', new CreateProductCommandHandler(eventStore, outboxStore));
    this.handlers.set('UpdateProduct', new UpdateProductCommandHandler(eventStore, outboxStore));
    this.handlers.set(
      'ChangeProductPrice',
      new ChangeProductPriceCommandHandler(eventStore, outboxStore)
    );
    this.handlers.set(
      'UpdateProductStock',
      new UpdateProductStockCommandHandler(eventStore, outboxStore)
    );
    this.handlers.set(
      'ChangeProductCategory',
      new ChangeProductCategoryCommandHandler(eventStore, outboxStore)
    );
    this.handlers.set(
      'ReserveProductStock',
      new ReserveProductStockCommandHandler(eventStore, outboxStore)
    );
    this.handlers.set(
      'ReleaseProductStockReservation',
      new ReleaseProductStockReservationCommandHandler(eventStore, outboxStore)
    );
    this.handlers.set(
      'DeactivateProduct',
      new DeactivateProductCommandHandler(eventStore, outboxStore)
    );
    this.handlers.set(
      'ReactivateProduct',
      new ReactivateProductCommandHandler(eventStore, outboxStore)
    );
  }

  /**
   * Execute a command
   */
  async execute<T extends ProductCommand>(command: T): Promise<CommandResult> {
    const handler = this.handlers.get(command.type) as CommandHandler<T>;

    if (!handler) {
      throw new Error(`No handler found for command type: ${command.type}`);
    }

    try {
      return await handler.handle(command);
    } catch (error) {
      console.error(`Command execution failed:`, error);

      return {
        success: false,
        aggregateId: command.aggregateId,
        version: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Register a custom command handler
   */
  registerHandler<T extends ProductCommand>(commandType: string, handler: CommandHandler<T>): void {
    this.handlers.set(commandType, handler);
  }

  /**
   * Get all registered command types
   */
  getRegisteredCommands(): string[] {
    return Array.from(this.handlers.keys());
  }
}