import { QueryBus as BaseQueryBus } from '@graphql-microservices/event-sourcing';
import type { PrismaClient } from '../../generated/prisma';
import { createOrderQueryHandlers } from './handlers';
import type {
  OrderQuery,
  OrderStatisticsViewModel,
  OrderViewModel,
  PaginatedResult,
  RevenueReportViewModel,
} from './index';

export interface QueryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class OrderQueryBus {
  private queryBus: BaseQueryBus;
  private handlers: ReturnType<typeof createOrderQueryHandlers>;

  constructor(private readonly prisma: PrismaClient) {
    this.queryBus = new BaseQueryBus();
    this.handlers = createOrderQueryHandlers(prisma);
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // Register all query handlers
    this.queryBus.register('GetOrderById', this.handlers.getOrderById);
    this.queryBus.register('GetOrderByNumber', this.handlers.getOrderByNumber);
    this.queryBus.register('GetOrdersByCustomer', this.handlers.getOrdersByCustomer);
    this.queryBus.register('GetAllOrders', this.handlers.getAllOrders);
    this.queryBus.register('GetOrderStatistics', this.handlers.getOrderStatistics);
    this.queryBus.register('SearchOrders', this.handlers.searchOrders);
    this.queryBus.register('GetOrderCount', this.handlers.getOrderCount);
    this.queryBus.register('GetRevenueReport', this.handlers.getRevenueReport);
  }

  async execute<T = any>(query: OrderQuery): Promise<QueryResult<T>> {
    try {
      const result = await this.queryBus.execute(query);

      return {
        success: true,
        data: result as T,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  // Convenience methods with proper typing
  async getOrderById(orderId: string): Promise<QueryResult<OrderViewModel | null>> {
    return this.execute({
      type: 'GetOrderById',
      parameters: { orderId },
    });
  }

  async getOrderByNumber(orderNumber: string): Promise<QueryResult<OrderViewModel | null>> {
    return this.execute({
      type: 'GetOrderByNumber',
      parameters: { orderNumber },
    });
  }

  async getOrdersByCustomer(
    customerId: string,
    options?: {
      status?: string;
      fromDate?: string;
      toDate?: string;
      limit?: number;
      offset?: number;
      sortBy?: 'createdAt' | 'updatedAt' | 'total' | 'status';
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<QueryResult<PaginatedResult<OrderViewModel>>> {
    return this.execute({
      type: 'GetOrdersByCustomer',
      parameters: {
        customerId,
        ...options,
      },
    });
  }

  async getAllOrders(options?: {
    status?: string;
    customerId?: string;
    fromDate?: string;
    toDate?: string;
    minTotal?: number;
    maxTotal?: number;
    limit?: number;
    offset?: number;
    sortBy?: 'createdAt' | 'updatedAt' | 'total' | 'status' | 'customerName';
    sortOrder?: 'asc' | 'desc';
  }): Promise<QueryResult<PaginatedResult<OrderViewModel>>> {
    return this.execute({
      type: 'GetAllOrders',
      parameters: options || {},
    });
  }

  async getOrderStatistics(
    fromDate: string,
    toDate: string,
    options?: {
      customerId?: string;
      groupBy?: 'day' | 'week' | 'month' | 'year';
    }
  ): Promise<QueryResult<OrderStatisticsViewModel>> {
    return this.execute({
      type: 'GetOrderStatistics',
      parameters: {
        fromDate,
        toDate,
        ...options,
      },
    });
  }

  async searchOrders(
    searchTerm: string,
    options?: {
      searchFields?: Array<
        'orderNumber' | 'customerName' | 'customerEmail' | 'productName' | 'trackingNumber'
      >;
      limit?: number;
      offset?: number;
    }
  ): Promise<QueryResult<PaginatedResult<OrderViewModel>>> {
    return this.execute({
      type: 'SearchOrders',
      parameters: {
        searchTerm,
        ...options,
      },
    });
  }

  async getOrderCount(options?: {
    status?: string;
    customerId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<QueryResult<number>> {
    return this.execute({
      type: 'GetOrderCount',
      parameters: options || {},
    });
  }

  async getRevenueReport(
    fromDate: string,
    toDate: string,
    options?: {
      groupBy?: 'day' | 'week' | 'month' | 'year' | 'customer' | 'product';
      includeRefunds?: boolean;
    }
  ): Promise<QueryResult<RevenueReportViewModel>> {
    return this.execute({
      type: 'GetRevenueReport',
      parameters: {
        fromDate,
        toDate,
        ...options,
      },
    });
  }
}
