import type {
  AsyncResult,
  DomainError,
  IEventStore,
  IStoredEvent,
} from '@graphql-microservices/event-sourcing';
import { createLogger } from '@graphql-microservices/logger';
import { domainError, NotFoundError, Result } from '@graphql-microservices/shared-result';
import type { DomainEvent } from '../../domain/events';
import type { PrismaClient } from '../../generated/prisma';
import { createOrderEventHandlers } from '../event-handlers';

// Create logger for this module
const logger = createLogger({ service: 'modern-order-projection' });

/**
 * Configuration for order projections
 */
export interface ProjectionConfig {
  readonly name: string;
  readonly batchSize: number;
  readonly pollInterval: number;
  readonly startFromBeginning: boolean;
  readonly eventTypes?: string[];
  readonly aggregateTypes?: string[];
  readonly enableRetries: boolean;
  readonly maxRetries: number;
  readonly retryDelayMs: number;
}

/**
 * Projection checkpoint for position tracking
 */
export interface ProjectionCheckpoint {
  readonly projectionName: string;
  readonly position: bigint;
  readonly processedAt: Date;
  readonly eventCount: number;
}

/**
 * Projection statistics for monitoring
 */
export interface ProjectionStats {
  readonly projectionName: string;
  readonly isRunning: boolean;
  readonly currentPosition: bigint;
  readonly eventsProcessed: number;
  readonly errorsCount: number;
  readonly lastProcessedAt: Date | null;
  readonly averageProcessingTime: number;
  readonly backlogSize: number;
}

/**
 * Enhanced Order Projection Service with modern patterns
 */
export class ModernOrderProjectionService {
  private readonly projections = new Map<string, ProjectionRunner>();
  private readonly eventHandlers: ReturnType<typeof createOrderEventHandlers>;
  private isStarted = false;

  constructor(
    private readonly eventStore: IEventStore,
    private readonly prisma: PrismaClient,
    private readonly projectionConfigs: ProjectionConfig[]
  ) {
    this.eventHandlers = createOrderEventHandlers(prisma);
  }

  /**
   * Start all configured projections
   */
  async start(): Promise<AsyncResult<void, DomainError>> {
    if (this.isStarted) {
      return Result.ok(undefined);
    }

    try {
      logger.info('Starting modern order projection service');

      // Initialize projection checkpoint table
      const initResult = await this.initializeCheckpointTable();
      if (Result.isErr(initResult)) {
        return initResult;
      }

      // Start all configured projections
      for (const config of this.projectionConfigs) {
        const startResult = await this.startProjection(config);
        if (Result.isErr(startResult)) {
          logger.error(`Failed to start projection ${config.name}`, startResult.error);
          // Continue starting other projections
        }
      }

      this.isStarted = true;
      logger.info('Modern order projection service started successfully');
      return Result.ok(undefined);
    } catch (error) {
      logger.error('Failed to start modern order projection service', error as Error);
      return Result.err(
        domainError('PROJECTION_START_FAILED', 'Failed to start projection service', error)
      );
    }
  }

  /**
   * Stop all running projections
   */
  async stop(): Promise<AsyncResult<void, DomainError>> {
    if (!this.isStarted) {
      return Result.ok(undefined);
    }

    try {
      logger.info('Stopping modern order projection service');

      // Stop all running projections
      const stopPromises = Array.from(this.projections.values()).map((projection) =>
        projection.stop()
      );

      await Promise.all(stopPromises);

      this.projections.clear();
      this.isStarted = false;

      logger.info('Modern order projection service stopped');
      return Result.ok(undefined);
    } catch (error) {
      logger.error('Failed to stop modern order projection service', error as Error);
      return Result.err(
        domainError('PROJECTION_STOP_FAILED', 'Failed to stop projection service', error)
      );
    }
  }

  /**
   * Start a specific projection
   */
  async startProjection(config: ProjectionConfig): Promise<AsyncResult<void, DomainError>> {
    if (this.projections.has(config.name)) {
      return Result.err(
        domainError('PROJECTION_ALREADY_RUNNING', `Projection ${config.name} is already running`)
      );
    }

    try {
      const projection = new ProjectionRunner(
        config,
        this.eventStore,
        this.prisma,
        this.eventHandlers
      );

      const startResult = await projection.start();
      if (Result.isErr(startResult)) {
        return startResult;
      }

      this.projections.set(config.name, projection);
      logger.info(`Projection ${config.name} started successfully`);
      return Result.ok(undefined);
    } catch (error) {
      logger.error(`Failed to start projection ${config.name}`, error as Error);
      return Result.err(
        domainError('PROJECTION_START_FAILED', `Failed to start projection ${config.name}`, error)
      );
    }
  }

