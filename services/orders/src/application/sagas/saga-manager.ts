import type { AsyncResult, DomainError, IDomainEvent } from '@graphql-microservices/event-sourcing';
import { createLogger } from '@graphql-microservices/logger';
import { domainError, Result } from '@graphql-microservices/shared-result';
import type {
  OrderCancelledEvent,
  OrderCreatedEvent,
  OrderPaymentUpdatedEvent,
  OrderShippingUpdatedEvent,
} from '../../domain/order-aggregate';
import type { PrismaClient } from '../../generated/prisma';
import type { OrderCommandBus } from '../commands/command-bus';
import { type ExternalServices, OrderFulfillmentSaga } from './order-fulfillment-saga';

// Create logger for this module
const logger = createLogger({ service: 'saga-manager' });

/**
 * Saga configuration
 */
export interface SagaConfig {
  readonly enableOrderFulfillmentSaga: boolean;
  readonly sagaTimeout: number; // milliseconds
  readonly maxRetries: number;
  readonly retryDelayMs: number;
}

/**
 * Saga statistics for monitoring
 */
export interface SagaStats {
  readonly totalSagas: number;
  readonly activeSagas: number;
  readonly completedSagas: number;
  readonly failedSagas: number;
  readonly averageCompletionTime: number;
}

/**
 * Saga Manager - Coordinates all saga instances and event routing
 */
