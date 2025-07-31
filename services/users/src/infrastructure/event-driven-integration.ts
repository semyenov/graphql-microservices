import type { CacheService } from '@graphql-microservices/shared-cache';
import type { PubSubService } from '@graphql-microservices/shared-pubsub';
import type { PrismaClient } from '../../generated/prisma';
import { UserEventDispatcher } from '../application/event-handlers';
import {
  createProjectionService,
  type UserProjectionService,
} from '../application/projection-service';
import { CQRSInfrastructure, type CQRSInfrastructureConfig } from './cqrs-integration';
import { createUserEventSubscriber, type RedisEventSubscriber } from './redis-event-subscriber';

/**
 * Complete event-driven architecture integration
 */
export interface EventDrivenConfig {
  cqrs: CQRSInfrastructureConfig;
  enableEventSubscription?: boolean;
  enableProjections?: boolean;
  additionalEventChannels?: string[];
}

/**
 * Event-driven integration service
 * Manages the complete event-driven architecture for the user service
 */
export class EventDrivenIntegration {
  private readonly cqrsInfrastructure: CQRSInfrastructure;
  private readonly eventDispatcher: UserEventDispatcher;
  private readonly eventSubscriber?: RedisEventSubscriber;
  private readonly projectionService?: UserProjectionService;
  private isInitialized = false;

  constructor(
    private readonly config: EventDrivenConfig,
    private readonly prisma: PrismaClient,
    private readonly cacheService?: CacheService,
    private readonly pubSubService?: PubSubService
  ) {
    // Initialize CQRS infrastructure
    this.cqrsInfrastructure = new CQRSInfrastructure(
      this.config.cqrs,
      this.prisma,
      this.cacheService
    );

    // Initialize event dispatcher
    this.eventDispatcher = new UserEventDispatcher(
      this.prisma,
      this.cacheService,
      this.pubSubService
    );

    // Initialize event subscriber if enabled
    if (this.config.enableEventSubscription !== false) {
      this.eventSubscriber = createUserEventSubscriber(
        this.config.cqrs.redisUrl,
        this.eventDispatcher,
        this.config.additionalEventChannels
      );
    }

    // Initialize projection service if enabled
    if (this.config.enableProjections !== false) {
      this.projectionService = createProjectionService(
        this.cqrsInfrastructure.getEventStore(),
        this.eventDispatcher,
        prisma
      );
    }
  }

  /**
   * Initialize the complete event-driven architecture
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('⚠️  Event-driven integration is already initialized');
      return;
    }

    console.log('🏗️  Initializing event-driven architecture...');

    try {
      // 1. Initialize CQRS infrastructure (event store, outbox, etc.)
      await this.cqrsInfrastructure.initialize();

      // 2. Initialize projection service
      if (this.projectionService) {
        console.log('📊 Initializing projection service...');
        await this.projectionService.initialize();
        console.log('✅ Projection service initialized');
      }

      // 3. Start projections
      if (this.projectionService) {
        console.log('🚀 Starting projections...');
        await this.projectionService.startAllProjections();
        console.log('✅ Projections started');
      }

      // 4. Start event subscriber
      if (this.eventSubscriber) {
        console.log('📡 Starting event subscriber...');
        await this.eventSubscriber.start();
        console.log('✅ Event subscriber started');
      }

      this.isInitialized = true;
      console.log('🎉 Event-driven architecture initialized successfully!');
    } catch (error) {
      console.error('❌ Failed to initialize event-driven architecture:', error);
      throw error;
    }
  }

  /**
   * Shutdown the event-driven architecture
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    console.log('🛑 Shutting down event-driven architecture...');

    try {
      // 1. Stop event subscriber
      if (this.eventSubscriber) {
        console.log('📡 Stopping event subscriber...');
        await this.eventSubscriber.stop();
        console.log('✅ Event subscriber stopped');
      }

      // 2. Stop projections
      if (this.projectionService) {
        console.log('📊 Stopping projections...');
        await this.projectionService.stopAllProjections();
        console.log('✅ Projections stopped');
      }

      // 3. Shutdown CQRS infrastructure
      await this.cqrsInfrastructure.shutdown();

      this.isInitialized = false;
      console.log('✅ Event-driven architecture shutdown complete');
    } catch (error) {
      console.error('❌ Error during event-driven architecture shutdown:', error);
      throw error;
    }
  }

  /**
   * Get command bus for executing commands
   */
  getCommandBus() {
    return this.cqrsInfrastructure.getCommandBus();
  }

  /**
   * Get query bus for executing queries
   */
  getQueryBus() {
    return this.cqrsInfrastructure.getQueryBus();
  }

  /**
   * Get event dispatcher for manual event processing
   */
  getEventDispatcher() {
    return this.eventDispatcher;
  }

  /**
   * Get projection service for projection management
   */
  getProjectionService() {
    return this.projectionService;
  }

  /**
   * Get event subscriber for monitoring
   */
  getEventSubscriber() {
    return this.eventSubscriber;
  }