  /**
   * Stop a specific projection
   */
  async stopProjection(projectionName: string): Promise<AsyncResult<void, DomainError>> {
    const projection = this.projections.get(projectionName);
    if (!projection) {
      return Result.err(
        domainError('PROJECTION_NOT_FOUND', `Projection ${projectionName} not found`)
      );
    }

    try {
      const stopResult = await projection.stop();
      if (Result.isErr(stopResult)) {
        return stopResult;
      }

      this.projections.delete(projectionName);
      logger.info(`Projection ${projectionName} stopped successfully`);
      return Result.ok(undefined);
    } catch (error) {
      logger.error(`Failed to stop projection ${projectionName}`, error as Error);
      return Result.err(
        domainError('PROJECTION_STOP_FAILED', `Failed to stop projection ${projectionName}`, error)
      );
    }
  }

  /**
   * Rebuild a specific projection from the beginning
   */
  async rebuildProjection(projectionName: string): Promise<AsyncResult<void, DomainError>> {
    logger.info(`Rebuilding projection ${projectionName}`);

    // Stop projection if running
    if (this.projections.has(projectionName)) {
      const stopResult = await this.stopProjection(projectionName);
      if (Result.isErr(stopResult)) {
        return stopResult;
      }
    }

    // Reset checkpoint to beginning
    const resetResult = await this.resetCheckpoint(projectionName);
    if (Result.isErr(resetResult)) {
      return resetResult;
    }

    // Find projection config
    const config = this.projectionConfigs.find((c) => c.name === projectionName);
    if (!config) {
      return Result.err(
        domainError(
          'PROJECTION_CONFIG_NOT_FOUND',
          `Projection config for ${projectionName} not found`
        )
      );
    }

    // Start projection with fresh checkpoint
    const startResult = await this.startProjection({
      ...config,
      startFromBeginning: true,
    });

    if (Result.isErr(startResult)) {
      return startResult;
    }

    logger.info(`Projection ${projectionName} rebuilt successfully`);
    return Result.ok(undefined);
  }

  /**
   * Get statistics for all projections
   */
  async getProjectionStats(): Promise<AsyncResult<ProjectionStats[], DomainError>> {
    try {
      const stats: ProjectionStats[] = [];

      for (const [name, projection] of this.projections) {
        const projectionStats = await projection.getStats();
        if (Result.isOk(projectionStats)) {
          stats.push(projectionStats.value);
        }
      }

      return Result.ok(stats);
    } catch (error) {
      logger.error('Failed to get projection statistics', error as Error);
      return Result.err(
        domainError('PROJECTION_STATS_FAILED', 'Failed to get projection statistics', error)
      );
    }
  }

  /**
   * Get checkpoint for a specific projection
   */
  async getCheckpoint(
    projectionName: string
  ): Promise<AsyncResult<ProjectionCheckpoint | null, DomainError>> {
    try {
      const checkpoint = await this.prisma.projectionCheckpoint.findUnique({
        where: { projectionName },
      });

      if (!checkpoint) {
        return Result.ok(null);
      }

      return Result.ok({
        projectionName: checkpoint.projectionName,
        position: BigInt(checkpoint.position),
        processedAt: checkpoint.processedAt,
        eventCount: checkpoint.eventCount,
      });
    } catch (error) {
      logger.error(`Failed to get checkpoint for ${projectionName}`, error as Error);
      return Result.err(
        domainError(
          'CHECKPOINT_READ_FAILED',
          `Failed to get checkpoint for ${projectionName}`,
          error
        )
      );
    }
  }

