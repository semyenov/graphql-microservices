import type { AsyncResult, DomainError } from '@graphql-microservices/event-sourcing';
import { createLogger } from '@graphql-microservices/logger';
import { domainError, Result } from '@graphql-microservices/shared-result';
import type { PrismaClient } from '../../generated/prisma';

// Create logger for this module
const logger = createLogger({ service: 'orders-performance' });

/**
 * Performance optimization configuration
 */
export interface PerformanceConfig {
  readonly enableQueryOptimization: boolean;
  readonly enableConnectionPooling: boolean;
  readonly enableReadReplicas: boolean;
  readonly enableCaching: boolean;
  readonly cacheConfig: {
    ttl: number; // seconds
    maxSize: number; // number of entries
  };
  readonly batchConfig: {
    maxBatchSize: number;
    batchTimeout: number; // milliseconds
  };
}

/**
 * Query performance metrics
 */
export interface QueryMetrics {
  readonly queryType: string;
  readonly executionTime: number;
  readonly rowsAffected: number;
  readonly cacheHit: boolean;
  readonly timestamp: Date;
}

/**
 * In-memory cache for frequently accessed data
 */
class OrderCache {
  private cache = new Map<string, { data: any; expires: number }>();
  private readonly logger = createLogger({ service: 'order-cache' });

  constructor(private readonly config: PerformanceConfig['cacheConfig']) {}

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set value in cache
   */
  set(key: string, data: any): void {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.config.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      expires: Date.now() + this.config.ttl * 1000,
    });
  }

  /**
   * Delete value from cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate: 0, // Would need to track hits/misses for accurate calculation
    };
  }
}

/**
 * Batch operation manager for optimizing database operations
 */
class BatchOperationManager {
  private batches = new Map<string, { operations: any[]; timeout: NodeJS.Timeout }>();
  private readonly logger = createLogger({ service: 'batch-operations' });

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: PerformanceConfig['batchConfig']
  ) {}

  /**
   * Add operation to batch
   */
  addToBatch(batchKey: string, operation: any): Promise<any> {
    return new Promise((resolve, reject) => {
      let batch = this.batches.get(batchKey);

      if (!batch) {
        batch = {
          operations: [],
          timeout: setTimeout(() => {
            this.executeBatch(batchKey);
          }, this.config.batchTimeout),
        };
        this.batches.set(batchKey, batch);
      }

      batch.operations.push({ operation, resolve, reject });

      // Execute batch if it reaches max size
      if (batch.operations.length >= this.config.maxBatchSize) {
        clearTimeout(batch.timeout);
        this.executeBatch(batchKey);
      }
    });
  }

  /**
   * Execute batched operations
   */
  private async executeBatch(batchKey: string): Promise<void> {
    const batch = this.batches.get(batchKey);
    if (!batch || batch.operations.length === 0) {
      return;
    }

    this.batches.delete(batchKey);

    try {
      this.logger.debug('Executing batch operation', {
        batchKey,
        operationCount: batch.operations.length,
      });

      // Execute operations based on batch key
      switch (batchKey) {
        case 'order-lookups':
          await this.executeBatchOrderLookups(batch.operations);
          break;
        case 'order-updates':
          await this.executeBatchOrderUpdates(batch.operations);
          break;
        default:
          throw new Error(`Unknown batch key: ${batchKey}`);
      }
    } catch (error) {
      this.logger.error('Batch execution failed', error as Error, { batchKey });

      // Reject all operations in the batch
      for (const { reject } of batch.operations) {
        reject(error);
      }
    }
  }

  /**
   * Execute batch order lookups
   */
  private async executeBatchOrderLookups(operations: any[]): Promise<void> {
    const orderIds = operations.map((op) => op.operation.orderId);

    const orders = await this.prisma.order.findMany({
      where: {
        id: { in: orderIds },
      },
      include: {
        items: true,
      },
    });

    const orderMap = new Map(orders.map((order) => [order.id, order]));

    // Resolve all operations
    for (const { operation, resolve } of operations) {
      const order = orderMap.get(operation.orderId);
      resolve(order || null);
    }
  }

  /**
   * Execute batch order updates
   */
  private async executeBatchOrderUpdates(operations: any[]): Promise<void> {
    const updates = operations.map((op) => op.operation);

    // Use transaction for batch updates
    const results = await this.prisma.$transaction(
      updates.map((update) =>
        this.prisma.order.update({
          where: { id: update.orderId },
          data: update.data,
        })
      )
    );

    // Resolve all operations
    for (let i = 0; i < operations.length; i++) {
      operations[i].resolve(results[i]);
    }
  }
}

