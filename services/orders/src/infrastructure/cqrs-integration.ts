import {
  OutboxProcessor,
  PostgreSQLEventStore,
  PostgreSQLOutboxStore,
} from '@graphql-microservices/event-sourcing';
import { createLogger } from '@graphql-microservices/logger';
import { RedisEventPublisher } from '@graphql-microservices/users/src/infrastructure/redis-event-publisher';
import type { Pool } from 'pg';
import { PrismaClient } from '../../generated/prisma';
import { OrderCommandBus } from '../application/commands/command-bus';
import {
  defaultOrderProjectionConfigs,
  ModernOrderProjectionService,
} from '../application/projections/modern-order-projection';
import { OrderProjectionService } from '../application/projections/order-projection';
import { OrderQueryBus } from '../application/queries/query-bus';
import {
  defaultSagaConfig,
  type ExternalServices,
  SagaManager,
} from '../application/sagas/saga-manager';
import { OrderRepository } from './order-repository';

// Create logger instance
const logger = createLogger({ service: 'orders-cqrs' });

export interface CQRSConfig {
  databaseUrl: string;
  redisUrl?: string;
  enableProjections?: boolean;
  enableModernProjections?: boolean;
  enableSagas?: boolean;
  enableOutboxProcessor?: boolean;
  outboxPollInterval?: number;
  externalServices?: ExternalServices;
}

export class OrdersCQRSIntegration {
  private eventStore!: PostgreSQLEventStore;
  private outboxStore!: PostgreSQLOutboxStore;
  private outboxProcessor!: OutboxProcessor;
  private eventPublisher!: RedisEventPublisher;
  private repository!: OrderRepository;
  private commandBus!: OrderCommandBus;
  private queryBus!: OrderQueryBus;
  private projectionService!: OrderProjectionService;
  private modernProjectionService!: ModernOrderProjectionService;
  private sagaManager!: SagaManager;
  private prisma!: PrismaClient;
  private pool!: Pool;

  constructor(private readonly config: CQRSConfig) {}