  /**
   * Reset checkpoint for a specific projection
   */
  private async resetCheckpoint(projectionName: string): Promise<AsyncResult<void, DomainError>> {
    try {
      await this.prisma.projectionCheckpoint.upsert({
        where: { projectionName },
        update: {
          position: '0',
          processedAt: new Date(),
          eventCount: 0,
        },
        create: {
          projectionName,
          position: '0',
          processedAt: new Date(),
          eventCount: 0,
        },
      });

      return Result.ok(undefined);
    } catch (error) {
      logger.error(`Failed to reset checkpoint for ${projectionName}`, error as Error);
      return Result.err(
        domainError(
          'CHECKPOINT_RESET_FAILED',
          `Failed to reset checkpoint for ${projectionName}`,
          error
        )
      );
    }
  }

  /**
   * Initialize the projection checkpoint table
   */
  private async initializeCheckpointTable(): Promise<AsyncResult<void, DomainError>> {
    try {
      // Create projection checkpoint table if it doesn't exist
      // Note: In a real implementation, this would be handled by migrations
      logger.debug('Projection checkpoint table initialization completed');
      return Result.ok(undefined);
    } catch (error) {
      logger.error('Failed to initialize checkpoint table', error as Error);
      return Result.err(
        domainError('CHECKPOINT_TABLE_INIT_FAILED', 'Failed to initialize checkpoint table', error)
      );
    }
  }
}

/**
 * Individual projection runner
 */
