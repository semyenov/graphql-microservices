import type { IQueryHandler } from '@graphql-microservices/event-sourcing';
import { createLogger } from '@graphql-microservices/logger';
import type { PrismaClient } from '../../../generated/prisma';

// Create logger instance
const logger = createLogger({ service: 'orders-query-handlers' });

import type {
  GetAllOrdersQuery,
  GetOrderByIdQuery,
  GetOrderByNumberQuery,
  GetOrderCountQuery,
  GetOrderStatisticsQuery,
  GetOrdersByCustomerQuery,
  GetRevenueReportQuery,
  OrderStatisticsViewModel,
  OrderViewModel,
  PaginatedResult,
  RevenueReportViewModel,
  SearchOrdersQuery,
} from '../index';

/**
 * Get Order By ID Query Handler
 */
export class GetOrderByIdQueryHandler implements IQueryHandler<GetOrderByIdQuery> {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(query: GetOrderByIdQuery): Promise<OrderViewModel | null> {
    try {
      logger.info('Fetching order by ID', { orderId: query.parameters.orderId });

      const order = await this.prisma.order.findUnique({
        where: { id: query.parameters.orderId },
        include: {
          items: true,
          customer: true,
        },
      });

      if (!order) {
        return null;
      }

      return this.mapToViewModel(order);
    } catch (error) {
      logger.error('Failed to fetch order by ID', error as Error, { query });
      throw error;
    }
  }

  private mapToViewModel(order: any): OrderViewModel {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerName: order.customer.name,
      customerEmail: order.customer.email,
      status: order.status,
      items: order.items.map((item: any) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
      })),
      shippingAddress: {
        street: order.shippingStreet,
        city: order.shippingCity,
        state: order.shippingState,
        postalCode: order.shippingPostalCode,
        country: order.shippingCountry,
      },
      billingAddress: order.billingStreet
        ? {
            street: order.billingStreet,
            city: order.billingCity,
            state: order.billingState,
            postalCode: order.billingPostalCode,
            country: order.billingCountry,
          }
        : undefined,
      paymentMethod: order.paymentMethod,
      subtotal: order.subtotal,
      tax: order.tax,
      shipping: order.shipping,
      total: order.total,
      currency: order.currency,
      trackingInfo: order.trackingNumber
        ? {
            trackingNumber: order.trackingNumber,
            carrier: order.carrier,
            estimatedDeliveryDate: order.estimatedDeliveryDate,
            shippedDate: order.shippedDate,
          }
        : undefined,
      notes: order.notes,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      cancelledAt: order.cancelledAt,
      deliveredAt: order.deliveredAt,
    };
  }
}

/**
 * Get Order By Number Query Handler
 */
export class GetOrderByNumberQueryHandler implements IQueryHandler<GetOrderByNumberQuery> {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(query: GetOrderByNumberQuery): Promise<OrderViewModel | null> {
    try {
      logger.info('Fetching order by number', { orderNumber: query.parameters.orderNumber });

      const order = await this.prisma.order.findUnique({
        where: { orderNumber: query.parameters.orderNumber },
        include: {
          items: true,
          customer: true,
        },
      });

      if (!order) {
        return null;
      }

      return new GetOrderByIdQueryHandler(this.prisma).mapToViewModel(order);
    } catch (error) {
      logger.error('Failed to fetch order by number', error as Error, { query });
      throw error;
    }
  }
}

/**
 * Get Orders By Customer Query Handler
 */
