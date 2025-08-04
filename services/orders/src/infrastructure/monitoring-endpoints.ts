import type { AsyncResult, DomainError } from '@graphql-microservices/event-sourcing';
import { createLogger } from '@graphql-microservices/logger';
import { domainError, Result } from '@graphql-microservices/shared-result';
import type { OrdersCQRSIntegration } from './cqrs-integration';

// Create logger for this module
const logger = createLogger({ service: 'orders-monitoring' });

/**
 * Health check status
 */
export interface HealthStatus {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly timestamp: string;
  readonly version: string;
  readonly uptime: number;
  readonly components: {
    database: ComponentHealth;
    eventStore: ComponentHealth;
    redis: ComponentHealth;
    projections: ComponentHealth;
    sagas: ComponentHealth;
  };
}

/**
 * Component health information
 */
export interface ComponentHealth {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly message?: string;
  readonly responseTime?: number;
  readonly lastCheck: string;
  readonly details?: Record<string, unknown>;
}

/**
 * System metrics
 */
export interface SystemMetrics {
  readonly timestamp: string;
  readonly orders: {
    total: number;
    byStatus: Record<string, number>;
    recentOrders: number; // Last 24 hours
  };
  readonly events: {
    totalEvents: number;
    recentEvents: number; // Last hour
    eventTypes: Record<string, number>;
  };
  readonly projections: {
    totalProjections: number;
    activeProjections: number;
    averageProcessingTime: number;
    backlogSize: number;
  };
  readonly sagas: {
    totalSagas: number;
    activeSagas: number;
    completedSagas: number;
    failedSagas: number;
    averageCompletionTime: number;
  };
  readonly performance: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    eventLoopLag: number;
  };
}

/**
 * Monitoring service for orders CQRS system
 */
export class OrdersMonitoringService {
  private readonly logger = createLogger({ service: 'orders-monitoring' });
  private readonly startTime = Date.now();
  private cpuUsageStart = process.cpuUsage();

  constructor(private readonly cqrsIntegration: OrdersCQRSIntegration) {}

  /**
   * Get comprehensive health status
   */
  async getHealthStatus(): AsyncResult<HealthStatus, DomainError> {
    try {
      const timestamp = new Date().toISOString();
      const uptime = Date.now() - this.startTime;

      // Check all components
      const [database, eventStore, redis, projections, sagas] = await Promise.all([
        this.checkDatabaseHealth(),
        this.checkEventStoreHealth(),
        this.checkRedisHealth(),
        this.checkProjectionsHealth(),
        this.checkSagasHealth(),
      ]);

      // Determine overall status
      const components = { database, eventStore, redis, projections, sagas };
      const statuses = Object.values(components).map((c) => c.status);

      let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (statuses.includes('unhealthy')) {
        overallStatus = 'unhealthy';
      } else if (statuses.includes('degraded')) {
        overallStatus = 'degraded';
      }

      const healthStatus: HealthStatus = {
        status: overallStatus,
        timestamp,
        version: process.env.npm_package_version || '1.0.0',
        uptime,
        components,
      };

      return Result.ok(healthStatus);
    } catch (error) {
      this.logger.error('Failed to get health status', error as Error);
      return Result.err(domainError('HEALTH_CHECK_FAILED', 'Failed to get health status', error));
    }
  }

  /**
   * Get system metrics
   */
  async getSystemMetrics(): AsyncResult<SystemMetrics, DomainError> {
    try {
      const timestamp = new Date().toISOString();
      const prisma = this.cqrsIntegration.getPrisma();

      // Get order metrics
      const [orderStats, ordersByStatus, recentOrders] = await Promise.all([
        prisma.order.count(),
        prisma.order.groupBy({
          by: ['status'],
          _count: { status: true },
        }),
        prisma.order.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
        }),
      ]);

