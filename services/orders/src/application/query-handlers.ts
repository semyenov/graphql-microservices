import type { CacheService } from '@graphql-microservices/shared-cache';
import { CacheTTL, hashObject } from '@graphql-microservices/shared-type-utils';
import type { Order, OrderItem, PrismaClient } from '../../generated/prisma';
import {
  createPaginatedResult,
  type GetAllOrdersQuery,
  type GetOrderByIdQuery,
  type GetOrderByNumberQuery,
  type GetOrderStatisticsQuery,
  type GetOrdersByUserQuery,
  type GetUserOrderHistoryQuery,
  type OrderQuery,
  type OrderStatistics,
  type OrderViewModel,
  type PaginatedResult,
  type QueryResult,
  QueryType,
  type UserOrderHistory,
  validateQuery,
} from './queries';
import { ok, err, isOk, isErr } from '@graphql-microservices/shared-type-utils';
import {
  type Amount,
  type CacheKeyTemplate,
  cacheKey,
  type OrderId,
  type OrderNumber,
  type OrderStatus,
  type UserId,
} from './types';

/**
 * Query handler interface
 */
export interface QueryHandler<T extends OrderQuery, R = unknown> {
  readonly queryType: T['type'];
  handle(query: T): Promise<QueryResult<R>>;
  canHandle(query: OrderQuery): query is T;
}

/**
 * Base query handler with common functionality
 */
abstract class BaseQueryHandler<T extends OrderQuery, R = unknown> implements QueryHandler<T, R> {
  abstract readonly queryType: T['type'];

  constructor(
    protected readonly prisma: PrismaClient,
    protected readonly cacheService?: CacheService
  ) {}

  abstract handle(query: T): Promise<QueryResult<R>>;

  canHandle(query: OrderQuery): query is T {
    return query.type === this.queryType;
  }

  /**
   * Transform Prisma order to view model
   */
  protected async transformOrderToViewModel(
    order: Order & { items?: OrderItem[] }
  ): Promise<OrderViewModel> {
    // Parse JSON fields
    const shippingAddress = (order.shippingAddress as any) || {};
    const paymentInfo = (order.paymentInfo as any) || {};
    const shippingInfo = (order.shippingInfo as any) || {};

    return {
      id: order.id as OrderId,
      orderNumber: order.orderNumber as OrderNumber,
      userId: order.userId as UserId,
      status: order.status as OrderStatus,
      items:
        order.items?.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice as Amount,
          totalPrice: item.totalPrice as Amount,
        })) || [],
      subtotal: order.subtotal as Amount,
      tax: order.tax as Amount,
      shipping: order.shipping as Amount,
      discount: order.discount as Amount,
      totalAmount: order.totalAmount as Amount,
      shippingAddress: {
        street: shippingAddress.street || '',
        city: shippingAddress.city || '',
        state: shippingAddress.state || '',
        country: shippingAddress.country || '',
        postalCode: shippingAddress.postalCode || '',
      },
      paymentInfo: {
        method: paymentInfo.method || 'CARD',
        status: paymentInfo.status || 'PENDING',
        transactionId: paymentInfo.transactionId,
      },
      shippingInfo: {
        carrier: shippingInfo.carrier,
        trackingNumber: shippingInfo.trackingNumber,
        estimatedDeliveryDate: shippingInfo.estimatedDeliveryDate,
        deliveredAt: shippingInfo.deliveredAt,
      },
      notes: order.notes || undefined,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
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
    query: OrderQuery,
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
 * Get Order By ID Query Handler
 */
export class GetOrderByIdQueryHandler extends BaseQueryHandler<
  GetOrderByIdQuery,
  OrderViewModel | null
> {
  readonly queryType = QueryType.GET_ORDER_BY_ID as const;

  async handle(query: GetOrderByIdQuery): Promise<QueryResult<OrderViewModel | null>> {
    return this.executeQuery(query, async () => {
      const key = cacheKey.order(query.payload.orderId);

      return this.executeWithCache(key, async () => {
        const order = await this.prisma.order.findUnique({
          where: { id: query.payload.orderId },
          include: { items: true },
        });

        return order ? await this.transformOrderToViewModel(order) : null;
      });
    });
  }
}

/**
 * Get Order By Number Query Handler
 */
export class GetOrderByNumberQueryHandler extends BaseQueryHandler<
  GetOrderByNumberQuery,
  OrderViewModel | null