export class GetOrdersByCustomerQueryHandler implements IQueryHandler<GetOrdersByCustomerQuery> {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(query: GetOrdersByCustomerQuery): Promise<PaginatedResult<OrderViewModel>> {
    try {
      const { customerId, status, fromDate, toDate, limit, offset, sortBy, sortOrder } =
        query.parameters;

      logger.info('Fetching orders by customer', { customerId, status });

      const where: any = { customerId };

      if (status) {
        where.status = status;
      }

      if (fromDate || toDate) {
        where.createdAt = {};
        if (fromDate) where.createdAt.gte = new Date(fromDate);
        if (toDate) where.createdAt.lte = new Date(toDate);
      }

      const [orders, totalCount] = await Promise.all([
        this.prisma.order.findMany({
          where,
          include: {
            items: true,
            customer: true,
          },
          take: limit,
          skip: offset,
          orderBy: { [sortBy]: sortOrder },
        }),
        this.prisma.order.count({ where }),
      ]);

      const mapper = new GetOrderByIdQueryHandler(this.prisma);

      return {
        items: orders.map((order) => mapper.mapToViewModel(order)),
        totalCount,
        pageInfo: {
          hasNextPage: offset + orders.length < totalCount,
          hasPreviousPage: offset > 0,
          startCursor: orders.length > 0 ? orders[0].id : undefined,
          endCursor: orders.length > 0 ? orders[orders.length - 1].id : undefined,
        },
      };
    } catch (error) {
      logger.error('Failed to fetch orders by customer', error as Error, { query });
      throw error;
    }
  }
}

/**
 * Get All Orders Query Handler (Admin)
 */
export class GetAllOrdersQueryHandler implements IQueryHandler<GetAllOrdersQuery> {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(query: GetAllOrdersQuery): Promise<PaginatedResult<OrderViewModel>> {
    try {
      const {
        status,
        customerId,
        fromDate,
        toDate,
        minTotal,
        maxTotal,
        limit,
        offset,
        sortBy,
        sortOrder,
      } = query.parameters;

      logger.info('Fetching all orders', { status, customerId });

      const where: any = {};

      if (status) where.status = status;
      if (customerId) where.customerId = customerId;

      if (fromDate || toDate) {
        where.createdAt = {};
        if (fromDate) where.createdAt.gte = new Date(fromDate);
        if (toDate) where.createdAt.lte = new Date(toDate);
      }

      if (minTotal || maxTotal) {
        where.total = {};
        if (minTotal) where.total.gte = minTotal;
        if (maxTotal) where.total.lte = maxTotal;
      }

      const [orders, totalCount] = await Promise.all([
        this.prisma.order.findMany({
          where,
          include: {
            items: true,
            customer: true,
          },
          take: limit,
          skip: offset,
          orderBy:
            sortBy === 'customerName' ? { customer: { name: sortOrder } } : { [sortBy]: sortOrder },
        }),
        this.prisma.order.count({ where }),
      ]);

      const mapper = new GetOrderByIdQueryHandler(this.prisma);

      return {
        items: orders.map((order) => mapper.mapToViewModel(order)),
        totalCount,
        pageInfo: {
          hasNextPage: offset + orders.length < totalCount,
          hasPreviousPage: offset > 0,
          startCursor: orders.length > 0 ? orders[0].id : undefined,
          endCursor: orders.length > 0 ? orders[orders.length - 1].id : undefined,
        },
      };
    } catch (error) {
      logger.error('Failed to fetch all orders', error as Error, { query });
      throw error;
    }
  }
}

/**
 * Get Order Statistics Query Handler
 */
