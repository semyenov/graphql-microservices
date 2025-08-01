import { 
  PostgresEventStore,
  PostgresOutboxStore,
  OutboxProcessor,
  RedisEventPublisher,
} from '@graphql-microservices/event-sourcing';
import { PrismaClient } from '../generated/prisma';
import { OrderCommandBus } from '../application/commands/command-bus';
import { OrderQueryBus } from '../application/queries/query-bus';
import { OrderProjectionService } from '../application/projections/order-projection';
import { logInfo, logError } from '@graphql-microservices/shared-logging';
import type { Pool } from 'pg';

export interface CQRSConfig {
  databaseUrl: string;
  redisUrl?: string;
  enableProjections?: boolean;
  enableOutboxProcessor?: boolean;
  outboxPollInterval?: number;
}

export class OrdersCQRSIntegration {
  private eventStore!: PostgresEventStore;
  private outboxStore!: PostgresOutboxStore;
  private outboxProcessor!: OutboxProcessor;
  private eventPublisher!: RedisEventPublisher;
  private commandBus!: OrderCommandBus;
  private queryBus!: OrderQueryBus;
  private projectionService!: OrderProjectionService;
  private prisma!: PrismaClient;
  private pool!: Pool;

  constructor(private readonly config: CQRSConfig) {}

  async initialize(): Promise<void> {
    try {
      logInfo('🏗️  Initializing Orders CQRS infrastructure...');

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
      this.eventStore = new PostgresEventStore(this.pool);
      await this.eventStore.initialize();
      logInfo('✅ Event store initialized');

      // Initialize outbox store
      this.outboxStore = new PostgresOutboxStore(this.pool);
      await this.outboxStore.initialize();
      logInfo('✅ Outbox store initialized');

      // Initialize Redis event publisher if Redis URL is provided
      if (this.config.redisUrl) {
        this.eventPublisher = new RedisEventPublisher({
          redisUrl: this.config.redisUrl,
          defaultChannel: 'order.events',
        });
        await this.eventPublisher.connect();
        logInfo('📡 Redis event publisher connected');
      }

      // Initialize outbox processor
      if (this.config.enableOutboxProcessor !== false) {
        this.outboxProcessor = new OutboxProcessor(
          this.outboxStore,
          this.eventPublisher,
          {
            pollInterval: this.config.outboxPollInterval || 5000,
            batchSize: 100,
          }
        );
      }

      // Initialize command bus
      this.commandBus = new OrderCommandBus(this.eventStore);
      logInfo('✅ Command bus initialized');

      // Initialize query bus
      this.queryBus = new OrderQueryBus(this.prisma);
      logInfo('✅ Query bus initialized');

      // Initialize projection service
      if (this.config.enableProjections !== false) {
        this.projectionService = new OrderProjectionService(
          this.prisma,
          this.config.databaseUrl
        );
      }

      logInfo('🎉 Orders CQRS infrastructure ready!');
    } catch (error) {
      logError('Failed to initialize Orders CQRS infrastructure', error as Error);
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      // Start outbox processor
      if (this.config.enableOutboxProcessor !== false && this.outboxProcessor?.start) {
        await this.outboxProcessor.start();
        logInfo('✅ Outbox processor started');
      }

      // Start projection service
      if (this.config.enableProjections !== false && this.projectionService) {
        await this.projectionService.start();
        logInfo('✅ Projection service started');
      }
    } catch (error) {
      logError('Failed to start Orders CQRS services', error as Error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      logInfo('Stopping Orders CQRS infrastructure...');

      // Stop outbox processor
      if (this.outboxProcessor?.stop) {
        await this.outboxProcessor.stop();
      }

      // Stop projection service
      if (this.projectionService) {
        await this.projectionService.stop();
      }

      // Disconnect event publisher
      if (this.eventPublisher) {
        await this.eventPublisher.disconnect();
      }

      // Close database connections
      await this.prisma.$disconnect();
      await this.pool.end();

      logInfo('Orders CQRS infrastructure stopped');
    } catch (error) {
      logError('Error stopping Orders CQRS infrastructure', error as Error);
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

  getEventStore(): PostgresEventStore {
    return this.eventStore;
  }

  getEventPublisher(): RedisEventPublisher | undefined {
    return this.eventPublisher;
  }

  getProjectionService(): OrderProjectionService | undefined {
    return this.projectionService;
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