> {
  readonly queryType = QueryType.GET_ORDER_BY_NUMBER as const;

  async handle(query: GetOrderByNumberQuery): Promise<QueryResult<OrderViewModel | null>> {
    return this.executeQuery(query, async () => {
      const key = cacheKey.orderByNumber(query.payload.orderNumber);

      return this.executeWithCache(key, async () => {
        const order = await this.prisma.order.findUnique({
          where: { orderNumber: query.payload.orderNumber },
          include: { items: true },
        });

        return order ? await this.transformOrderToViewModel(order) : null;
      });
    });
  }
}

/**
 * Get Orders By User Query Handler
 */
export class GetOrdersByUserQueryHandler extends BaseQueryHandler<
  GetOrdersByUserQuery,
  PaginatedResult<OrderViewModel>
> {
  readonly queryType = QueryType.GET_ORDERS_BY_USER as const;

  async handle(query: GetOrdersByUserQuery): Promise<QueryResult<PaginatedResult<OrderViewModel>>> {
    return this.executeQuery(query, async () => {
      const { userId, filter, pagination, sorting } = query.payload;

      // Build where clause
      const where: any = { userId };

      if (filter?.status) {
        where.status = filter.status;
      }
      if (filter?.fromDate || filter?.toDate) {
        where.createdAt = {};
        if (filter.fromDate) where.createdAt.gte = filter.fromDate;
        if (filter.toDate) where.createdAt.lte = filter.toDate;
      }
      if (filter?.minAmount !== undefined || filter?.maxAmount !== undefined) {
        where.totalAmount = {};
        if (filter.minAmount !== undefined) where.totalAmount.gte = filter.minAmount;
        if (filter.maxAmount !== undefined) where.totalAmount.lte = filter.maxAmount;
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
      const cacheKeyStr = cacheKey.ordersByUser(userId);

      return this.executeWithCache(
        cacheKeyStr,
        async () => {
          // Execute queries in parallel
          const [orders, totalCount] = await Promise.all([
            this.prisma.order.findMany({
              where,
              orderBy,
              skip: offset,
              take: limit,
              include: { items: true },
            }),
            this.prisma.order.count({ where }),
          ]);

          const transformedOrders = await Promise.all(
            orders.map((order) => this.transformOrderToViewModel(order))
          );

          return createPaginatedResult(transformedOrders, totalCount, offset, limit);
        },
        CacheTTL.SHORT
      );
    });
  }
}

/**
 * Get All Orders Query Handler
 */
export class GetAllOrdersQueryHandler extends BaseQueryHandler<
  GetAllOrdersQuery,
  PaginatedResult<OrderViewModel>
> {
  readonly queryType = QueryType.GET_ALL_ORDERS as const;

  async handle(query: GetAllOrdersQuery): Promise<QueryResult<PaginatedResult<OrderViewModel>>> {
    return this.executeQuery(query, async () => {
      const { filter, pagination, sorting } = query.payload;

      // Build where clause
      const where: any = {};

      if (filter?.userId) {
        where.userId = filter.userId;
      }
      if (filter?.status) {
        where.status = filter.status;
      }
      if (filter?.fromDate || filter?.toDate) {
        where.createdAt = {};
        if (filter.fromDate) where.createdAt.gte = filter.fromDate;
        if (filter.toDate) where.createdAt.lte = filter.toDate;
      }
      if (filter?.minAmount !== undefined || filter?.maxAmount !== undefined) {
        where.totalAmount = {};
        if (filter.minAmount !== undefined) where.totalAmount.gte = filter.minAmount;
        if (filter.maxAmount !== undefined) where.totalAmount.lte = filter.maxAmount;
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
      const cacheKeyStr = `orders:list:${hashObject({ where, orderBy, offset, limit })}`;

      return this.executeWithCache(
        cacheKeyStr as CacheKeyTemplate,
        async () => {
          const [orders, totalCount] = await Promise.all([
            this.prisma.order.findMany({
              where,
              orderBy,
              skip: offset,
              take: limit,
              include: { items: true },
            }),
            this.prisma.order.count({ where }),
          ]);

          const transformedOrders = await Promise.all(
            orders.map((order) => this.transformOrderToViewModel(order))
          );

          return createPaginatedResult(transformedOrders, totalCount, offset, limit);
        },
        CacheTTL.SHORT
      );
    });
  }
}

/**
 * Get Order Statistics Query Handler
 */
export class GetOrderStatisticsQueryHandler extends BaseQueryHandler<
  GetOrderStatisticsQuery,
  OrderStatistics
> {
  readonly queryType = QueryType.GET_ORDER_STATISTICS as const;

  async handle(query: GetOrderStatisticsQuery): Promise<QueryResult<OrderStatistics>> {
    return this.executeQuery(query, async () => {
      const { userId, fromDate, toDate } = query.payload;

      // Build where clause
      const where: any = {};
      if (userId) {
        where.userId = userId;
      }
      if (fromDate || toDate) {
        where.createdAt = {};
        if (fromDate) where.createdAt.gte = fromDate;
        if (toDate) where.createdAt.lte = toDate;
      }

      // Get statistics
      const [totalOrders, completedOrders, cancelledOrders, aggregates, statusCounts] =
        await Promise.all([
          this.prisma.order.count({ where }),
          this.prisma.order.count({ where: { ...where, status: 'DELIVERED' } }),
          this.prisma.order.count({ where: { ...where, status: 'CANCELLED' } }),
          this.prisma.order.aggregate({
            where,
            _sum: { totalAmount: true },
            _avg: { totalAmount: true },
          }),
          this.prisma.order.groupBy({
            by: ['status'],
            where,
            _count: true,
          }),
        ]);

      // Transform status counts
      const ordersByStatus: Record<string, number> = {};
      statusCounts.forEach((item) => {
        ordersByStatus[item.status] = item._count;
      });

      return {
        totalOrders,
        completedOrders,
        cancelledOrders,
        totalRevenue: (aggregates._sum.totalAmount || 0) as Amount,
        averageOrderValue: (aggregates._avg.totalAmount || 0) as Amount,
        ordersByStatus,
        period: {
          from: fromDate || new Date(0),
          to: toDate || new Date(),
        },
      };
    });
  }
}

/**
 * Get User Order History Query Handler
 */
export class GetUserOrderHistoryQueryHandler extends BaseQueryHandler<
  GetUserOrderHistoryQuery,
  UserOrderHistory
> {
  readonly queryType = QueryType.GET_USER_ORDER_HISTORY as const;

  async handle(query: GetUserOrderHistoryQuery): Promise<QueryResult<UserOrderHistory>> {
    return this.executeQuery(query, async () => {
      const { userId, limit = 10, includeDetails = false } = query.payload;

      // Get recent orders
      const recentOrders = await this.prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: includeDetails ? { items: true } : false,
      });

      // Get statistics
      const [totalOrders, totalSpent, favoriteProducts] = await Promise.all([
        this.prisma.order.count({ where: { userId } }),
        this.prisma.order.aggregate({
          where: { userId },
          _sum: { totalAmount: true },
        }),
        this.prisma.orderItem.groupBy({
          by: ['productId'],
          where: { order: { userId } },
          _count: true,
          _sum: { quantity: true },
          orderBy: { _count: { productId: 'desc' } },
          take: 5,
        }),
      ]);

      // Transform recent orders
      const transformedRecentOrders = await Promise.all(
        recentOrders.map((order) => this.transformOrderToViewModel(order))
      );

      return {
        userId: userId as UserId,
        totalOrders,
        totalSpent: (totalSpent._sum.totalAmount || 0) as Amount,
        recentOrders: transformedRecentOrders,
        favoriteProducts: favoriteProducts.map((item) => ({
          productId: item.productId,
          orderCount: item._count,
          totalQuantity: item._sum.quantity || 0,
        })),
        firstOrderDate:
          recentOrders.length > 0 ? recentOrders[recentOrders.length - 1].createdAt : null,
        lastOrderDate: recentOrders.length > 0 ? recentOrders[0].createdAt : null,
      };
    });
  }
}

/**
 * Query Bus - Routes queries to appropriate handlers
 */
export class OrderQueryBus {
  private readonly handlers: Map<QueryType, QueryHandler<any, any>> = new Map();

  constructor(prisma: PrismaClient, cacheService?: CacheService) {
    // Register query handlers
    const handlers: QueryHandler<any, any>[] = [
      new GetOrderByIdQueryHandler(prisma, cacheService),
      new GetOrderByNumberQueryHandler(prisma, cacheService),
      new GetOrdersByUserQueryHandler(prisma, cacheService),
      new GetAllOrdersQueryHandler(prisma, cacheService),
      new GetOrderStatisticsQueryHandler(prisma, cacheService),
      new GetUserOrderHistoryQueryHandler(prisma, cacheService),
    ];

    handlers.forEach((handler) => {
      this.handlers.set(handler.queryType, handler);
    });
  }

  /**
   * Execute a query
   */
  async execute<T extends OrderQuery, R = unknown>(query: T): Promise<QueryResult<R>> {
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