export class GetOrderStatisticsQueryHandler implements IQueryHandler<GetOrderStatisticsQuery> {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(query: GetOrderStatisticsQuery): Promise<OrderStatisticsViewModel> {
    try {
      const { customerId, fromDate, toDate, groupBy } = query.parameters;

      logger.info('Fetching order statistics', { customerId, fromDate, toDate, groupBy });

      const where: any = {
        createdAt: {
          gte: new Date(fromDate),
          lte: new Date(toDate),
        },
      };

      if (customerId) {
        where.customerId = customerId;
      }

      // Get order statistics
      const [orderStats, topProducts, statusCounts] = await Promise.all([
        this.prisma.order.aggregate({
          where,
          _count: { id: true },
          _sum: { total: true },
          _avg: { total: true },
        }),
        this.prisma.orderItem.groupBy({
          by: ['productId', 'productName'],
          where: { order: where },
          _sum: {
            quantity: true,
            total: true,
          },
          orderBy: {
            _sum: {
              total: 'desc',
            },
          },
          take: 10,
        }),
        this.prisma.order.groupBy({
          by: ['status'],
          where,
          _count: { id: true },
        }),
      ]);

      return {
        period: `${fromDate} to ${toDate}`,
        orderCount: orderStats._count.id,
        totalRevenue: orderStats._sum.total || 0,
        averageOrderValue: orderStats._avg.total || 0,
        topProducts: topProducts.map((product) => ({
          productId: product.productId,
          productName: product.productName,
          quantity: product._sum.quantity || 0,
          revenue: product._sum.total || 0,
        })),
        statusBreakdown: statusCounts.reduce(
          (acc, status) => ({
            ...acc,
            [status.status]: status._count.id,
          }),
          {}
        ),
      };
    } catch (error) {
      logger.error('Failed to fetch order statistics', error as Error, { query });
      throw error;
    }
  }
}

/**
 * Search Orders Query Handler
 */
export class SearchOrdersQueryHandler implements IQueryHandler<SearchOrdersQuery> {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(query: SearchOrdersQuery): Promise<PaginatedResult<OrderViewModel>> {
    try {
      const { searchTerm, searchFields, limit, offset } = query.parameters;

      logger.info('Searching orders', { searchTerm, searchFields });

      const searchConditions: any[] = [];

      if (searchFields.includes('orderNumber')) {
        searchConditions.push({ orderNumber: { contains: searchTerm } });
      }

      if (searchFields.includes('customerName')) {
        searchConditions.push({
          customer: { name: { contains: searchTerm, mode: 'insensitive' } },
        });
      }

      if (searchFields.includes('customerEmail')) {
        searchConditions.push({
          customer: { email: { contains: searchTerm, mode: 'insensitive' } },
        });
      }

      if (searchFields.includes('productName')) {
        searchConditions.push({
          items: {
            some: {
              productName: { contains: searchTerm, mode: 'insensitive' },
            },
          },
        });
      }

      if (searchFields.includes('trackingNumber')) {
        searchConditions.push({ trackingNumber: { contains: searchTerm } });
      }

      const where = searchConditions.length > 0 ? { OR: searchConditions } : {};

      const [orders, totalCount] = await Promise.all([
        this.prisma.order.findMany({
          where,
          include: {
            items: true,
            customer: true,
          },
          take: limit,
          skip: offset,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.order.count({ where }),
      ]);

      const mapper = new GetOrderByIdQueryHandler(this.prisma);

      return {
        items: orders.map((order) => mapper.mapToViewModel(order)),
        totalCount,
        pageInfo: {
          hasNextPage: offset + orders.length < totalCount,
          hasPreviousPage: offset > 0,
          startCursor: orders.length > 0 ? orders[0].id : undefined,
          endCursor: orders.length > 0 ? orders[orders.length - 1].id : undefined,
        },
      };
    } catch (error) {
      logger.error('Failed to search orders', error as Error, { query });
      throw error;
    }
  }
}

/**
 * Get Order Count Query Handler
 */
export class GetOrderCountQueryHandler implements IQueryHandler<GetOrderCountQuery> {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(query: GetOrderCountQuery): Promise<number> {
    try {
      const { status, customerId, fromDate, toDate } = query.parameters;

      logger.info('Counting orders', { status, customerId });

      const where: any = {};

      if (status) where.status = status;
      if (customerId) where.customerId = customerId;

      if (fromDate || toDate) {
        where.createdAt = {};
        if (fromDate) where.createdAt.gte = new Date(fromDate);
        if (toDate) where.createdAt.lte = new Date(toDate);
      }

      return await this.prisma.order.count({ where });
    } catch (error) {
      logger.error('Failed to count orders', error as Error, { query });
      throw error;
    }
  }
}

/**
 * Get Revenue Report Query Handler
 */
export class GetRevenueReportQueryHandler implements IQueryHandler<GetRevenueReportQuery> {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(query: GetRevenueReportQuery): Promise<RevenueReportViewModel> {
    try {
      const { fromDate, toDate, groupBy, includeRefunds } = query.parameters;

      logger.info('Generating revenue report', { fromDate, toDate, groupBy });

      // This is a simplified implementation
      // In a real system, you would use more sophisticated SQL queries
      // with proper date grouping and aggregation

      const orders = await this.prisma.order.findMany({
        where: {
          createdAt: {
            gte: new Date(fromDate),
            lte: new Date(toDate),
          },
          status: {
            in: includeRefunds ? ['DELIVERED', 'REFUNDED'] : ['DELIVERED'],
          },
        },
        include: {
          items: true,
        },
      });

      // Group orders by the specified period
      const groupedData = new Map<string, any>();

      orders.forEach((order) => {
        const dateKey = this.getDateKey(order.createdAt, groupBy);

        if (!groupedData.has(dateKey)) {
          groupedData.set(dateKey, {
            label: dateKey,
            orderCount: 0,
            grossRevenue: 0,
            refunds: 0,
            netRevenue: 0,
          });
        }

        const group = groupedData.get(dateKey);
        group.orderCount += 1;

        if (order.status === 'REFUNDED') {
          group.refunds += order.total;
        } else {
          group.grossRevenue += order.total;
        }

        group.netRevenue = group.grossRevenue - group.refunds;
      });

      const data = Array.from(groupedData.values());

      const totals = data.reduce(
        (acc, item) => ({
          orderCount: acc.orderCount + item.orderCount,
          grossRevenue: acc.grossRevenue + item.grossRevenue,
          refunds: acc.refunds + item.refunds,
          netRevenue: acc.netRevenue + item.netRevenue,
        }),
        {
          orderCount: 0,
          grossRevenue: 0,
          refunds: 0,
          netRevenue: 0,
        }
      );

      return {
        period: `${fromDate} to ${toDate}`,
        grouping: groupBy,
        data,
        totals,
      };
    } catch (error) {
      logger.error('Failed to generate revenue report', error as Error, { query });
      throw error;
    }
  }

