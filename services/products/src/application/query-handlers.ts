import type { EventStore, EventStoreQuery } from '@graphql-microservices/event-sourcing';
import type { CacheService } from '@graphql-microservices/shared-cache';
import type { PrismaClient, Product as PrismaProduct } from '../../generated/prisma';
import { Product } from '../domain/product-aggregate';
import {
  type GetAllProductsQuery,
  type GetLowStockProductsQuery,
  type GetProductByIdQuery,
  type GetProductBySkuQuery,
  type GetProductEventsQuery,
  type GetProductInventorySummaryQuery,
  type GetProductStockReservationsQuery,
  type GetProductsByCategoryQuery,
  type GetProductsByIdsQuery,
  type PaginatedResult,
  type ProductEventViewModel,
  type ProductInventorySummary,
  type ProductQuery,
  type ProductViewModel,
  type QueryResult,
  type SearchProductsQuery,
  type StockReservationViewModel,
  validateQuery,
} from './queries';

/**
 * Query handler interface
 */
export interface QueryHandler<T extends ProductQuery, R = unknown> {
  handle(query: T): Promise<QueryResult<R>>;
}

/**
 * Base query handler with common functionality
 */
abstract class BaseQueryHandler<T extends ProductQuery, R = unknown> implements QueryHandler<T, R> {
  constructor(
    protected readonly prisma: PrismaClient,
    protected readonly eventStore: EventStore,
    protected readonly cacheService?: CacheService
  ) {}

  abstract handle(query: T): Promise<QueryResult<R>>;