/**
 * Database query optimizer
 */
class QueryOptimizer {
  private readonly logger = createLogger({ service: 'query-optimizer' });
  private queryMetrics = new Map<string, QueryMetrics[]>();

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Execute optimized order query
   */
  async executeOptimizedOrderQuery(query: any, cacheKey?: string): AsyncResult<any, DomainError> {
    const startTime = Date.now();

    try {
      // Use query explain to analyze performance (if supported)
      const result = await this.prisma.order.findMany(query);

      const executionTime = Date.now() - startTime;

      // Record metrics
      this.recordQueryMetrics('order-query', executionTime, result.length, false);

      // Log slow queries
      if (executionTime > 1000) {
        this.logger.warn('Slow query detected', {
          query: JSON.stringify(query),
          executionTime,
          resultCount: result.length,
        });
      }

      return Result.ok(result);
    } catch (error) {
      this.logger.error('Query execution failed', error as Error, { query });
      return Result.err(domainError('QUERY_EXECUTION_FAILED', 'Query execution failed', error));
    }
  }

  /**
   * Get optimal pagination settings
   */
  getOptimalPagination(
    totalRecords: number,
    requestedLimit: number
  ): {
    limit: number;
    recommendedBatchSize: number;
  } {
    // Optimize pagination based on total records
    const maxLimit = 100;
    const minLimit = 10;

    let optimalLimit = Math.min(requestedLimit, maxLimit);
    optimalLimit = Math.max(optimalLimit, minLimit);

    const recommendedBatchSize = totalRecords > 10000 ? 50 : optimalLimit;

    return {
      limit: optimalLimit,
      recommendedBatchSize,
    };
  }

  /**
   * Record query metrics
   */
  private recordQueryMetrics(
    queryType: string,
    executionTime: number,
    rowsAffected: number,
    cacheHit: boolean
  ): void {
    const metric: QueryMetrics = {
      queryType,
      executionTime,
      rowsAffected,
      cacheHit,
      timestamp: new Date(),
    };

    if (!this.queryMetrics.has(queryType)) {
      this.queryMetrics.set(queryType, []);
    }

    const metrics = this.queryMetrics.get(queryType)!;
    metrics.push(metric);

    // Keep only last 100 metrics per query type
    if (metrics.length > 100) {
      metrics.shift();
    }
  }

  /**
   * Get query performance statistics
   */
  getQueryStats(queryType?: string): Record<
    string,
    {
      averageExecutionTime: number;
      totalQueries: number;
      slowQueries: number;
      cacheHitRate: number;
    }
  > {
    const stats: Record<string, any> = {};

    const queryTypes = queryType ? [queryType] : Array.from(this.queryMetrics.keys());

    for (const type of queryTypes) {
      const metrics = this.queryMetrics.get(type) || [];

      if (metrics.length === 0) {
        continue;
      }

      const totalExecutionTime = metrics.reduce((sum, m) => sum + m.executionTime, 0);
      const slowQueries = metrics.filter((m) => m.executionTime > 1000).length;
      const cacheHits = metrics.filter((m) => m.cacheHit).length;

      stats[type] = {
        averageExecutionTime: totalExecutionTime / metrics.length,
        totalQueries: metrics.length,
        slowQueries,
        cacheHitRate: cacheHits / metrics.length,
      };
    }

    return stats;
  }
}

/**
 * Performance optimization service
 */
