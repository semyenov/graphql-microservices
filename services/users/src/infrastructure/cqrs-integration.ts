import type { CacheService } from '@graphql-microservices/shared-cache';
import {
  OutboxProcessor,
  PostgreSQLEventStore,
  PostgreSQLOutboxStore,
} from '@graphql-microservices/shared-event-sourcing';
import type { PrismaClient } from '../../generated/prisma';
import { UserCommandBus } from '../application/command-handlers';
import { UserQueryBus } from '../application/query-handlers';
import { RedisEventPublisher } from './redis-event-publisher';

/**
 * CQRS Infrastructure Configuration
 */
export interface CQRSInfrastructureConfig {
  databaseUrl: string;
  redisUrl?: string;
  enableSnapshots?: boolean;
  snapshotFrequency?: number;
  outboxProcessingInterval?: number;
  enableOutboxProcessor?: boolean;
}

/**
 * CQRS Infrastructure - Sets up event store, outbox, and CQRS buses
 */
export class CQRSInfrastructure {
  private readonly eventStore: PostgreSQLEventStore;
  private readonly outboxStore: PostgreSQLOutboxStore;
  private readonly commandBus: UserCommandBus;
  private readonly queryBus: UserQueryBus;
  private readonly outboxProcessor: OutboxProcessor;
  private readonly eventPublisher: RedisEventPublisher;

  constructor(
    private readonly config: CQRSInfrastructureConfig,
    private readonly prisma: PrismaClient,
    private readonly cacheService?: CacheService
  ) {
    // Configure event store
    const eventStoreConfig = {
      connectionString: config.databaseUrl,
      eventsTable: 'events',
      snapshotsTable: 'snapshots',
      enableSnapshots: config.enableSnapshots || true,
      snapshotFrequency: config.snapshotFrequency || 50,
      batchSize: 100,
    };

    // Initialize infrastructure components
    this.eventStore = new PostgreSQLEventStore(eventStoreConfig);
    this.outboxStore = new PostgreSQLOutboxStore(config.databaseUrl, 'outbox_events');

    // Initialize event publisher
    this.eventPublisher = new RedisEventPublisher(config.redisUrl);

    // Initialize outbox processor
    this.outboxProcessor = new OutboxProcessor(this.outboxStore, this.eventPublisher, {
      maxRetries: 5,
      initialRetryDelay: 1000,
      retryBackoffMultiplier: 2,
      maxRetryDelay: 300000,
      batchSize: 10,
      processingInterval: config.outboxProcessingInterval || 5000,
    });

    // Initialize CQRS buses
    this.commandBus = new UserCommandBus(this.eventStore, this.outboxStore);
    this.queryBus = new UserQueryBus(this.prisma, this.eventStore, this.cacheService);
  }

  /**
   * Initialize the CQRS infrastructure
   */
  async initialize(): Promise<void> {
    console.log('🏗️  Initializing CQRS infrastructure...');

    try {
      // Initialize event store schema
      await this.eventStore.initialize();
      console.log('✅ Event store initialized');

      // Initialize outbox store schema
      await this.outboxStore.initialize();
      console.log('✅ Outbox store initialized');

      // Initialize event publisher
      await this.eventPublisher.initialize();
      console.log('✅ Event publisher initialized');

      // Start outbox processor if enabled
      if (this.config.enableOutboxProcessor !== false) {
        this.outboxProcessor.start();
        console.log('✅ Outbox processor started');
      }

      console.log('🎉 CQRS infrastructure ready!');
    } catch (error) {
      console.error('❌ Failed to initialize CQRS infrastructure:', error);
      throw error;
    }
  }

  /**
   * Shutdown the CQRS infrastructure
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down CQRS infrastructure...');

    try {
      // Stop outbox processor
      this.outboxProcessor.stop();
      console.log('✅ Outbox processor stopped');

      // Close event publisher
      await this.eventPublisher.close();
      console.log('✅ Event publisher closed');

      // Close stores
      await this.eventStore.close();
      await this.outboxStore.close();
      console.log('✅ Event and outbox stores closed');

      console.log('✅ CQRS infrastructure shutdown complete');
    } catch (error) {
      console.error('❌ Error during CQRS infrastructure shutdown:', error);
      throw error;
    }
  }

  /**
   * Get command bus for executing commands
   */
  getCommandBus(): UserCommandBus {
    return this.commandBus;
  }

  /**
   * Get query bus for executing queries
   */
  getQueryBus(): UserQueryBus {
    return this.queryBus;
  }

  /**
   * Get event store for direct access (use carefully)
   */
  getEventStore(): PostgreSQLEventStore {
    return this.eventStore;
  }

  /**
   * Get outbox store for direct access (use carefully)
   */
  getOutboxStore(): PostgreSQLOutboxStore {
    return this.outboxStore;
  }

  /**
   * Get outbox processor for monitoring
   */
  getOutboxProcessor(): OutboxProcessor {
    return this.outboxProcessor;
  }

  /**
   * Get infrastructure health status
   */
  async getHealthStatus(): Promise<{
    eventStore: boolean;
    outboxStore: boolean;
    outboxProcessor: boolean;
    eventPublisher: boolean;
  }> {
    try {
      const [_eventStoreHealth, _outboxStoreHealth, eventPublisherHealth] = await Promise.all([
        // Check event store connectivity
        this.eventStore.aggregateExists('health-check-aggregate-id'),

        // Check outbox store connectivity
        this.outboxStore.getStatistics(),

        // Check event publisher connectivity
        this.eventPublisher.isHealthy(),
      ]);

      return {
        eventStore: true, // If no error was thrown
        outboxStore: true, // If no error was thrown
        outboxProcessor: this.outboxProcessor.isRunning(),
        eventPublisher: eventPublisherHealth,
      };
    } catch (error) {
      console.error('Health check failed:', error);
      return {
        eventStore: false,
        outboxStore: false,
        outboxProcessor: false,
        eventPublisher: false,
      };
    }
  }

  /**
   * Get infrastructure metrics
   */
  async getMetrics(): Promise<{
    outboxStats: Record<string, unknown>;
    processingStats: Record<string, unknown>;
  }> {
    try {
      const [outboxStats, processingStats] = await Promise.all([
        this.outboxStore.getStatistics(),
        this.outboxProcessor.getStatistics(),
      ]);

      return {
        outboxStats,
        processingStats,
      };
    } catch (error) {
      console.error('Failed to get metrics:', error);
      throw error;
    }
  }

  /**
   * Replay events for a specific aggregate (admin operation)
   */
  async replayEventsForAggregate(aggregateId: string): Promise<void> {
    console.log(`🔄 Replaying events for aggregate ${aggregateId}...`);

    try {
      const events = await this.eventStore.readStream(aggregateId);

      console.log(`📚 Found ${events.length} events to replay`);

      // Add events to outbox for re-publishing
      if (events.length > 0) {
        await this.outboxStore.addEvents(events, 'replay.events');
        console.log(`✅ Added ${events.length} events to outbox for replay`);
      }
    } catch (error) {
      console.error(`❌ Failed to replay events for aggregate ${aggregateId}:`, error);
      throw error;
    }
  }
}
