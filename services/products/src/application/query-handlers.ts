import type { CacheService } from '@graphql-microservices/shared-cache';
import { CacheTTL, hashObject } from '@graphql-microservices/shared-type-utils';
import type { PrismaClient, Product } from '../../generated/prisma';
import {
  createPaginatedResult,
  type GetAllProductsQuery,
  type GetLowStockProductsQuery,
  type GetProductByIdQuery,
  type GetProductBySkuQuery,
  type GetProductStockInfoQuery,
  type GetProductsByCategoryQuery,
  type GetProductsByIdsQuery,
  type PaginatedResult,
  type ProductQuery,
  type ProductStockInfo,
  type ProductViewModel,
  type QueryResult,
  QueryType,
  type SearchProductsQuery,
  validateQuery,
} from './queries';
import { ok, err, isOk, isErr } from '@graphql-microservices/shared-type-utils';
import {
  type CacheKeyTemplate,
  type CategoryName,
  cacheKey,
  type Price,
  type ProductId,
  type SKU,
  type Stock,
} from './types';

/**
 * Query handler interface
 */
export interface QueryHandler<T extends ProductQuery, R = unknown> {
  readonly queryType: T['type'];
  handle(query: T): Promise<QueryResult<R>>;
  canHandle(query: ProductQuery): query is T;
}

/**
 * Base query handler with common functionality
 */
abstract class BaseQueryHandler<T extends ProductQuery, R = unknown> implements QueryHandler<T, R> {
  abstract readonly queryType: T['type'];

  constructor(
    protected readonly prisma: PrismaClient,
    protected readonly cacheService?: CacheService
  ) {}

  abstract handle(query: T): Promise<QueryResult<R>>;

  canHandle(query: ProductQuery): query is T {
    return query.type === this.queryType;
  }