  /**
   * Transform Prisma product to view model
   */
  protected async transformProductToViewModel(product: PrismaProduct): Promise<ProductViewModel> {
    // Load aggregate to get additional computed properties
    const aggregate = await this.loadProductAggregate(product.id);

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      price: {
        amount: product.price.toNumber(),
        currency: 'USD',
      },
      stock: product.stock,
      availableStock: aggregate ? aggregate.getAvailableStock() : product.stock,
      sku: product.sku,
      category: product.category,
      tags: product.tags,
      imageUrl: product.imageUrl ?? undefined,
      isActive: product.isActive,
      isLowStock: aggregate ? aggregate.isLowStock() : product.stock < 10,
      isAvailableForPurchase: aggregate
        ? aggregate.isAvailableForPurchase()
        : product.isActive && product.stock > 0,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  /**
   * Load product aggregate from event store
   */
  protected async loadProductAggregate(productId: string): Promise<Product | null> {
    try {
      const events = await this.eventStore.readStream(productId);
      if (events.length === 0) {
        return null;
      }
      return Product.fromEvents(events);
    } catch (error) {
      console.error(`Failed to load product aggregate ${productId}:`, error);
      return null;
    }
  }

  /**
   * Execute query with caching support
   */
  protected async executeWithCache<T>(
    cacheKey: string,
    queryFn: () => Promise<T>,
    ttl: number = 300 // 5 minutes
  ): Promise<T> {
    if (!this.cacheService) {
      return queryFn();
    }

    // Try cache first
    const cached = await this.cacheService.get<T>(`product:${cacheKey}` as `${string}:${string}`);
    if (cached !== null) {
      return cached;
    }

    // Execute query and cache result
    const result = await queryFn();
    await this.cacheService.set(`product:${cacheKey}` as `${string}:${string}`, result, ttl);

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

      return {
        success: true,
        data,
        metadata: {
          executionTime: Date.now() - startTime,
          source: 'query-handler',
        },
      };
    } catch (error) {
      console.error(`Query ${query.type} failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          executionTime: Date.now() - startTime,
          source: 'query-handler',
        },
      };
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
  async handle(query: GetProductByIdQuery): Promise<QueryResult<ProductViewModel | null>> {
    return this.executeQuery(query, async () => {
      const cacheKey = `product:${query.payload.productId}`;

      return this.executeWithCache(cacheKey, async () => {
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
  async handle(query: GetProductBySkuQuery): Promise<QueryResult<ProductViewModel | null>> {
    return this.executeQuery(query, async () => {
      const cacheKey = `product:sku:${query.payload.sku}`;

      return this.executeWithCache(cacheKey, async () => {
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
  async handle(
    query: GetAllProductsQuery
  ): Promise<QueryResult<PaginatedResult<ProductViewModel>>> {
    return this.executeQuery(query, async () => {
      const { filter, pagination, sorting } = query.payload;

      // Build where clause
      const where: Record<string, unknown> = {};

      if (filter?.category) {
        where.category = filter.category;
      }
      if (filter?.isActive !== undefined) {
        where.isActive = filter.isActive;
      }
      if (filter?.inStock !== undefined) {
        where.stock = filter.inStock ? { gt: 0 } : 0;
      }
      if (filter?.priceMin !== undefined || filter?.priceMax !== undefined) {
        where.price = {};
        if (filter.priceMin !== undefined) {
          (where.price as Record<string, unknown>).gte = filter.priceMin;
        }
        if (filter.priceMax !== undefined) {
          (where.price as Record<string, unknown>).lte = filter.priceMax;
        }
      }
      if (filter?.tags && filter.tags.length > 0) {
        where.OR = filter.tags.map((tag) => ({
          tags: { contains: tag },
        }));
      }

      // Build order by clause
      const orderBy: Record<string, string> = {};
      if (sorting) {
        orderBy[sorting.field] = sorting.direction.toLowerCase();
      } else {
        orderBy.createdAt = 'desc'; // Default sorting
      }

      // Pagination
      const offset = pagination?.offset || 0;
      const limit = Math.min(pagination?.limit || 50, 100); // Max 100 items

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

      // Transform to view models
      const items = await Promise.all(
        products.map((product) => this.transformProductToViewModel(product))
      );

      return {
        items,
        totalCount,
        offset,
        limit,
        hasMore: offset + limit < totalCount,
      };
    });
  }
}

/**
 * Get Products By IDs Query Handler (for batch loading)
 */
export class GetProductsByIdsQueryHandler extends BaseQueryHandler<
  GetProductsByIdsQuery,
  ProductViewModel[]
> {
  async handle(query: GetProductsByIdsQuery): Promise<QueryResult<ProductViewModel[]>> {
    return this.executeQuery(query, async () => {
      const products = await this.prisma.product.findMany({
        where: {
          id: { in: query.payload.productIds },
        },
      });

      // Maintain order of requested IDs
      const productMap = new Map(products.map((product) => [product.id, product]));

      const items = await Promise.all(
        query.payload.productIds
          .map((id) => productMap.get(id))
          .filter((product) => product !== undefined)
          .map((product) => this.transformProductToViewModel(product))
      );

      return items;
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
  async handle(
    query: GetProductsByCategoryQuery
  ): Promise<QueryResult<PaginatedResult<ProductViewModel>>> {
    return this.executeQuery(query, async () => {
      const { category, filter, pagination, sorting } = query.payload;

      // Build where clause
      const where: Record<string, unknown> = { category };

      if (filter?.isActive !== undefined) {
        where.isActive = filter.isActive;
      }
      if (filter?.inStock !== undefined) {
        where.stock = filter.inStock ? { gt: 0 } : 0;
      }
      if (filter?.priceMin !== undefined || filter?.priceMax !== undefined) {
        where.price = {};
        if (filter.priceMin !== undefined) {
          (where.price as Record<string, unknown>).gte = filter.priceMin;
        }
        if (filter.priceMax !== undefined) {
          (where.price as Record<string, unknown>).lte = filter.priceMax;
        }
      }
      if (filter?.tags && filter.tags.length > 0) {
        where.OR = filter.tags.map((tag) => ({
          tags: { contains: tag },
        }));
      }

      // Build order by clause
      const orderBy: Record<string, string> = {};
      if (sorting) {
        orderBy[sorting.field] = sorting.direction.toLowerCase();
      } else {
        orderBy.createdAt = 'desc';
      }

      // Pagination
      const offset = pagination?.offset || 0;
      const limit = Math.min(pagination?.limit || 50, 100);

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

      // Transform to view models
      const items = await Promise.all(
        products.map((product) => this.transformProductToViewModel(product))
      );

      return {
        items,
        totalCount,
        offset,
        limit,
        hasMore: offset + limit < totalCount,
      };
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
  async handle(
    query: SearchProductsQuery
  ): Promise<QueryResult<PaginatedResult<ProductViewModel>>> {
    return this.executeQuery(query, async () => {
      const { searchTerm, searchFields, filter, pagination } = query.payload;

      // Build search conditions
      const searchConditions: Record<string, unknown>[] = [];
      const fieldsToSearch = searchFields || ['name', 'description', 'sku'];

      for (const field of fieldsToSearch) {
        if (field === 'tags') {
          searchConditions.push({
            tags: {
              contains: searchTerm,
              mode: 'insensitive',
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
      const where: Record<string, unknown> = {
        OR: searchConditions,
      };

      // Apply filters
      if (filter?.category) {
        where.category = filter.category;
      }
      if (filter?.isActive !== undefined) {
        where.isActive = filter.isActive;
      }
      if (filter?.inStock !== undefined) {
        where.stock = filter.inStock ? { gt: 0 } : 0;
      }
      if (filter?.priceMin !== undefined || filter?.priceMax !== undefined) {
        where.price = {};
        if (filter.priceMin !== undefined) {
          (where.price as Record<string, unknown>).gte = filter.priceMin;
        }
        if (filter.priceMax !== undefined) {
          (where.price as Record<string, unknown>).lte = filter.priceMax;
        }
      }

      // Pagination
      const offset = pagination?.offset || 0;
      const limit = Math.min(pagination?.limit || 50, 100);

      // Execute queries in parallel
      const [products, totalCount] = await Promise.all([
        this.prisma.product.findMany({
          where,
          orderBy: { name: 'asc' },
          skip: offset,
          take: limit,
        }),
        this.prisma.product.count({ where }),
      ]);

      // Transform to view models
      const items = await Promise.all(
        products.map((product) => this.transformProductToViewModel(product))
      );

      return {
        items,
        totalCount,
        offset,
        limit,
        hasMore: offset + limit < totalCount,
      };
    });
  }
}

/**
 * Get Product Events Query Handler
 */
export class GetProductEventsQueryHandler extends BaseQueryHandler<
  GetProductEventsQuery,
  PaginatedResult<ProductEventViewModel>
> {
  async handle(
    query: GetProductEventsQuery
  ): Promise<QueryResult<PaginatedResult<ProductEventViewModel>>> {
    return this.executeQuery(query, async () => {
      const { productId, eventTypes, fromDate, toDate, pagination } = query.payload;

      // Build event store query
      const eventQuery: EventStoreQuery = {
        aggregateId: productId,
        aggregateType: 'Product',
      };

      if (fromDate || toDate) {
        eventQuery.timeRange = {};
        if (fromDate) eventQuery.timeRange.from = fromDate;
        if (toDate) eventQuery.timeRange.to = toDate;
      }

      const limit = Math.min(pagination?.limit || 50, 100);
      const offset = pagination?.offset || 0;

      // Get events from event store
      const events = await this.eventStore.readEvents({
        ...eventQuery,
        limit: limit + offset, // Rough approximation for pagination
      });

      // Filter by event types if specified
      let filteredEvents = events;
      if (eventTypes && eventTypes.length > 0) {
        filteredEvents = events.filter((event) => eventTypes.includes(event.type));
      }

      // Apply pagination
      const paginatedEvents = filteredEvents.slice(offset, offset + limit);

      return {
        items: paginatedEvents.map((event) => ({
          id: event.id,
          type: event.type,
          aggregateId: event.aggregateId,
          data: event.data,
          metadata: event.metadata as unknown as Record<string, unknown>,
          occurredAt: event.occurredAt,
          version: event.version,
        })),
        totalCount: filteredEvents.length,
        offset,
        limit,
        hasMore: offset + limit < filteredEvents.length,
      };
    });
  }
}

/**
 * Get Product Stock Reservations Query Handler
 */
export class GetProductStockReservationsQueryHandler extends BaseQueryHandler<
  GetProductStockReservationsQuery,
  PaginatedResult<StockReservationViewModel>
> {
  async handle(
    query: GetProductStockReservationsQuery
  ): Promise<QueryResult<PaginatedResult<StockReservationViewModel>>> {
    return this.executeQuery(query, async () => {
      const { productId, status, pagination } = query.payload;

      // Load product aggregate to get reservations
      const product = await this.loadProductAggregate(productId);
      if (!product) {
        return {
          items: [],
          totalCount: 0,
          offset: 0,
          limit: 50,
          hasMore: false,
        };
      }

      // Get all reservations
      const allReservations = product.getStockReservations();

      // Filter by status if specified
      let filteredReservations = allReservations;
      if (status) {
        const now = new Date();
        filteredReservations = allReservations.filter((reservation) => {
          switch (status) {
            case 'active':
              return !reservation.expiresAt || reservation.expiresAt > now;
            case 'expired':
              return reservation.expiresAt && reservation.expiresAt <= now;
            default:
              return true; // For fulfilled/cancelled, we'd need additional tracking
          }
        });
      }

      // Apply pagination
      const offset = pagination?.offset || 0;
      const limit = Math.min(pagination?.limit || 50, 100);
      const paginatedReservations = filteredReservations.slice(offset, offset + limit);

      // Transform to view models
      const items: StockReservationViewModel[] = paginatedReservations.map((reservation) => {
        const now = new Date();
        let reservationStatus: 'active' | 'expired' | 'fulfilled' | 'cancelled' = 'active';

        if (reservation.expiresAt && reservation.expiresAt <= now) {
          reservationStatus = 'expired';
        }

        return {
          id: reservation.id,
          productId,
          quantity: reservation.quantity,
          reservedFor: reservation.reservedFor,
          createdAt: reservation.createdAt,
          expiresAt: reservation.expiresAt,
          status: reservationStatus,
        };
      });

      return {
        items,
        totalCount: filteredReservations.length,
        offset,
        limit,
        hasMore: offset + limit < filteredReservations.length,
      };
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
  async handle(
    query: GetLowStockProductsQuery
  ): Promise<QueryResult<PaginatedResult<ProductViewModel>>> {
    return this.executeQuery(query, async () => {
      const { threshold = 10, category, pagination } = query.payload;

      // Build where clause
      const where: Record<string, unknown> = {
        stock: { lte: threshold },
        isActive: true,
      };

      if (category) {
        where.category = category;
      }

      // Pagination
      const offset = pagination?.offset || 0;
      const limit = Math.min(pagination?.limit || 50, 100);

      // Execute queries in parallel
      const [products, totalCount] = await Promise.all([
        this.prisma.product.findMany({
          where,
          orderBy: { stock: 'asc' }, // Order by stock level (lowest first)
          skip: offset,
          take: limit,
        }),
        this.prisma.product.count({ where }),
      ]);

      // Transform to view models
      const items = await Promise.all(
        products.map((product) => this.transformProductToViewModel(product))
      );

      return {
        items,
        totalCount,
        offset,
        limit,
        hasMore: offset + limit < totalCount,
      };
    });
  }
}

/**
 * Get Product Inventory Summary Query Handler
 */
export class GetProductInventorySummaryQueryHandler extends BaseQueryHandler<
  GetProductInventorySummaryQuery,
  PaginatedResult<ProductInventorySummary>
> {
  async handle(
    query: GetProductInventorySummaryQuery
  ): Promise<QueryResult<PaginatedResult<ProductInventorySummary>>> {
    return this.executeQuery(query, async () => {
      const { productIds, category, onlyLowStock, pagination } = query.payload;

      // Build where clause
      const where: Record<string, unknown> = {};

      if (productIds && productIds.length > 0) {
        where.id = { in: productIds };
      }
      if (category) {
        where.category = category;
      }
      if (onlyLowStock) {
        where.stock = { lte: 10 }; // Default low stock threshold
      }

      // Pagination
      const offset = pagination?.offset || 0;
      const limit = Math.min(pagination?.limit || 50, 100);

      // Execute queries in parallel
      const [products, totalCount] = await Promise.all([
        this.prisma.product.findMany({
          where,
          orderBy: { stock: 'asc' },
          skip: offset,
          take: limit,
        }),
        this.prisma.product.count({ where }),
      ]);

      // Transform to inventory summaries
      const items = await Promise.all(
        products.map(async (product) => {
          const aggregate = await this.loadProductAggregate(product.id);
          const totalReserved = aggregate ? aggregate.getTotalReservedStock() : 0;
          const availableStock = product.stock - totalReserved;

          const summary: ProductInventorySummary = {
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            totalStock: product.stock,
            reservedStock: totalReserved,
            availableStock,
            pendingOrders: 0, // Would need order service integration
            lowStockThreshold: 10, // Default threshold
            isLowStock: availableStock < 10,
          };

          return summary;
        })
      );

      return {
        items,
        totalCount,
        offset,
        limit,
        hasMore: offset + limit < totalCount,
      };
    });
  }
}

/**
 * Query Bus - Routes queries to appropriate handlers
 */
export class ProductQueryBus {
  private readonly handlers = new Map<string, QueryHandler<ProductQuery, unknown>>();

  constructor(prisma: PrismaClient, eventStore: EventStore, cacheService?: CacheService) {
    // Register query handlers
    this.handlers.set(
      'GetProductById',
      new GetProductByIdQueryHandler(prisma, eventStore, cacheService)
    );
    this.handlers.set(
      'GetProductBySku',
      new GetProductBySkuQueryHandler(prisma, eventStore, cacheService)
    );
    this.handlers.set(
      'GetAllProducts',
      new GetAllProductsQueryHandler(prisma, eventStore, cacheService)
    );
    this.handlers.set(
      'GetProductsByIds',
      new GetProductsByIdsQueryHandler(prisma, eventStore, cacheService)
    );
    this.handlers.set(
      'GetProductsByCategory',
      new GetProductsByCategoryQueryHandler(prisma, eventStore, cacheService)
    );
    this.handlers.set(
      'SearchProducts',
      new SearchProductsQueryHandler(prisma, eventStore, cacheService)
    );
    this.handlers.set(
      'GetProductEvents',
      new GetProductEventsQueryHandler(prisma, eventStore, cacheService)
    );
    this.handlers.set(
      'GetProductStockReservations',
      new GetProductStockReservationsQueryHandler(prisma, eventStore, cacheService)
    );
    this.handlers.set(
      'GetLowStockProducts',
      new GetLowStockProductsQueryHandler(prisma, eventStore, cacheService)
    );
    this.handlers.set(
      'GetProductInventorySummary',
      new GetProductInventorySummaryQueryHandler(prisma, eventStore, cacheService)
    );
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
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Register a custom query handler
   */
  registerHandler<T extends ProductQuery, R = unknown>(
    queryType: string,
    handler: QueryHandler<T, R>
  ): void {
    this.handlers.set(queryType, handler);
  }

  /**
   * Get all registered query types
   */
  getRegisteredQueries(): string[] {
    return Array.from(this.handlers.keys());
  }
}