  /**
   * Get CQRS infrastructure for advanced operations
   */
  getCQRSInfrastructure() {
    return this.cqrsInfrastructure;
  }

  /**
   * Get comprehensive health status
   */
  async getHealthStatus(): Promise<{
    isInitialized: boolean;
    cqrs: Record<string, unknown>;
    eventSubscriber?: Record<string, unknown>;
    projections?: Record<string, unknown>;
  }> {
    try {
      const [cqrsHealth, subscriberHealth, projectionHealth] = await Promise.all([
        this.cqrsInfrastructure.getHealthStatus(),
        this.eventSubscriber?.isHealthy() || Promise.resolve(true),
        this.projectionService?.getHealthMetrics() || Promise.resolve(null),
      ]);

      return {
        isInitialized: this.isInitialized,
        cqrs: cqrsHealth,
        eventSubscriber: this.eventSubscriber
          ? {
              isHealthy: subscriberHealth,
              status: this.eventSubscriber.getStatus(),
            }
          : undefined,
        projections: projectionHealth ?? undefined,
      };
    } catch (error) {
      console.error('Health check failed:', error);
      return {
        isInitialized: false,
        cqrs: {
          eventStore: false,
          outboxStore: false,
          outboxProcessor: false,
          eventPublisher: false,
        },
      };
    }
  }

  /**
   * Get comprehensive metrics
   */
  async getMetrics(): Promise<{
    cqrs: Record<string, unknown>;
    eventSubscriber?: Record<string, unknown>;
    projections?: Record<string, unknown>;
  }> {
    try {
      const [cqrsMetrics, subscriberStats, projectionStatuses] = await Promise.all([
        this.cqrsInfrastructure.getMetrics(),
        this.eventSubscriber?.getStatistics() || Promise.resolve(null),
        this.projectionService?.getAllProjectionStatuses() || Promise.resolve(null),
      ]);

      return {
        cqrs: cqrsMetrics,
        eventSubscriber: subscriberStats ?? undefined,
        projections: projectionStatuses ?? undefined,
      };
    } catch (error) {
      console.error('Failed to get metrics:', error);
      throw error;
    }
  }

  /**
   * Replay events for debugging/recovery
   */
  async replayEvents(
    aggregateId?: string,
    fromPosition?: bigint,
    eventTypes?: string[]
  ): Promise<void> {
    console.log('🔄 Starting event replay...');

    try {
      if (aggregateId) {
        // Replay events for specific aggregate
        await this.cqrsInfrastructure.replayEventsForAggregate(aggregateId);
      } else {
        // Replay all events matching criteria
        const eventStore = this.cqrsInfrastructure.getEventStore();
        const events = await eventStore.readEvents({
          fromPosition,
          eventType: eventTypes?.length === 1 ? eventTypes[0] : undefined,
          limit: 1000, // Safety limit
        });

        if (events.length > 0) {
          console.log(`📚 Replaying ${events.length} events...`);
          await this.eventDispatcher.dispatchBatch(events);
          console.log('✅ Event replay completed');
        } else {
          console.log('📚 No events found for replay');
        }
      }
    } catch (error) {
      console.error('❌ Event replay failed:', error);
      throw error;
    }
  }

  /**
   * Rebuild projections
   */
  async rebuildProjections(projectionNames?: string[]): Promise<void> {
    if (!this.projectionService) {
      throw new Error('Projection service is not enabled');
    }

    console.log('🔄 Rebuilding projections...');

    try {
      if (projectionNames && projectionNames.length > 0) {
        // Rebuild specific projections
        for (const name of projectionNames) {
          await this.projectionService.rebuildProjection(name);
        }
      } else {
        // Rebuild all projections
        const statuses = await this.projectionService.getAllProjectionStatuses();
        const allProjectionNames = Object.keys(statuses);

        for (const name of allProjectionNames) {
          await this.projectionService.rebuildProjection(name);
        }
      }

      console.log('✅ Projection rebuild completed');
    } catch (error) {
      console.error('❌ Projection rebuild failed:', error);
      throw error;
    }
  }

  /**
   * Check if the integration is properly initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Wait for the integration to be ready
   */
  async waitForReady(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (!this.isInitialized && Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!this.isInitialized) {
      throw new Error(`Event-driven integration failed to initialize within ${timeoutMs}ms`);
    }
  }
}

/**
 * Factory function to create event-driven integration with sensible defaults
 */
export function createEventDrivenIntegration(
  config: Partial<EventDrivenConfig> & { cqrs: CQRSInfrastructureConfig },
  prisma: PrismaClient,
  cacheService?: CacheService,
  pubSubService?: PubSubService
): EventDrivenIntegration {
  const fullConfig: EventDrivenConfig = {
    enableEventSubscription: true,
    enableProjections: true,
    additionalEventChannels: [],
    ...config,
  };

  return new EventDrivenIntegration(fullConfig, prisma, cacheService, pubSubService);
}