  /**
   * Transform Prisma product to view model
   */
  protected transformProductToViewModel(product: Product): ProductViewModel {
    return {
      id: product.id as ProductId,
      name: product.name,
      description: product.description,
      price: product.price as Price,
      stock: product.stock as Stock,
      sku: product.sku as SKU,
      category: product.category as CategoryName,
      tags: product.tags,
      imageUrl: product.imageUrl ?? undefined,
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  /**
   * Execute query with caching support
   */
  protected async executeWithCache<T>(
    key: CacheKeyTemplate,
    queryFn: () => Promise<T>,
    ttl: number = CacheTTL.MEDIUM
  ): Promise<T> {
    if (!this.cacheService) {
      return queryFn();
    }

    // Try cache first
    const cached = await this.cacheService.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Execute query and cache result
    const result = await queryFn();
    await this.cacheService.set(key, result, ttl);

    return result;
  }

  /**
   * Handle common query execution pattern
   */
  protected async executeQuery<T>(
    query: ProductQuery,
    queryFn: () => Promise<T>
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();

    try {
      // Validate query
      validateQuery(query);

      // Execute query
      const data = await queryFn();

      return ok({
        data,
        metadata: {
          executionTime: Date.now() - startTime,
          source: 'database' as const,
        },
      });
    } catch (error) {
      console.error(`Query ${query.type} failed:`, error);

      let errorCode: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'PERMISSION_DENIED' | 'INTERNAL_ERROR';

      if (error instanceof Error && error.message.includes('not found')) {
        errorCode = 'NOT_FOUND';
      } else {
        errorCode = 'INTERNAL_ERROR';
      }

      return err({
        code: errorCode,
        message: error instanceof Error ? error.message : 'Unknown error',
        details: { query: query.type },
      });
    }
  }
}

/**
 * Get Product By ID Query Handler
 */
export class GetProductByIdQueryHandler extends BaseQueryHandler<
  GetProductByIdQuery,
  ProductViewModel | null
> {
  readonly queryType = QueryType.GET_PRODUCT_BY_ID as const;

  async handle(query: GetProductByIdQuery): Promise<QueryResult<ProductViewModel | null>> {
    return this.executeQuery(query, async () => {
      const key = cacheKey.product(query.payload.productId);

      return this.executeWithCache(key, async () => {
        const product = await this.prisma.product.findUnique({
          where: { id: query.payload.productId },
        });

        return product ? this.transformProductToViewModel(product) : null;
      });
    });
  }
}

/**
 * Get Product By SKU Query Handler
 */
export class GetProductBySkuQueryHandler extends BaseQueryHandler<
  GetProductBySkuQuery,
  ProductViewModel | null
> {
  readonly queryType = QueryType.GET_PRODUCT_BY_SKU as const;

  async handle(query: GetProductBySkuQuery): Promise<QueryResult<ProductViewModel | null>> {
    return this.executeQuery(query, async () => {
      const key = cacheKey.productBySku(query.payload.sku);

      return this.executeWithCache(key, async () => {
        const product = await this.prisma.product.findUnique({
          where: { sku: query.payload.sku },
        });

        return product ? this.transformProductToViewModel(product) : null;
      });
    });
  }
}

/**
 * Get All Products Query Handler
 */
export class GetAllProductsQueryHandler extends BaseQueryHandler<
  GetAllProductsQuery,
  PaginatedResult<ProductViewModel>
> {
  readonly queryType = QueryType.GET_ALL_PRODUCTS as const;

  async handle(
    query: GetAllProductsQuery
  ): Promise<QueryResult<PaginatedResult<ProductViewModel>>> {
    return this.executeQuery(query, async () => {
      const { filter, pagination, sorting } = query.payload;

      // Build where clause
      const where: any = {};
      if (filter?.category) {
        where.category = filter.category;
      }
      if (filter?.minPrice !== undefined || filter?.maxPrice !== undefined) {
        where.price = {};
        if (filter.minPrice !== undefined) where.price.gte = filter.minPrice;
        if (filter.maxPrice !== undefined) where.price.lte = filter.maxPrice;
      }
      if (filter?.inStock !== undefined) {
        where.stock = filter.inStock ? { gt: 0 } : 0;
      }
      if (filter?.isActive !== undefined) {
        where.isActive = filter.isActive;
      }
      if (filter?.tags && filter.tags.length > 0) {
        where.tags = { hasSome: filter.tags };
      }

      // Build order by clause
      const orderBy: any = {};
      if (sorting) {
        orderBy[sorting.field] = sorting.direction.toLowerCase();
      } else {
        orderBy.createdAt = 'desc'; // Default sorting
      }

      // Pagination
      const offset = pagination?.offset || 0;
      const limit = Math.min(pagination?.limit || 20, 100); // Max 100 items

      // Create cache key
      const cacheKeyStr = `products:list:${hashObject({ where, orderBy, offset, limit })}`;

      return this.executeWithCache(
        cacheKeyStr as CacheKeyTemplate,
        async () => {
          // Execute queries in parallel
          const [products, totalCount] = await Promise.all([
            this.prisma.product.findMany({
              where,
              orderBy,
              skip: offset,
              take: limit,
            }),
            this.prisma.product.count({ where }),
          ]);

          return createPaginatedResult(
            products.map((product) => this.transformProductToViewModel(product)),
            totalCount,
            offset,
            limit
          );
        },
        CacheTTL.SHORT
      );
    });
  }
}

/**
 * Get Products By IDs Query Handler
 */
export class GetProductsByIdsQueryHandler extends BaseQueryHandler<
  GetProductsByIdsQuery,
  ProductViewModel[]
> {
  readonly queryType = QueryType.GET_PRODUCTS_BY_IDS as const;

  async handle(query: GetProductsByIdsQuery): Promise<QueryResult<ProductViewModel[]>> {
    return this.executeQuery(query, async () => {
      const products = await this.prisma.product.findMany({
        where: {
          id: { in: query.payload.productIds },
        },
      });

      // Maintain order of requested IDs
      const productMap = new Map(products.map((product) => [product.id, product]));

      return query.payload.productIds
        .map((id) => productMap.get(id))
        .filter((product): product is Product => product !== undefined)
        .map((product) => this.transformProductToViewModel(product));
    });
  }
}

/**
 * Get Products By Category Query Handler
 */
export class GetProductsByCategoryQueryHandler extends BaseQueryHandler<
  GetProductsByCategoryQuery,
  PaginatedResult<ProductViewModel>
> {
  readonly queryType = QueryType.GET_PRODUCTS_BY_CATEGORY as const;

  async handle(
    query: GetProductsByCategoryQuery
  ): Promise<QueryResult<PaginatedResult<ProductViewModel>>> {
    return this.executeQuery(query, async () => {
      const { category, filter, pagination, sorting } = query.payload;

      // Build where clause
      const where: any = { category };

      if (filter?.minPrice !== undefined || filter?.maxPrice !== undefined) {
        where.price = {};
        if (filter.minPrice !== undefined) where.price.gte = filter.minPrice;
        if (filter.maxPrice !== undefined) where.price.lte = filter.maxPrice;
      }
      if (filter?.inStock !== undefined) {
        where.stock = filter.inStock ? { gt: 0 } : 0;
      }
      if (filter?.isActive !== undefined) {
        where.isActive = filter.isActive;
      }
      if (filter?.tags && filter.tags.length > 0) {
        where.tags = { hasSome: filter.tags };
      }

      // Build order by clause
      const orderBy: any = {};
      if (sorting) {
        orderBy[sorting.field] = sorting.direction.toLowerCase();
      } else {
        orderBy.createdAt = 'desc';
      }

      // Pagination
      const offset = pagination?.offset || 0;
      const limit = Math.min(pagination?.limit || 20, 100);

      // Create cache key
      const cacheKeyStr = cacheKey.productsByCategory(category);

      return this.executeWithCache(
        cacheKeyStr,
        async () => {
          const [products, totalCount] = await Promise.all([
            this.prisma.product.findMany({
              where,
              orderBy,
              skip: offset,
              take: limit,
            }),
            this.prisma.product.count({ where }),
          ]);

          return createPaginatedResult(
            products.map((product) => this.transformProductToViewModel(product)),
            totalCount,
            offset,
            limit
          );
        },
        CacheTTL.SHORT
      );
    });
  }
}

/**
 * Search Products Query Handler
 */
export class SearchProductsQueryHandler extends BaseQueryHandler<
  SearchProductsQuery,
  PaginatedResult<ProductViewModel>
> {
  readonly queryType = QueryType.SEARCH_PRODUCTS as const;

  async handle(
    query: SearchProductsQuery
  ): Promise<QueryResult<PaginatedResult<ProductViewModel>>> {
    return this.executeQuery(query, async () => {
      const { searchTerm, searchFields, filter, pagination } = query.payload;

      // Build search conditions
      const searchConditions: any[] = [];
      const fieldsToSearch = searchFields || ['name', 'description', 'tags', 'sku'];

      for (const field of fieldsToSearch) {
        if (field === 'tags') {
          searchConditions.push({
            tags: {
              hasSome: [searchTerm],
            },
          });
        } else {
          searchConditions.push({
            [field]: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          });
        }
      }

      // Build where clause
      const where: any = {
        OR: searchConditions,
      };

      if (filter?.category) {
        where.category = filter.category;
      }
      if (filter?.minPrice !== undefined || filter?.maxPrice !== undefined) {
        where.price = {};
        if (filter.minPrice !== undefined) where.price.gte = filter.minPrice;
        if (filter.maxPrice !== undefined) where.price.lte = filter.maxPrice;
      }
      if (filter?.inStock !== undefined) {
        where.stock = filter.inStock ? { gt: 0 } : 0;
      }
      if (filter?.isActive !== undefined) {
        where.isActive = filter.isActive;
      }

      // Pagination
      const offset = pagination?.offset || 0;
      const limit = Math.min(pagination?.limit || 20, 100);

      // Create cache key
      const cacheKeyStr = cacheKey.productsSearch(searchTerm);

      return this.executeWithCache(
        cacheKeyStr,
        async () => {
          const [products, totalCount] = await Promise.all([
            this.prisma.product.findMany({
              where,
              orderBy: { createdAt: 'desc' },
              skip: offset,
              take: limit,
            }),
            this.prisma.product.count({ where }),
          ]);

          return createPaginatedResult(
            products.map((product) => this.transformProductToViewModel(product)),
            totalCount,
            offset,
            limit
          );
        },
        CacheTTL.SHORT
      );
    });
  }
}

/**
 * Get Low Stock Products Query Handler
 */
export class GetLowStockProductsQueryHandler extends BaseQueryHandler<
  GetLowStockProductsQuery,
  PaginatedResult<ProductViewModel>
> {
  readonly queryType = QueryType.GET_LOW_STOCK_PRODUCTS as const;

  async handle(
    query: GetLowStockProductsQuery
  ): Promise<QueryResult<PaginatedResult<ProductViewModel>>> {
    return this.executeQuery(query, async () => {
      const { threshold, pagination } = query.payload;

      const where = {
        stock: { lte: threshold },
        isActive: true,
      };

      const offset = pagination?.offset || 0;
      const limit = Math.min(pagination?.limit || 20, 100);

      const [products, totalCount] = await Promise.all([
        this.prisma.product.findMany({
          where,
          orderBy: { stock: 'asc' },
          skip: offset,
          take: limit,
        }),
        this.prisma.product.count({ where }),
      ]);

      return createPaginatedResult(
        products.map((product) => this.transformProductToViewModel(product)),
        totalCount,
        offset,
        limit
      );
    });
  }
}

/**
 * Get Product Stock Info Query Handler
 */
export class GetProductStockInfoQueryHandler extends BaseQueryHandler<
  GetProductStockInfoQuery,
  ProductStockInfo | null
> {
  readonly queryType = QueryType.GET_PRODUCT_STOCK_INFO as const;

  async handle(query: GetProductStockInfoQuery): Promise<QueryResult<ProductStockInfo | null>> {
    return this.executeQuery(query, async () => {
      const product = await this.prisma.product.findUnique({
        where: { id: query.payload.productId },
        select: {
          id: true,
          stock: true,
          updatedAt: true,
        },
      });

      if (!product) {
        return null;
      }

      // In a real implementation, you might have a separate stock tracking table
      // For now, we'll return a simplified version
      const stockInfo: ProductStockInfo = {
        productId: product.id as ProductId,
        totalStock: product.stock as Stock,
        availableStock: product.stock as Stock, // In reality, would subtract reserved
        reservedStock: 0 as Stock,
        lastUpdated: product.updatedAt,
        lowStockThreshold: 10 as Stock, // Could be configurable per product
        isLowStock: product.stock <= 10,
      };

      return stockInfo;
    });
  }
}

/**
 * Query Bus - Routes queries to appropriate handlers
 */
export class ProductQueryBus {
  private readonly handlers: Map<QueryType, QueryHandler<any, any>> = new Map();

  constructor(prisma: PrismaClient, cacheService?: CacheService) {
    // Register query handlers
    const handlers: QueryHandler<any, any>[] = [
      new GetProductByIdQueryHandler(prisma, cacheService),
      new GetProductBySkuQueryHandler(prisma, cacheService),
      new GetAllProductsQueryHandler(prisma, cacheService),
      new GetProductsByIdsQueryHandler(prisma, cacheService),
      new GetProductsByCategoryQueryHandler(prisma, cacheService),
      new SearchProductsQueryHandler(prisma, cacheService),
      new GetLowStockProductsQueryHandler(prisma, cacheService),
      new GetProductStockInfoQueryHandler(prisma, cacheService),
    ];

    handlers.forEach((handler) => {
      this.handlers.set(handler.queryType, handler);
    });
  }

  /**
   * Execute a query
   */
  async execute<T extends ProductQuery, R = unknown>(query: T): Promise<QueryResult<R>> {
    const handler = this.handlers.get(query.type) as QueryHandler<T, R>;
    if (!handler) {
      throw new Error(`No handler found for query type: ${query.type}`);
    }

    try {
      return await handler.handle(query);
    } catch (error) {
      console.error(`Query execution failed:`, error);
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: error instanceof Error ? error.message : 'Unknown error',
        details: { query: query.type },
      });
    }
  }

  /**
   * Get all registered query types
   */
  getRegisteredQueries(): string[] {
    return Array.from(this.handlers.keys());
  }
}
