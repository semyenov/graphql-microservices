import type { CacheService } from '@graphql-microservices/shared-cache';
import type { PubSubService } from '@graphql-microservices/shared-pubsub';
import { ok, err, isOk, isErr, type Result, wrap } from '@graphql-microservices/shared-type-utils';
import type { PrismaClient, Product as PrismaProduct } from '../../generated/prisma';
import { ProductCommandBus } from './command-handlers';
import {
  type BulkStockUpdate,
  type CommandResult,
  createCommand,
  type ProductCommand,
} from './commands';
import {
  createQuery,
  type PaginatedResult,
  type ProductStockInfo,
  type ProductViewModel,
  type QueryResult,
} from './queries';
import { ProductQueryBus } from './query-handlers';
import {
  type CategoryName,
  type CommandMetadata,
  cacheKey,
  createImageUrl,
  createPrice,
  createProductId,
  createProductName,
  createSKU,
  createStock,
  type ImageUrl,
  type Pagination,
  type Price,
  type ProductFilter,
  type ProductId,
  type ProductName,
  type ProductSort,
  type SKU,
  type Stock,
} from './types';

/**
 * Service error types
 */
export interface ServiceError {
  code: 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'INSUFFICIENT_STOCK' | 'INTERNAL';
  message: string;
  details?: unknown;
}

/**
 * Product service interface
 */
export interface IProductService {
  // Query operations
  getProductById(id: string): Promise<Result<ProductViewModel | null, ServiceError>>;
  getProductBySku(sku: string): Promise<Result<ProductViewModel | null, ServiceError>>;
  getAllProducts(
    filter?: ProductFilter,
    pagination?: Pagination,
    sorting?: ProductSort
  ): Promise<Result<PaginatedResult<ProductViewModel>, ServiceError>>;
  getProductsByCategory(
    category: string,
    filter?: Omit<ProductFilter, 'category'>,
    pagination?: Pagination,
    sorting?: ProductSort
  ): Promise<Result<PaginatedResult<ProductViewModel>, ServiceError>>;
  searchProducts(
    searchTerm: string,
    filter?: ProductFilter,
    pagination?: Pagination
  ): Promise<Result<PaginatedResult<ProductViewModel>, ServiceError>>;
  getLowStockProducts(
    threshold: number,
    pagination?: Pagination
  ): Promise<Result<PaginatedResult<ProductViewModel>, ServiceError>>;
  getProductStockInfo(id: string): Promise<Result<ProductStockInfo | null, ServiceError>>;

  // Command operations
  createProduct(
    input: CreateProductInput,
    metadata?: CommandMetadata
  ): Promise<Result<ProductViewModel, ServiceError>>;
  updateProduct(
    id: string,
    input: UpdateProductInput,
    metadata?: CommandMetadata
  ): Promise<Result<ProductViewModel, ServiceError>>;
  updateProductStock(
    id: string,
    stock: number,
    reason?: string,
    metadata?: CommandMetadata
  ): Promise<Result<ProductViewModel, ServiceError>>;
  bulkUpdateStock(
    updates: Array<{ productId: string; stock: number }>,
    reason?: string,
    metadata?: CommandMetadata
  ): Promise<Result<Array<{ productId: string; success: boolean; error?: string }>, ServiceError>>;
  activateProduct(
    id: string,
    activatedBy: string,
    reason?: string,
    metadata?: CommandMetadata
  ): Promise<Result<ProductViewModel, ServiceError>>;
  deactivateProduct(
    id: string,
    deactivatedBy: string,
    reason: string,
    metadata?: CommandMetadata
  ): Promise<Result<ProductViewModel, ServiceError>>;
}

// Input types
export interface CreateProductInput {
  name: string;
  description: string;
  price: number;
  stock: number;
  sku: string;
  category: string;
  tags?: string[];
  imageUrl?: string;
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  tags?: string[];
  imageUrl?: string | null;
}

/**
 * Product service implementation with Result pattern
 */