export class SagaManager {
  private readonly logger = createLogger({ service: 'saga-manager' });
  private readonly orderFulfillmentSaga: OrderFulfillmentSaga;
  private isStarted = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly commandBus: OrderCommandBus,
    private readonly externalServices: ExternalServices,
    private readonly config: SagaConfig
  ) {
    this.orderFulfillmentSaga = new OrderFulfillmentSaga(prisma, commandBus, externalServices);
  }

  /**
   * Start the saga manager
   */
  async start(): AsyncResult<void, DomainError> {
    if (this.isStarted) {
      return Result.ok(undefined);
    }

    try {
      this.logger.info('Starting saga manager');

      // Initialize saga tables if needed
      const initResult = await this.initializeSagaTables();
      if (Result.isErr(initResult)) {
        return initResult;
      }

      // Resume any incomplete sagas
      const resumeResult = await this.resumeIncompleteSagas();
      if (Result.isErr(resumeResult)) {
        this.logger.warn('Failed to resume some incomplete sagas', resumeResult.error);
        // Continue starting even if some sagas fail to resume
      }

      this.isStarted = true;
      this.logger.info('Saga manager started successfully');
      return Result.ok(undefined);
    } catch (error) {
      this.logger.error('Failed to start saga manager', error as Error);
      return Result.err(
        domainError('SAGA_MANAGER_START_FAILED', 'Failed to start saga manager', error)
      );
    }
  }

  /**
   * Stop the saga manager
   */
  async stop(): AsyncResult<void, DomainError> {
    if (!this.isStarted) {
      return Result.ok(undefined);
    }

    try {
      this.logger.info('Stopping saga manager');
      this.isStarted = false;
      this.logger.info('Saga manager stopped');
      return Result.ok(undefined);
    } catch (error) {
      this.logger.error('Failed to stop saga manager', error as Error);
      return Result.err(
        domainError('SAGA_MANAGER_STOP_FAILED', 'Failed to stop saga manager', error)
      );
    }
  }

  /**
   * Handle domain events and route to appropriate sagas
   */
  async handleEvent(event: IDomainEvent): AsyncResult<void, DomainError> {
    if (!this.isStarted) {
      return Result.err(domainError('SAGA_MANAGER_NOT_STARTED', 'Saga manager is not started'));
    }

    this.logger.debug('Handling event for sagas', {
      eventType: event.type,
      aggregateId: event.aggregateId,
    });

    try {
      switch (event.type) {
        case 'OrderCreated':
          if (this.config.enableOrderFulfillmentSaga) {
            return await this.orderFulfillmentSaga.startSaga(event as OrderCreatedEvent);
          }
          break;

        case 'OrderPaymentUpdated':
          if (this.config.enableOrderFulfillmentSaga) {
            return await this.orderFulfillmentSaga.handlePaymentProcessed(
              event as OrderPaymentUpdatedEvent
            );
          }
          break;

        case 'OrderCancelled':
          if (this.config.enableOrderFulfillmentSaga) {
            return await this.orderFulfillmentSaga.handleOrderCancelled(
              event as OrderCancelledEvent
            );
          }
          break;

        case 'OrderShippingUpdated':
          if (this.config.enableOrderFulfillmentSaga) {
            return await this.orderFulfillmentSaga.handleShippingUpdated(
              event as OrderShippingUpdatedEvent
            );
          }
          break;

        default:
          // Event not handled by any saga
          this.logger.debug('Event not handled by any saga', { eventType: event.type });
      }

      return Result.ok(undefined);
    } catch (error) {
      this.logger.error('Failed to handle event in saga manager', error as Error, { event });
      return Result.err(
        domainError('SAGA_EVENT_HANDLING_FAILED', 'Failed to handle event in saga manager', error)
      );
    }
  }

  /**
   * Get statistics for all sagas
   */
  async getSagaStats(): AsyncResult<SagaStats, DomainError> {
    try {
      const stats = await this.prisma.orderSaga.groupBy({
        by: ['state'],
        _count: {
          state: true,
        },
      });

      const completionTimes = await this.prisma.orderSaga.findMany({
        where: {
          completedAt: { not: null },
        },
        select: {
          createdAt: true,
          completedAt: true,
        },
      });

      let totalSagas = 0;
      let activeSagas = 0;
      let completedSagas = 0;
      let failedSagas = 0;

      for (const stat of stats) {
        const count = stat._count.state;
        totalSagas += count;

        switch (stat.state) {
          case 'COMPLETED':
            completedSagas += count;
            break;
          case 'FAILED':
            failedSagas += count;
            break;
          default:
            activeSagas += count;
        }
      }

      const averageCompletionTime =
        completionTimes.length > 0
          ? completionTimes.reduce((sum, saga) => {
              const duration = saga.completedAt!.getTime() - saga.createdAt.getTime();
              return sum + duration;
            }, 0) / completionTimes.length
          : 0;

      return Result.ok({
        totalSagas,
        activeSagas,
        completedSagas,
        failedSagas,
        averageCompletionTime,
      });
    } catch (error) {
      this.logger.error('Failed to get saga statistics', error as Error);
      return Result.err(domainError('SAGA_STATS_FAILED', 'Failed to get saga statistics', error));
    }
  }

  /**
   * Get active sagas for monitoring
   */
  async getActiveSagas(): AsyncResult<
    Array<{
      id: string;
      orderId: string;
      state: string;
      createdAt: Date;
      updatedAt: Date;
    }>,
    DomainError
  > {
    try {
      const activeSagas = await this.prisma.orderSaga.findMany({
        where: {
          state: {
            notIn: ['COMPLETED', 'FAILED'],
          },
        },
        select: {
          id: true,
          orderId: true,
          state: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 100, // Limit to most recent 100
      });

      return Result.ok(activeSagas);
    } catch (error) {
      this.logger.error('Failed to get active sagas', error as Error);
      return Result.err(
        domainError('ACTIVE_SAGAS_RETRIEVAL_FAILED', 'Failed to get active sagas', error)
      );
    }
  }

  /**
   * Get failed sagas for investigation
   */
  async getFailedSagas(limit: number = 50): AsyncResult<
    Array<{
      id: string;
      orderId: string;
      state: string;
      sagaData: any;
      createdAt: Date;
      completedAt: Date | null;
    }>,
    DomainError
  > {
    try {
      const failedSagas = await this.prisma.orderSaga.findMany({
        where: {
          state: 'FAILED',
        },
        select: {
          id: true,
          orderId: true,
          state: true,
          sagaData: true,
          createdAt: true,
          completedAt: true,
        },
        orderBy: {
          completedAt: 'desc',
        },
        take: limit,
      });

      const parsedSagas = failedSagas.map((saga) => ({
        ...saga,
        sagaData: JSON.parse(saga.sagaData),
      }));

      return Result.ok(parsedSagas);
    } catch (error) {
      this.logger.error('Failed to get failed sagas', error as Error);
      return Result.err(
        domainError('FAILED_SAGAS_RETRIEVAL_FAILED', 'Failed to get failed sagas', error)
      );
    }
  }

  /**
   * Manually retry a failed saga
   */
  async retrySaga(sagaId: string): AsyncResult<void, DomainError> {
    try {
      const saga = await this.prisma.orderSaga.findUnique({
        where: { id: sagaId },
      });

      if (!saga) {
        return Result.err(domainError('SAGA_NOT_FOUND', `Saga ${sagaId} not found`));
      }

      if (saga.state !== 'FAILED') {
        return Result.err(domainError('SAGA_NOT_FAILED', `Saga ${sagaId} is not in failed state`));
      }

      const sagaData = JSON.parse(saga.sagaData);

      // Check retry limit
      if (sagaData.retryCount >= this.config.maxRetries) {
        return Result.err(
          domainError('SAGA_RETRY_LIMIT_EXCEEDED', `Saga ${sagaId} has exceeded retry limit`)
        );
      }

      // Increment retry count and reset state
      const updatedSagaData = {
        ...sagaData,
        retryCount: sagaData.retryCount + 1,
        lastError: undefined,
      };

      await this.prisma.orderSaga.update({
        where: { id: sagaId },
        data: {
          state: 'STARTED',
          sagaData: JSON.stringify(updatedSagaData),
        },
      });

      this.logger.info('Saga retry initiated', { sagaId, retryCount: updatedSagaData.retryCount });

      // TODO: Re-trigger the saga from the appropriate step
      // This would require implementing saga state restoration logic

      return Result.ok(undefined);
    } catch (error) {
      this.logger.error('Failed to retry saga', error as Error, { sagaId });
      return Result.err(domainError('SAGA_RETRY_FAILED', 'Failed to retry saga', error));
    }
  }

  /**
   * Clean up old completed sagas
   */
  async cleanupOldSagas(olderThanDays: number = 30): AsyncResult<number, DomainError> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await this.prisma.orderSaga.deleteMany({
        where: {
          state: {
            in: ['COMPLETED', 'FAILED'],
          },
          completedAt: {
            lt: cutoffDate,
          },
        },
      });

      this.logger.info('Cleaned up old sagas', {
        deletedCount: result.count,
        olderThanDays,
      });

      return Result.ok(result.count);
    } catch (error) {
      this.logger.error('Failed to cleanup old sagas', error as Error);
      return Result.err(domainError('SAGA_CLEANUP_FAILED', 'Failed to cleanup old sagas', error));
    }
  }

  /**
   * Initialize saga tables
   */
  private async initializeSagaTables(): AsyncResult<void, DomainError> {
    try {
      // In a real implementation, this would be handled by Prisma migrations
      this.logger.debug('Saga tables initialization completed');
      return Result.ok(undefined);
    } catch (error) {
      this.logger.error('Failed to initialize saga tables', error as Error);
      return Result.err(
        domainError('SAGA_TABLES_INIT_FAILED', 'Failed to initialize saga tables', error)
      );
    }
  }

  /**
   * Resume incomplete sagas after restart
   */
  private async resumeIncompleteSagas(): AsyncResult<void, DomainError> {
    try {
      const incompleteSagas = await this.prisma.orderSaga.findMany({
        where: {
          state: {
            notIn: ['COMPLETED', 'FAILED'],
          },
          createdAt: {
            lt: new Date(Date.now() - this.config.sagaTimeout),
          },
        },
        take: 100, // Limit to avoid overwhelming on startup
      });

      this.logger.info('Found incomplete sagas to resume', { count: incompleteSagas.length });

      for (const saga of incompleteSagas) {
        try {
          // Mark timed-out sagas as failed
          await this.prisma.orderSaga.update({
            where: { id: saga.id },
            data: {
              state: 'FAILED',
              sagaData: JSON.stringify({
                ...JSON.parse(saga.sagaData),
                lastError: 'Saga timed out during restart',
              }),
              completedAt: new Date(),
            },
          });

          this.logger.info('Marked timed-out saga as failed', { sagaId: saga.id });
        } catch (error) {
          this.logger.error('Failed to mark saga as failed', error as Error, { sagaId: saga.id });
        }
      }

      return Result.ok(undefined);
    } catch (error) {
      this.logger.error('Failed to resume incomplete sagas', error as Error);
      return Result.err(
        domainError('SAGA_RESUME_FAILED', 'Failed to resume incomplete sagas', error)
      );
    }
  }
}

/**
 * Default saga configuration
 */
export const defaultSagaConfig: SagaConfig = {
  enableOrderFulfillmentSaga: true,
  sagaTimeout: 30 * 60 * 1000, // 30 minutes
  maxRetries: 3,
  retryDelayMs: 5000,
};