  async initialize(): Promise<void> {
    try {
      logger.info('🏗️  Initializing Orders CQRS infrastructure...');

      // Initialize Prisma
      this.prisma = new PrismaClient({
        datasources: {
          db: {
            url: this.config.databaseUrl,
          },
        },
      });

      // Initialize PostgreSQL connection pool for event store
      const { Pool } = await import('pg');
      this.pool = new Pool({
        connectionString: this.config.databaseUrl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Initialize event store
      this.eventStore = new PostgreSQLEventStore({
        connectionString: this.config.databaseUrl,
      });
      await this.eventStore.initialize();
      logger.info('✅ Event store initialized');

      // Initialize outbox store
      this.outboxStore = new PostgreSQLOutboxStore(this.config.databaseUrl);
      await this.outboxStore.initialize();
      logger.info('✅ Outbox store initialized');

      // Initialize Redis event publisher if Redis URL is provided
      if (this.config.redisUrl) {
        this.eventPublisher = new RedisEventPublisher(this.config.redisUrl);
        await this.eventPublisher.initialize();
        logger.info('📡 Redis event publisher connected');
      }

      // Initialize outbox processor
      if (this.config.enableOutboxProcessor !== false) {
        this.outboxProcessor = new OutboxProcessor(this.outboxStore, this.eventPublisher, {
          processingInterval: this.config.outboxPollInterval || 5000,
          batchSize: 100,
        });
      }

      // Initialize repository
      this.repository = new OrderRepository(this.eventStore, {
        snapshotFrequency: 10, // Create snapshot every 10 events
      });
      logger.info('✅ Order repository initialized');

      // Initialize command bus
      this.commandBus = new OrderCommandBus(this.repository);
      logger.info('✅ Command bus initialized');

      // Initialize query bus
      this.queryBus = new OrderQueryBus(this.prisma);
      logger.info('✅ Query bus initialized');

      // Initialize projection service
      if (this.config.enableProjections !== false) {
        this.projectionService = new OrderProjectionService(this.prisma, this.config.databaseUrl);
      }

      // Initialize modern projection service
      if (this.config.enableModernProjections !== false) {
        this.modernProjectionService = new ModernOrderProjectionService(
          this.eventStore,
          this.prisma,
          defaultOrderProjectionConfigs
        );
        logger.info('✅ Modern projection service initialized');
      }

      // Initialize saga manager
      if (this.config.enableSagas !== false && this.config.externalServices) {
        this.sagaManager = new SagaManager(
          this.prisma,
          this.commandBus,
          this.config.externalServices,
          defaultSagaConfig
        );
        logger.info('✅ Saga manager initialized');
      }

      logger.info('🎉 Orders CQRS infrastructure ready!');
    } catch (error) {
      logger.error('Failed to initialize Orders CQRS infrastructure', error as Error);
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      // Start outbox processor
      if (this.config.enableOutboxProcessor !== false && this.outboxProcessor?.start) {
        await this.outboxProcessor.start();
        logger.info('✅ Outbox processor started');
      }

      // Start projection service
      if (this.config.enableProjections !== false && this.projectionService) {
        await this.projectionService.start();
        logger.info('✅ Projection service started');
      }

      // Start modern projection service
      if (this.config.enableModernProjections !== false && this.modernProjectionService) {
        const startResult = await this.modernProjectionService.start();
        if (startResult.isOk) {
          logger.info('✅ Modern projection service started');
        } else {
          logger.error('Failed to start modern projection service', startResult.error);
        }
      }

      // Start saga manager
      if (this.config.enableSagas !== false && this.sagaManager) {
        const startResult = await this.sagaManager.start();
        if (startResult.isOk) {
          logger.info('✅ Saga manager started');
        } else {
          logger.error('Failed to start saga manager', startResult.error);
        }
      }
    } catch (error) {
      logger.error('Failed to start Orders CQRS services', error as Error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      logger.info('Stopping Orders CQRS infrastructure...');

      // Stop outbox processor
      if (this.outboxProcessor?.stop) {
        await this.outboxProcessor.stop();
      }

      // Stop projection service
      if (this.projectionService) {
        await this.projectionService.stop();
      }

      // Stop modern projection service
      if (this.modernProjectionService) {
        await this.modernProjectionService.stop();
      }

      // Stop saga manager
      if (this.sagaManager) {
        await this.sagaManager.stop();
      }

      // Disconnect event publisher
      if (this.eventPublisher) {
        await this.eventPublisher.close();
      }

      // Close database connections
      await this.prisma.$disconnect();
      await this.pool.end();

      logger.info('Orders CQRS infrastructure stopped');
    } catch (error) {
      logger.error('Error stopping Orders CQRS infrastructure', error as Error);
      throw error;
    }
  }

  getCommandBus(): OrderCommandBus {
    return this.commandBus;
  }

  getQueryBus(): OrderQueryBus {
    return this.queryBus;
  }

  getPrisma(): PrismaClient {
    return this.prisma;
  }

  getEventStore(): PostgreSQLEventStore {
    return this.eventStore;
  }

  getEventPublisher(): RedisEventPublisher | undefined {
    return this.eventPublisher;
  }

  getProjectionService(): OrderProjectionService | undefined {
    return this.projectionService;
  }

  getModernProjectionService(): ModernOrderProjectionService | undefined {
    return this.modernProjectionService;
  }

  getSagaManager(): SagaManager | undefined {
    return this.sagaManager;
  }
}

// Singleton instance
let cqrsIntegration: OrdersCQRSIntegration | null = null;

export async function initializeOrdersCQRS(config: CQRSConfig): Promise<OrdersCQRSIntegration> {
  if (!cqrsIntegration) {
    cqrsIntegration = new OrdersCQRSIntegration(config);
    await cqrsIntegration.initialize();
    await cqrsIntegration.start();
  }
  return cqrsIntegration;
}

export function getOrdersCQRS(): OrdersCQRSIntegration {
  if (!cqrsIntegration) {
    throw new Error('Orders CQRS not initialized. Call initializeOrdersCQRS first.');
  }
  return cqrsIntegration;
}