  private getDateKey(date: Date, groupBy: string): string {
    const d = new Date(date);

    switch (groupBy) {
      case 'day':
        return d.toISOString().split('T')[0];
      case 'week': {
        const week = this.getWeekNumber(d);
        return `${d.getFullYear()}-W${week}`;
      }
      case 'month':
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      case 'year':
        return String(d.getFullYear());
      default:
        return d.toISOString().split('T')[0];
    }
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }
}

/**
 * Query handler factory
 */
export function createOrderQueryHandlers(prisma: PrismaClient) {
  return {
    getOrderById: new GetOrderByIdQueryHandler(prisma),
    getOrderByNumber: new GetOrderByNumberQueryHandler(prisma),
    getOrdersByCustomer: new GetOrdersByCustomerQueryHandler(prisma),
    getAllOrders: new GetAllOrdersQueryHandler(prisma),
    getOrderStatistics: new GetOrderStatisticsQueryHandler(prisma),
    searchOrders: new SearchOrdersQueryHandler(prisma),
    getOrderCount: new GetOrderCountQueryHandler(prisma),
    getRevenueReport: new GetRevenueReportQueryHandler(prisma),
  };
}

// Export all query handlers
export const queryHandlers = [
  GetOrderByIdQueryHandler,
  GetOrderByNumberQueryHandler,
  GetOrdersByCustomerQueryHandler,
  GetAllOrdersQueryHandler,
  GetOrderStatisticsQueryHandler,
  SearchOrdersQueryHandler,
  GetOrderCountQueryHandler,
  GetRevenueReportQueryHandler,
];