class ProjectionRunner {
  private isRunning = false;
  private processingStats = {
    eventsProcessed: 0,
    errorsCount: 0,
    lastProcessedAt: null as Date | null,
    processingTimes: [] as number[],
  };
  private pollingTimeout: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ProjectionConfig,
    private readonly eventStore: IEventStore,
    private readonly prisma: PrismaClient,
    private readonly eventHandlers: ReturnType<typeof createOrderEventHandlers>
  ) {}

  /**
   * Start the projection runner
   */
  async start(): Promise<AsyncResult<void, DomainError>> {
    if (this.isRunning) {
      return Result.ok(undefined);
    }

    try {
      logger.info(`Starting projection runner: ${this.config.name}`);
      this.isRunning = true;

      // Start the polling loop
      this.scheduleNextPoll();

      return Result.ok(undefined);
    } catch (error) {
      logger.error(`Failed to start projection runner: ${this.config.name}`, error as Error);
      return Result.err(
        domainError(
          'PROJECTION_RUNNER_START_FAILED',
          `Failed to start projection runner: ${this.config.name}`,
          error
        )
      );
    }
  }

  /**
   * Stop the projection runner
   */
  async stop(): Promise<AsyncResult<void, DomainError>> {
    if (!this.isRunning) {
      return Result.ok(undefined);
    }

    try {
      logger.info(`Stopping projection runner: ${this.config.name}`);
      this.isRunning = false;

      if (this.pollingTimeout) {
        clearTimeout(this.pollingTimeout);
        this.pollingTimeout = null;
      }

      return Result.ok(undefined);
    } catch (error) {
      logger.error(`Failed to stop projection runner: ${this.config.name}`, error as Error);
      return Result.err(
        domainError(
          'PROJECTION_RUNNER_STOP_FAILED',
          `Failed to stop projection runner: ${this.config.name}`,
          error
        )
      );
    }
  }

  /**
   * Get projection statistics
   */
  async getStats(): Promise<AsyncResult<ProjectionStats, DomainError>> {
    try {
      const checkpoint = await this.getCheckpoint();
      const currentPosition =
        Result.isOk(checkpoint) && checkpoint.value ? checkpoint.value.position : BigInt(0);

      const averageProcessingTime =
        this.processingStats.processingTimes.length > 0
          ? this.processingStats.processingTimes.reduce((a, b) => a + b, 0) /
            this.processingStats.processingTimes.length
          : 0;

      return Result.ok({
        projectionName: this.config.name,
        isRunning: this.isRunning,
        currentPosition,
        eventsProcessed: this.processingStats.eventsProcessed,
        errorsCount: this.processingStats.errorsCount,
        lastProcessedAt: this.processingStats.lastProcessedAt,
        averageProcessingTime,
        backlogSize: 0, // Would need to calculate from event store
      });
    } catch (error) {
      logger.error(`Failed to get stats for projection: ${this.config.name}`, error as Error);
      return Result.err(
        domainError(
          'PROJECTION_STATS_FAILED',
          `Failed to get stats for projection: ${this.config.name}`,
          error
        )
      );
    }
  }

  /**
   * Schedule the next polling cycle
   */
  private scheduleNextPoll(): void {
    if (!this.isRunning) {
      return;
    }

    this.pollingTimeout = setTimeout(async () => {
      await this.pollAndProcessEvents();
      this.scheduleNextPoll();
    }, this.config.pollInterval);
  }

  /**
   * Poll for new events and process them
   */
  private async pollAndProcessEvents(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      const startTime = Date.now();

      // Get current checkpoint
      const checkpointResult = await this.getCheckpoint();
      const currentPosition =
        Result.isOk(checkpointResult) && checkpointResult.value
          ? checkpointResult.value.position
          : BigInt(0);

      // Read events from event store
      const eventsResult = await this.eventStore.readAllEvents(
        currentPosition,
        this.config.batchSize
      );
      if (Result.isErr(eventsResult)) {
        logger.error(
          `Failed to read events for projection ${this.config.name}`,
          eventsResult.error
        );
        this.processingStats.errorsCount++;
        return;
      }

      const events = eventsResult.value;
      if (events.length === 0) {
        return; // No new events to process
      }

      // Filter events based on configuration
      const filteredEvents = this.filterEvents(events);
      if (filteredEvents.length === 0) {
        // Update checkpoint even if no events match our filters
        const lastEvent = events[events.length - 1];
        await this.updateCheckpoint(BigInt(lastEvent.globalPosition || 0), 0);
        return;
      }

      // Process events in batches
      for (const event of filteredEvents) {
        const processResult = await this.processEvent(event);
        if (Result.isErr(processResult)) {
          logger.error(
            `Failed to process event ${event.id} for projection ${this.config.name}`,
            processResult.error
          );
          this.processingStats.errorsCount++;

          if (this.config.enableRetries) {
            // Implement retry logic here
            await this.retryEventProcessing(event);
          }
        }
      }

      // Update checkpoint
      const lastEvent = filteredEvents[filteredEvents.length - 1];
      await this.updateCheckpoint(BigInt(lastEvent.globalPosition || 0), filteredEvents.length);

      const processingTime = Date.now() - startTime;
      this.processingStats.processingTimes.push(processingTime);
      if (this.processingStats.processingTimes.length > 100) {
        this.processingStats.processingTimes.shift(); // Keep only last 100 measurements
      }

      this.processingStats.eventsProcessed += filteredEvents.length;
      this.processingStats.lastProcessedAt = new Date();

      logger.debug(
        `Processed ${filteredEvents.length} events for projection ${this.config.name} in ${processingTime}ms`
      );
    } catch (error) {
      logger.error(`Error polling events for projection ${this.config.name}`, error as Error);
      this.processingStats.errorsCount++;
    }
  }

  /**
   * Filter events based on projection configuration
   */
  private filterEvents(events: IStoredEvent[]): IStoredEvent[] {
    let filteredEvents = events;

    // Filter by event types
    if (this.config.eventTypes && this.config.eventTypes.length > 0) {
      filteredEvents = filteredEvents.filter((event) =>
        this.config.eventTypes!.includes(event.type)
      );
    }

    // Filter by aggregate types
    if (this.config.aggregateTypes && this.config.aggregateTypes.length > 0) {
      filteredEvents = filteredEvents.filter((event) =>
        this.config.aggregateTypes!.includes(event.aggregateType)
      );
    }

    return filteredEvents;
  }

  /**
   * Process a single event
   */
  private async processEvent(event: IStoredEvent): Promise<AsyncResult<void, DomainError>> {
    try {
      // Convert stored event to domain event format
      const domainEvent: DomainEvent = {
        ...event,
        timestamp: event.occurredAt,
      };

      // Route to appropriate event handler
      switch (event.type) {
        case 'OrderCreated':
          await this.eventHandlers.orderCreated.handle(domainEvent as any);
          break;
        case 'OrderCancelled':
          await this.eventHandlers.orderCancelled.handle(domainEvent as any);
          break;
        case 'OrderStatusChanged':
          await this.eventHandlers.orderStatusChanged.handle(domainEvent as any);
          break;
        case 'OrderShippingUpdated':
          await this.eventHandlers.orderShippingUpdated.handle(domainEvent as any);
          break;
        case 'OrderItemAdded':
          await this.eventHandlers.orderItemAdded.handle(domainEvent as any);
          break;
        case 'OrderItemRemoved':
          await this.eventHandlers.orderItemRemoved.handle(domainEvent as any);
          break;
        case 'OrderPaymentUpdated':
          await this.eventHandlers.orderPaymentUpdated.handle(domainEvent as any);
          break;
        case 'OrderRefunded':
          await this.eventHandlers.orderRefunded.handle(domainEvent as any);
          break;
        default:
          logger.debug(`No handler for event type: ${event.type}`);
      }

      return Result.ok(undefined);
    } catch (error) {
      logger.error(`Failed to process event ${event.id}`, error as Error);
      return Result.err(
        domainError('EVENT_PROCESSING_FAILED', `Failed to process event ${event.id}`, error)
      );
    }
  }

  /**
   * Retry event processing with exponential backoff
   */
  private async retryEventProcessing(event: IStoredEvent): Promise<void> {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      const delay = this.config.retryDelayMs * 2 ** (attempt - 1);

      logger.info(
        `Retrying event processing (attempt ${attempt}/${this.config.maxRetries}) for event ${event.id}`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));

      const retryResult = await this.processEvent(event);
      if (Result.isOk(retryResult)) {
        logger.info(`Event ${event.id} processed successfully on retry attempt ${attempt}`);
        return;
      }

      if (attempt === this.config.maxRetries) {
        logger.error(
          `Failed to process event ${event.id} after ${this.config.maxRetries} attempts`
        );
      }
    }
  }

  /**
   * Get current checkpoint for this projection
   */
  private async getCheckpoint(): Promise<AsyncResult<ProjectionCheckpoint | null, DomainError>> {
    try {
      const checkpoint = await this.prisma.projectionCheckpoint.findUnique({
        where: { projectionName: this.config.name },
      });

      if (!checkpoint) {
        return Result.ok(null);
      }

      return Result.ok({
        projectionName: checkpoint.projectionName,
        position: BigInt(checkpoint.position),
        processedAt: checkpoint.processedAt,
        eventCount: checkpoint.eventCount,
      });
    } catch (error) {
      logger.error(`Failed to get checkpoint for projection ${this.config.name}`, error as Error);
      return Result.err(
        domainError(
          'CHECKPOINT_READ_FAILED',
          `Failed to get checkpoint for projection ${this.config.name}`,
          error
        )
      );
    }
  }

  /**
   * Update checkpoint for this projection
   */
  private async updateCheckpoint(
    position: bigint,
    eventCount: number
  ): Promise<AsyncResult<void, DomainError>> {
    try {
      await this.prisma.projectionCheckpoint.upsert({
        where: { projectionName: this.config.name },
        update: {
          position: position.toString(),
          processedAt: new Date(),
          eventCount: { increment: eventCount },
        },
        create: {
          projectionName: this.config.name,
          position: position.toString(),
          processedAt: new Date(),
          eventCount,
        },
      });

      return Result.ok(undefined);
    } catch (error) {
      logger.error(
        `Failed to update checkpoint for projection ${this.config.name}`,
        error as Error
      );
      return Result.err(
        domainError(
          'CHECKPOINT_UPDATE_FAILED',
          `Failed to update checkpoint for projection ${this.config.name}`,
          error
        )
      );
    }
  }
}

/**
 * Default projection configurations for order service
 */
export const defaultOrderProjectionConfigs: ProjectionConfig[] = [
  {
    name: 'order-read-model',
    batchSize: 50,
    pollInterval: 1000,
    startFromBeginning: true,
    aggregateTypes: ['Order'],
    enableRetries: true,
    maxRetries: 3,
    retryDelayMs: 1000,
  },
  {
    name: 'order-analytics',
    batchSize: 100,
    pollInterval: 5000,
    startFromBeginning: false,
    eventTypes: ['OrderCreated', 'OrderCancelled', 'OrderRefunded'],
    aggregateTypes: ['Order'],
    enableRetries: true,
    maxRetries: 5,
    retryDelayMs: 2000,
  },
  {
    name: 'order-notifications',
    batchSize: 25,
    pollInterval: 500,
    startFromBeginning: false,
    eventTypes: ['OrderCreated', 'OrderShippingUpdated', 'OrderDelivered'],
    aggregateTypes: ['Order'],
    enableRetries: true,
    maxRetries: 3,
    retryDelayMs: 500,
  },
];