export class ProductService implements IProductService {
  private readonly commandBus: ProductCommandBus;
  private readonly queryBus: ProductQueryBus;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
    private readonly pubsubService: PubSubService
  ) {
    const pubsub = pubsubService.getPubSub();
    this.commandBus = new ProductCommandBus(prisma, cacheService, pubsub);
    this.queryBus = new ProductQueryBus(prisma, cacheService);
  }

  /**
   * Get product by ID
   */
  async getProductById(id: string): Promise<Result<ProductViewModel | null, ServiceError>> {
    try {
      const productIdResult = createProductId(id);
      if (isErr(productIdResult)) {
        return err({
          code: 'VALIDATION',
          message: 'Invalid product ID',
          details: { field: 'id' },
        });
      }

      const query = createQuery.getProductById(productIdResult.value);
      const result = await this.queryBus.execute(query);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      return ok(result.value.data);
    } catch (error) {
      console.error('GetProductById failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to get product',
        details: error,
      });
    }
  }

  /**
   * Get product by SKU
   */
  async getProductBySku(sku: string): Promise<Result<ProductViewModel | null, ServiceError>> {
    try {
      const skuResult = createSKU(sku);
      if (isErr(skuResult)) {
        return err({
          code: 'VALIDATION',
          message: 'Invalid SKU',
          details: { field: 'sku' },
        });
      }

      const query = createQuery.getProductBySku(skuResult.value);
      const result = await this.queryBus.execute(query);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      return ok(result.value.data);
    } catch (error) {
      console.error('GetProductBySku failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to get product by SKU',
        details: error,
      });
    }
  }

  /**
   * Get all products with filtering and pagination
   */
  async getAllProducts(
    filter?: ProductFilter,
    pagination?: Pagination,
    sorting?: ProductSort
  ): Promise<Result<PaginatedResult<ProductViewModel>, ServiceError>> {
    try {
      const query = createQuery.getAllProducts({ filter, pagination, sorting });
      const result = await this.queryBus.execute(query);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      return ok(result.value.data as PaginatedResult<ProductViewModel>);
    } catch (error) {
      console.error('GetAllProducts failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to get products',
        details: error,
      });
    }
  }

  /**
   * Get products by category
   */
  async getProductsByCategory(
    category: string,
    filter?: Omit<ProductFilter, 'category'>,
    pagination?: Pagination,
    sorting?: ProductSort
  ): Promise<Result<PaginatedResult<ProductViewModel>, ServiceError>> {
    try {
      const query = createQuery.getProductsByCategory(category as CategoryName, {
        filter,
        pagination,
        sorting,
      });
      const result = await this.queryBus.execute(query);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      return ok(result.value.data as PaginatedResult<ProductViewModel>);
    } catch (error) {
      console.error('GetProductsByCategory failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to get products by category',
        details: error,
      });
    }
  }

  /**
   * Search products
   */
  async searchProducts(
    searchTerm: string,
    filter?: ProductFilter,
    pagination?: Pagination
  ): Promise<Result<PaginatedResult<ProductViewModel>, ServiceError>> {
    try {
      const query = createQuery.searchProducts({ searchTerm, filter, pagination });
      const result = await this.queryBus.execute(query);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      return ok(result.value.data as PaginatedResult<ProductViewModel>);
    } catch (error) {
      console.error('SearchProducts failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to search products',
        details: error,
      });
    }
  }

  /**
   * Get low stock products
   */
  async getLowStockProducts(
    threshold: number,
    pagination?: Pagination
  ): Promise<Result<PaginatedResult<ProductViewModel>, ServiceError>> {
    try {
      const stockResult = createStock(threshold);
      if (isErr(stockResult)) {
        return err({
          code: 'VALIDATION',
          message: 'Invalid stock threshold',
          details: { field: 'threshold' },
        });
      }

      const query = createQuery.getLowStockProducts(stockResult.value, pagination);
      const result = await this.queryBus.execute(query);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      return ok(result.value.data as PaginatedResult<ProductViewModel>);
    } catch (error) {
      console.error('GetLowStockProducts failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to get low stock products',
        details: error,
      });
    }
  }

  /**
   * Get product stock info
   */
  async getProductStockInfo(id: string): Promise<Result<ProductStockInfo | null, ServiceError>> {
    try {
      const productIdResult = createProductId(id);
      if (isErr(productIdResult)) {
        return err({
          code: 'VALIDATION',
          message: 'Invalid product ID',
          details: { field: 'id' },
        });
      }

      const query = createQuery.getProductStockInfo(productIdResult.value);
      const result = await this.queryBus.execute(query);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      return ok(result.value.data as ProductStockInfo | null);
    } catch (error) {
      console.error('GetProductStockInfo failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to get product stock info',
        details: error,
      });
    }
  }

  /**
   * Create a new product
   */
  async createProduct(
    input: CreateProductInput,
    metadata?: CommandMetadata
  ): Promise<Result<ProductViewModel, ServiceError>> {
    try {
      // Validate inputs
      const validations = await this.validateCreateProductInput(input);
      if (isErr(validations)) {
        return validations;
      }

      const { productId, sku, productName, price, stock, imageUrl } = validations.value;

      // Check if SKU already exists
      const existingProduct = await this.prisma.product.findUnique({
        where: { sku: sku },
      });

      if (existingProduct) {
        return err({
          code: 'CONFLICT',
          message: 'Product with this SKU already exists',
          details: { field: 'sku', existingId: existingProduct.id },
        });
      }

      // Create product command
      const command = createCommand.createProduct(
        productId,
        {
          name: productName,
          description: input.description,
          price: price,
          stock: stock,
          sku: sku,
          category: input.category,
          tags: input.tags,
          imageUrl: imageUrl,
        },
        metadata
      );

      const result = await this.commandBus.execute(command);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      // Get created product
      const productResult = await this.getProductById(productId);
      if (isErr(productResult) || !productResult.value) {
        return err({
          code: 'INTERNAL',
          message: 'Failed to retrieve created product',
        });
      }

      return ok(productResult.value);
    } catch (error) {
      console.error('CreateProduct failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to create product',
        details: error,
      });
    }
  }

  /**
   * Update a product
   */
  async updateProduct(
    id: string,
    input: UpdateProductInput,
    metadata?: CommandMetadata
  ): Promise<Result<ProductViewModel, ServiceError>> {
    try {
      const productIdResult = createProductId(id);
      if (isErr(productIdResult)) {
        return err({
          code: 'VALIDATION',
          message: (productIdResult.error as any).message || 'Invalid product ID',
          details: { field: 'id' },
        });
      }

      // Validate inputs
      const validations = await this.validateUpdateProductInput(input);
      if (isErr(validations)) {
        return validations;
      }

      // Check if product exists
      const existingProduct = await this.prisma.product.findUnique({
        where: { id },
      });

      if (!existingProduct) {
        return err({
          code: 'NOT_FOUND',
          message: 'Product not found',
          details: { id },
        });
      }

      // Create update command
      const command = createCommand.updateProduct(productIdResult.value, validations.value, metadata);
      const result = await this.commandBus.execute(command);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      // Get updated product
      const productResult = await this.getProductById(id);
      if (isErr(productResult) || !productResult.value) {
        return err({
          code: 'INTERNAL',
          message: 'Failed to retrieve updated product',
        });
      }

      return ok(productResult.value);
    } catch (error) {
      console.error('UpdateProduct failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to update product',
        details: error,
      });
    }
  }

  /**
   * Update product stock
   */
  async updateProductStock(
    id: string,
    stock: number,
    reason?: string,
    metadata?: CommandMetadata
  ): Promise<Result<ProductViewModel, ServiceError>> {
    try {
      const productIdResult = createProductId(id);
      if (isErr(productIdResult)) {
        return err({
          code: 'VALIDATION',
          message: 'Invalid product ID',
          details: { field: 'id' },
        });
      }

      const stockResult = createStock(stock);
      if (isErr(stockResult)) {
        return err({
          code: 'VALIDATION',
          message: 'Invalid stock',
          details: { field: 'stock' },
        });
      }

      // Check if product exists
      const existingProduct = await this.prisma.product.findUnique({
        where: { id },
      });

      if (!existingProduct) {
        return err({
          code: 'NOT_FOUND',
          message: 'Product not found',
          details: { id },
        });
      }

      // Create command
      const command = createCommand.updateProductStock(
        productIdResult.value,
        { stock: stockResult.value, reason },
        metadata
      );

      const result = await this.commandBus.execute(command);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      // Get updated product
      const productResult = await this.getProductById(id);
      if (isErr(productResult) || !productResult.value) {
        return err({
          code: 'INTERNAL',
          message: 'Failed to retrieve updated product',
        });
      }

      return ok(productResult.value);
    } catch (error) {
      console.error('UpdateProductStock failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to update product stock',
        details: error,
      });
    }
  }

  /**
   * Bulk update stock
   */
  async bulkUpdateStock(
    updates: Array<{ productId: string; stock: number }>,
    reason?: string,
    metadata?: CommandMetadata
  ): Promise<Result<Array<{ productId: string; success: boolean; error?: string }>, ServiceError>> {
    try {
      // Validate all updates
      const validatedUpdates: BulkStockUpdate[] = [];
      const results: Array<{ productId: string; success: boolean; error?: string }> = [];

      for (const update of updates) {
        const productIdResult = createProductId(update.productId);
        const stockResult = createStock(update.stock);

        if (isErr(productIdResult) || isErr(stockResult)) {
          results.push({
            productId: update.productId,
            success: false,
            error: isErr(productIdResult) ? 'Invalid product ID' : 'Invalid stock',
          });
          continue;
        }

        validatedUpdates.push({
          productId: productIdResult.value,
          stock: stockResult.value,
        });
      }

      if (validatedUpdates.length === 0) {
        return ok(results);
      }

      // Create command
      const command = createCommand.bulkUpdateStock(
        { updates: validatedUpdates, reason },
        metadata
      );

      const result = await this.commandBus.execute(command);

      if (isErr(result)) {
        // Mark all as failed
        for (const update of validatedUpdates) {
          results.push({
            productId: update.productId,
            success: false,
            error: result.error.message,
          });
        }
      } else {
        // Mark all as successful
        for (const update of validatedUpdates) {
          results.push({
            productId: update.productId,
            success: true,
          });
        }
      }

      return ok(results);
    } catch (error) {
      console.error('BulkUpdateStock failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to bulk update stock',
        details: error,
      });
    }
  }

  /**
   * Activate a product
   */
  async activateProduct(
    id: string,
    activatedBy: string,
    reason?: string,
    metadata?: CommandMetadata
  ): Promise<Result<ProductViewModel, ServiceError>> {
    try {
      const productIdResult = createProductId(id);
      if (isErr(productIdResult)) {
        return err({
          code: 'VALIDATION',
          message: 'Invalid product ID',
          details: { field: 'id' },
        });
      }

      // Check if product exists
      const existingProduct = await this.prisma.product.findUnique({
        where: { id },
      });

      if (!existingProduct) {
        return err({
          code: 'NOT_FOUND',
          message: 'Product not found',
          details: { id },
        });
      }

      if (existingProduct.isActive) {
        return err({
          code: 'VALIDATION',
          message: 'Product is already active',
          details: { id },
        });
      }

      // Create command
      const command = createCommand.activateProduct(
        productIdResult.value,
        { activatedBy, reason },
        metadata
      );

      const result = await this.commandBus.execute(command);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      // Get updated product
      const productResult = await this.getProductById(id);
      if (isErr(productResult) || !productResult.value) {
        return err({
          code: 'INTERNAL',
          message: 'Failed to retrieve activated product',
        });
      }

      return ok(productResult.value);
    } catch (error) {
      console.error('ActivateProduct failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to activate product',
        details: error,
      });
    }
  }

  /**
   * Deactivate a product
   */
  async deactivateProduct(
    id: string,
    deactivatedBy: string,
    reason: string,
    metadata?: CommandMetadata
  ): Promise<Result<ProductViewModel, ServiceError>> {
    try {
      const productIdResult = createProductId(id);
      if (isErr(productIdResult)) {
        return err({
          code: 'VALIDATION',
            message: 'Invalid product ID',
          details: { field: 'id' },
        });
      }

      // Check if product exists
      const existingProduct = await this.prisma.product.findUnique({
        where: { id },
      });

      if (!existingProduct) {
        return err({
          code: 'NOT_FOUND',
          message: 'Product not found',
          details: { id },
        });
      }

      if (!existingProduct.isActive) {
        return err({
          code: 'VALIDATION',
          message: 'Product is already inactive',
          details: { id },
        });
      }

      // Create command
      const command = createCommand.deactivateProduct(
        productIdResult.value,
        { deactivatedBy, reason },
        metadata
      );

      const result = await this.commandBus.execute(command);

      if (isErr(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      // Get updated product
      const productResult = await this.getProductById(id);
      if (isErr(productResult) || !productResult.value) {
        return err({
          code: 'INTERNAL',
          message: 'Failed to retrieve deactivated product',
        });
      }

      return ok(productResult.value);
    } catch (error) {
      console.error('DeactivateProduct failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'Failed to deactivate product',
        details: error,
      });
    }
  }

  /**
   * Validate create product input
   */
  private async validateCreateProductInput(input: CreateProductInput): Promise<
    Result<
      {
        productId: ProductId;
        sku: SKU;
        productName: ProductName;
        price: Price;
        stock: Stock;
        imageUrl?: ImageUrl;
      },
      ServiceError
    >
  > {
    // Use Result V2 helper methods for cleaner validation
    const productId = crypto.randomUUID() as ProductId;

    // Collect all validation results using ResultHelpers.combine
    const validationResults = [
      createSKU(input.sku).mapErr(() => ({ code: 'VALIDATION' as const, message: 'Invalid SKU', details: { field: 'sku' } })),
      createProductName(input.name).mapErr(() => ({ code: 'VALIDATION' as const, message: 'Invalid product name', details: { field: 'name' } })),
      createPrice(input.price).mapErr(() => ({ code: 'VALIDATION' as const, message: 'Invalid price', details: { field: 'price' } })),
      createStock(input.stock).mapErr(() => ({ code: 'VALIDATION' as const, message: 'Invalid stock', details: { field: 'stock' } })),
    ];

    // Handle optional image URL validation
    const imageUrlResult = input.imageUrl 
      ? createImageUrl(input.imageUrl).mapErr(() => ({ code: 'VALIDATION' as const, message: 'Invalid image URL', details: { field: 'imageUrl' } }))
      : ok(undefined as ImageUrl | undefined);

    // Combine all results - if any fail, return the first error
    return wrap(validationResults[0])
      .andThen(sku => 
        wrap(validationResults[1]).andThen(productName =>
          wrap(validationResults[2]).andThen(price =>
            wrap(validationResults[3]).andThen(stock =>
              wrap(imageUrlResult).map(imageUrl => ({
                productId,
                sku,
                productName,
                price,
                stock,
                imageUrl,
              }))
            )
          )
        )
      )
      .unwrapResult();
  }

  /**
   * Validate update product input
   */
  private async validateUpdateProductInput(
    input: UpdateProductInput
  ): Promise<Result<UpdateProductInput, ServiceError>> {
    const validated: UpdateProductInput = {};

    if (input.name !== undefined) {
      const nameResult = createProductName(input.name);
      if (isErr(nameResult)) {
        return err({
          code: 'VALIDATION',
          message: 'Invalid product name',
          details: { field: 'name' },
        });
      }
      validated.name = nameResult.value;
    }

    if (input.price !== undefined) {
      const priceResult = createPrice(input.price);
      if (isErr(priceResult)) {
        return err({
          code: 'VALIDATION',
            message: 'Invalid price',
          details: { field: 'price' },
        });
      }
      validated.price = priceResult.value;
    }

    if (input.imageUrl !== undefined && input.imageUrl !== null) {
      const imageUrlResult = createImageUrl(input.imageUrl);
      if (isErr(imageUrlResult)) {
        return err({
          code: 'VALIDATION',
            message: 'Invalid image URL',
          details: { field: 'imageUrl' },
        });
      }
      validated.imageUrl = imageUrlResult.value;
    } else if (input.imageUrl === null) {
      validated.imageUrl = null;
    }

    if (input.description !== undefined) {
      validated.description = input.description;
    }

    if (input.category !== undefined) {
      validated.category = input.category;
    }

    if (input.tags !== undefined) {
      validated.tags = input.tags;
    }

    return ok(validated);
  }
}