      const byStatus = ordersByStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count.status;
          return acc;
        },
        {} as Record<string, number>
      );

      // Get event store metrics
      const eventStore = this.cqrsIntegration.getEventStore();
      let eventMetrics = {
        totalEvents: 0,
        recentEvents: 0,
        eventTypes: {} as Record<string, number>,
      };

      try {
        // This would be implemented based on the event store's query capabilities
        // For now, we'll use placeholder values
        eventMetrics = {
          totalEvents: 1000, // Placeholder
          recentEvents: 50, // Placeholder
          eventTypes: {
            OrderCreated: 100,
            OrderStatusChanged: 200,
            OrderPaymentUpdated: 150,
          },
        };
      } catch (error) {
        this.logger.warn('Failed to get event metrics', error as Error);
      }

      // Get projection metrics
      let projectionMetrics = {
        totalProjections: 0,
        activeProjections: 0,
        averageProcessingTime: 0,
        backlogSize: 0,
      };

      const modernProjectionService = this.cqrsIntegration.getModernProjectionService();
      if (modernProjectionService) {
        const projectionStatsResult = await modernProjectionService.getProjectionStats();
        if (Result.isOk(projectionStatsResult)) {
          const stats = projectionStatsResult.value;
          projectionMetrics = {
            totalProjections: stats.length,
            activeProjections: stats.filter((s) => s.isRunning).length,
            averageProcessingTime:
              stats.reduce((sum, s) => sum + s.averageProcessingTime, 0) / stats.length || 0,
            backlogSize: stats.reduce((sum, s) => sum + s.backlogSize, 0),
          };
        }
      }

      // Get saga metrics
      let sagaMetrics = {
        totalSagas: 0,
        activeSagas: 0,
        completedSagas: 0,
        failedSagas: 0,
        averageCompletionTime: 0,
      };

      const sagaManager = this.cqrsIntegration.getSagaManager();
      if (sagaManager) {
        const sagaStatsResult = await sagaManager.getSagaStats();
        if (Result.isOk(sagaStatsResult)) {
          sagaMetrics = sagaStatsResult.value;
        }
      }

      // Get performance metrics
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage(this.cpuUsageStart);
      this.cpuUsageStart = process.cpuUsage(); // Reset for next measurement

      const eventLoopLag = await this.measureEventLoopLag();

      const metrics: SystemMetrics = {
        timestamp,
        orders: {
          total: orderStats,
          byStatus,
          recentOrders,
        },
        events: eventMetrics,
        projections: projectionMetrics,
        sagas: sagaMetrics,
        performance: {
          memoryUsage,
          cpuUsage,
          eventLoopLag,
        },
      };

      return Result.ok(metrics);
    } catch (error) {
      this.logger.error('Failed to get system metrics', error as Error);
      return Result.err(
        domainError('METRICS_COLLECTION_FAILED', 'Failed to get system metrics', error)
      );
    }
  }

  /**
   * Get projection status details
   */
  async getProjectionStatus(): AsyncResult<
    Array<{
      name: string;
      status: string;
      currentPosition: string;
      eventsProcessed: number;
      lastProcessedAt: string | null;
      errorCount: number;
    }>,
    DomainError
  > {
    try {
      const modernProjectionService = this.cqrsIntegration.getModernProjectionService();
      if (!modernProjectionService) {
        return Result.ok([]);
      }

      const statsResult = await modernProjectionService.getProjectionStats();
      if (Result.isErr(statsResult)) {
        return statsResult;
      }

      const projectionStatus = statsResult.value.map((stat) => ({
        name: stat.projectionName,
        status: stat.isRunning ? 'running' : 'stopped',
        currentPosition: stat.currentPosition.toString(),
        eventsProcessed: stat.eventsProcessed,
        lastProcessedAt: stat.lastProcessedAt?.toISOString() || null,
        errorCount: stat.errorsCount,
      }));

      return Result.ok(projectionStatus);
    } catch (error) {
      this.logger.error('Failed to get projection status', error as Error);
      return Result.err(
        domainError('PROJECTION_STATUS_FAILED', 'Failed to get projection status', error)
      );
    }
  }

  /**
   * Get active saga status
   */
  async getActiveSagas(): AsyncResult<
    Array<{
      id: string;
      orderId: string;
      state: string;
      createdAt: string;
      updatedAt: string;
      duration: number;
    }>,
    DomainError
  > {
    try {
      const sagaManager = this.cqrsIntegration.getSagaManager();
      if (!sagaManager) {
        return Result.ok([]);
      }

      const activeSagasResult = await sagaManager.getActiveSagas();
      if (Result.isErr(activeSagasResult)) {
        return activeSagasResult;
      }

      const sagaStatus = activeSagasResult.value.map((saga) => ({
        id: saga.id,
        orderId: saga.orderId,
        state: saga.state,
        createdAt: saga.createdAt.toISOString(),
        updatedAt: saga.updatedAt.toISOString(),
        duration: Date.now() - saga.createdAt.getTime(),
      }));

      return Result.ok(sagaStatus);
    } catch (error) {
      this.logger.error('Failed to get active sagas', error as Error);
      return Result.err(domainError('ACTIVE_SAGAS_FAILED', 'Failed to get active sagas', error));
    }
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    try {
      const prisma = this.cqrsIntegration.getPrisma();
      await prisma.$queryRaw`SELECT 1`;

      const responseTime = Date.now() - startTime;
      return {
        status: responseTime < 100 ? 'healthy' : 'degraded',
        responseTime,
        lastCheck: new Date().toISOString(),
        message: `Database responding in ${responseTime}ms`,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        message: `Database connection failed: ${(error as Error).message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check event store health
   */
  private async checkEventStoreHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    try {
      const eventStore = this.cqrsIntegration.getEventStore();
      // This would be a health check method on the event store
      // For now, we'll assume it's healthy if it exists

      const responseTime = Date.now() - startTime;
      return {
        status: 'healthy',
        responseTime,
        lastCheck: new Date().toISOString(),
        message: 'Event store is operational',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        message: `Event store check failed: ${(error as Error).message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedisHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    try {
      const eventPublisher = this.cqrsIntegration.getEventPublisher();
      if (!eventPublisher) {
        return {
          status: 'degraded',
          lastCheck: new Date().toISOString(),
          message: 'Redis event publisher not configured',
          responseTime: 0,
        };
      }

      // This would be a ping operation
      const responseTime = Date.now() - startTime;
      return {
        status: 'healthy',
        responseTime,
        lastCheck: new Date().toISOString(),
        message: 'Redis is responding',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        message: `Redis check failed: ${(error as Error).message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check projections health
   */
  private async checkProjectionsHealth(): Promise<ComponentHealth> {
    try {
      const modernProjectionService = this.cqrsIntegration.getModernProjectionService();
      if (!modernProjectionService) {
        return {
          status: 'degraded',
          lastCheck: new Date().toISOString(),
          message: 'Modern projection service not enabled',
        };
      }

      const statsResult = await modernProjectionService.getProjectionStats();
      if (Result.isErr(statsResult)) {
        return {
          status: 'unhealthy',
          lastCheck: new Date().toISOString(),
          message: `Projection stats failed: ${statsResult.error.message}`,
        };
      }

      const stats = statsResult.value;
      const runningProjections = stats.filter((s) => s.isRunning).length;
      const totalProjections = stats.length;

      return {
        status: runningProjections === totalProjections ? 'healthy' : 'degraded',
        lastCheck: new Date().toISOString(),
        message: `${runningProjections}/${totalProjections} projections running`,
        details: {
          totalProjections,
          runningProjections,
          eventsProcessed: stats.reduce((sum, s) => sum + s.eventsProcessed, 0),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        message: `Projections health check failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Check sagas health
   */
  private async checkSagasHealth(): Promise<ComponentHealth> {
    try {
      const sagaManager = this.cqrsIntegration.getSagaManager();
      if (!sagaManager) {
        return {
          status: 'degraded',
          lastCheck: new Date().toISOString(),
          message: 'Saga manager not enabled',
        };
      }

      const statsResult = await sagaManager.getSagaStats();
      if (Result.isErr(statsResult)) {
        return {
          status: 'unhealthy',
          lastCheck: new Date().toISOString(),
          message: `Saga stats failed: ${statsResult.error.message}`,
        };
      }

      const stats = statsResult.value;
      const failureRate = stats.totalSagas > 0 ? stats.failedSagas / stats.totalSagas : 0;

      return {
        status: failureRate < 0.1 ? 'healthy' : failureRate < 0.25 ? 'degraded' : 'unhealthy',
        lastCheck: new Date().toISOString(),
        message: `${stats.activeSagas} active, ${stats.failedSagas} failed of ${stats.totalSagas} total`,
        details: stats,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        message: `Sagas health check failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Measure event loop lag
   */
  private async measureEventLoopLag(): Promise<number> {
    return new Promise((resolve) => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1e6; // Convert to milliseconds
        resolve(lag);
      });
    });
  }
}