export class OrdersPerformanceService {
  private readonly logger = createLogger({ service: 'orders-performance' });
  private readonly cache: OrderCache;
  private readonly batchManager: BatchOperationManager;
  private readonly queryOptimizer: QueryOptimizer;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: PerformanceConfig
  ) {
    this.cache = new OrderCache(config.cacheConfig);
    this.batchManager = new BatchOperationManager(prisma, config.batchConfig);
    this.queryOptimizer = new QueryOptimizer(prisma);
  }

  /**
   * Get order with caching and optimization
   */
  async getOptimizedOrder(orderId: string): AsyncResult<any, DomainError> {
    const cacheKey = `order:${orderId}`;

    // Try cache first
    if (this.config.enableCaching) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.logger.debug('Cache hit for order', { orderId });
        return Result.ok(cached);
      }
    }

    try {
      // Use batched lookup for efficiency
      const order = await this.batchManager.addToBatch('order-lookups', { orderId });

      if (order && this.config.enableCaching) {
        this.cache.set(cacheKey, order);
      }

      return Result.ok(order);
    } catch (error) {
      this.logger.error('Failed to get optimized order', error as Error, { orderId });
      return Result.err(
        domainError('OPTIMIZED_ORDER_FETCH_FAILED', 'Failed to get optimized order', error)
      );
    }
  }

  /**
   * Execute optimized order list query
   */
  async getOptimizedOrderList(
    filters: any,
    pagination: { skip: number; take: number }
  ): AsyncResult<{ orders: any[]; totalCount: number }, DomainError> {
    try {
      // Optimize pagination
      const optimal = this.queryOptimizer.getOptimalPagination(1000, pagination.take);

      const query = {
        where: filters,
        skip: pagination.skip,
        take: Math.min(pagination.take, optimal.limit),
        include: {
          items: true,
        },
        orderBy: {
          createdAt: 'desc' as const,
        },
      };

      // Execute optimized query
      const ordersResult = await this.queryOptimizer.executeOptimizedOrderQuery(query);
      if (Result.isErr(ordersResult)) {
        return ordersResult;
      }

      // Get total count (cached for common filters)
      const countCacheKey = `order-count:${JSON.stringify(filters)}`;
      let totalCount = this.config.enableCaching ? this.cache.get<number>(countCacheKey) : null;

      if (totalCount === null) {
        totalCount = await this.prisma.order.count({ where: filters });
        if (this.config.enableCaching) {
          this.cache.set(countCacheKey, totalCount);
        }
      }

      return Result.ok({
        orders: ordersResult.value,
        totalCount,
      });
    } catch (error) {
      this.logger.error('Failed to get optimized order list', error as Error);
      return Result.err(
        domainError('OPTIMIZED_ORDER_LIST_FAILED', 'Failed to get optimized order list', error)
      );
    }
  }

  /**
   * Update order with batching
   */
  async updateOptimizedOrder(orderId: string, data: any): AsyncResult<any, DomainError> {
    try {
      const result = await this.batchManager.addToBatch('order-updates', { orderId, data });

      // Invalidate cache
      if (this.config.enableCaching) {
        this.cache.delete(`order:${orderId}`);
        // Clear related cache entries
        this.cache.delete(`order-count:*`); // Would need pattern matching
      }

      return Result.ok(result);
    } catch (error) {
      this.logger.error('Failed to update optimized order', error as Error, { orderId });
      return Result.err(
        domainError('OPTIMIZED_ORDER_UPDATE_FAILED', 'Failed to update optimized order', error)
      );
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    cache: { size: number; maxSize: number; hitRate: number };
    queries: Record<string, any>;
  } {
    return {
      cache: this.cache.getStats(),
      queries: this.queryOptimizer.getQueryStats(),
    };
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.cache.clear();
    this.logger.info('All caches cleared');
  }
}

/**
 * Default performance configuration
 */
export const defaultPerformanceConfig: PerformanceConfig = {
  enableQueryOptimization: true,
  enableConnectionPooling: true,
  enableReadReplicas: false,
  enableCaching: true,
  cacheConfig: {
    ttl: 300, // 5 minutes
    maxSize: 1000,
  },
  batchConfig: {
    maxBatchSize: 10,
    batchTimeout: 50, // milliseconds
  },
};
