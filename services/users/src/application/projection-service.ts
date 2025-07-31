import type { PostgreSQLEventStore } from '@graphql-microservices/event-sourcing';
import type { PrismaClient } from '../../generated/prisma';
import type { UserEventDispatcher } from './event-handlers';

/**
 * Projection checkpoint to track processing progress
 */
export interface ProjectionCheckpoint {
  projectionName: string;
  lastProcessedPosition: bigint;
  lastProcessedAt: Date;
  isActive: boolean;
}

/**
 * Projection configuration
 */
export interface ProjectionConfig {
  name: string;
  batchSize: number;
  pollInterval: number;
  startFromBeginning: boolean;
  eventTypes?: string[];
  aggregateTypes?: string[];
}

/**
 * Projection service manages read model projections
 */
export class UserProjectionService {
  private readonly runningProjections = new Map<string, boolean>();
  private readonly projectionConfigs = new Map<string, ProjectionConfig>();

  constructor(
    private readonly eventStore: PostgreSQLEventStore,
    private readonly eventDispatcher: UserEventDispatcher,
    private readonly prisma: PrismaClient
  ) {}

  /**
   * Initialize projection service and create checkpoint table
   */
  async initialize(): Promise<void> {
    try {
      // Create projection checkpoints table if it doesn't exist
      await this.prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS projection_checkpoints (
          projection_name VARCHAR(255) PRIMARY KEY,
          last_processed_position BIGINT NOT NULL DEFAULT 0,
          last_processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      console.log('✅ Projection service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize projection service:', error);
      throw error;
    }
  }

  /**
   * Register a projection configuration
   */
  registerProjection(config: ProjectionConfig): void {
    this.projectionConfigs.set(config.name, config);
    console.log(`📝 Registered projection: ${config.name}`);
  }

  /**
   * Start a projection
   */
  async startProjection(projectionName: string): Promise<void> {
    if (this.runningProjections.get(projectionName)) {
      console.warn(`⚠️  Projection ${projectionName} is already running`);
      return;
    }

    const config = this.projectionConfigs.get(projectionName);
    if (!config) {
      throw new Error(`Projection configuration not found: ${projectionName}`);
    }

    console.log(`🚀 Starting projection: ${projectionName}`);

    this.runningProjections.set(projectionName, true);

    try {
      await this.runProjection(config);
    } catch (error) {
      console.error(`❌ Projection ${projectionName} failed:`, error);
      this.runningProjections.set(projectionName, false);
      throw error;
    }
  }

  /**
   * Stop a projection
   */
  async stopProjection(projectionName: string): Promise<void> {
    if (!this.runningProjections.get(projectionName)) {
      console.warn(`⚠️  Projection ${projectionName} is not running`);
      return;
    }

    console.log(`🛑 Stopping projection: ${projectionName}`);
    this.runningProjections.set(projectionName, false);

    // Update checkpoint to mark as inactive
    await this.updateCheckpoint(projectionName, undefined, false);
  }

  /**
   * Start all registered projections
   */
  async startAllProjections(): Promise<void> {
    const projectionNames = Array.from(this.projectionConfigs.keys());

    console.log(`🚀 Starting ${projectionNames.length} projections...`);

    const promises = projectionNames.map((name) => this.startProjection(name));
    await Promise.all(promises);

    console.log('✅ All projections started');
  }

  /**
   * Stop all running projections
   */
  async stopAllProjections(): Promise<void> {
    const runningNames = Array.from(this.runningProjections.entries())
      .filter(([, isRunning]) => isRunning)
      .map(([name]) => name);

    console.log(`🛑 Stopping ${runningNames.length} projections...`);

    const promises = runningNames.map((name) => this.stopProjection(name));
    await Promise.all(promises);

    console.log('✅ All projections stopped');
  }

  /**
   * Rebuild a projection from the beginning
   */
  async rebuildProjection(projectionName: string): Promise<void> {
    console.log(`🔄 Rebuilding projection: ${projectionName}`);

    // Stop projection if running
    if (this.runningProjections.get(projectionName)) {
      await this.stopProjection(projectionName);
    }

    // Reset checkpoint to beginning
    await this.resetCheckpoint(projectionName);

    // Start projection
    await this.startProjection(projectionName);

    console.log(`✅ Projection ${projectionName} rebuilt`);
  }

  /**
   * Get projection status
   */
  async getProjectionStatus(projectionName: string): Promise<{
    isRunning: boolean;
    checkpoint: ProjectionCheckpoint | null;
    config: ProjectionConfig | null;
  }> {
    const isRunning = this.runningProjections.get(projectionName) || false;
    const checkpoint = await this.getCheckpoint(projectionName);
    const config = this.projectionConfigs.get(projectionName) || null;

    return {
      isRunning,
      checkpoint,
      config,
    };
  }

  /**
   * Get all projection statuses
   */
  async getAllProjectionStatuses(): Promise<
    Record<
      string,
      {
        isRunning: boolean;
        checkpoint: ProjectionCheckpoint | null;
        config: ProjectionConfig | null;
      }
    >
  > {
    const projectionNames = Array.from(this.projectionConfigs.keys());
    const statuses: Record<
      string,
      {
        isRunning: boolean;
        checkpoint: ProjectionCheckpoint | null;
        config: ProjectionConfig | null;
      }
    > = {};
    for (const name of projectionNames) {
      statuses[name] = await this.getProjectionStatus(name);
    }

    return statuses;
  }

  /**
   * Run a projection continuously
   */
  private async runProjection(config: ProjectionConfig): Promise<void> {
    const { name, batchSize, pollInterval, eventTypes, aggregateTypes } = config;

    while (this.runningProjections.get(name)) {
      try {
        // Get current checkpoint
        const checkpoint = await this.getCheckpoint(name);
        const fromPosition = checkpoint?.lastProcessedPosition || BigInt(0);

        // Read events from event store
        const events = await this.eventStore.readEvents({
          fromPosition: fromPosition + BigInt(1),
          limit: batchSize,
          eventType: eventTypes?.length === 1 ? eventTypes[0] : undefined,
          aggregateType: aggregateTypes?.length === 1 ? aggregateTypes[0] : undefined,
        });

        if (events.length === 0) {
          // No new events, wait before next poll
          await this.sleep(pollInterval);
          continue;
        }

        // Filter events if multiple types specified
        let filteredEvents = events;
        if (eventTypes && eventTypes.length > 1) {
          filteredEvents = events.filter((event) => eventTypes.includes(event.type));
        }
        if (aggregateTypes && aggregateTypes.length > 1) {
          filteredEvents = filteredEvents.filter((event) =>
            aggregateTypes.includes(event.aggregateType)
          );
        }

        if (filteredEvents.length === 0) {
          // No relevant events, update checkpoint and continue
          const lastPosition = events[events.length - 1]?.position.globalPosition;
          if (lastPosition) {
            await this.updateCheckpoint(name, lastPosition);
          }
          await this.sleep(pollInterval);
          continue;
        }

        console.log(`📊 Processing ${filteredEvents.length} events for projection ${name}`);

        // Process events through dispatcher
        await this.eventDispatcher.dispatchBatch(filteredEvents);

        // Update checkpoint
        const lastProcessedPosition = events[events.length - 1]?.position.globalPosition;
        if (lastProcessedPosition) {
          await this.updateCheckpoint(name, lastProcessedPosition);
        }

        console.log(
          `✅ Processed ${filteredEvents.length} events for projection ${name}, position: ${lastProcessedPosition}`
        );
      } catch (error) {
        console.error(`❌ Error in projection ${name}:`, error);

        // Wait before retrying
        await this.sleep(pollInterval * 2);
      }
    }

    console.log(`🏁 Projection ${name} stopped`);
  }

  /**
   * Get projection checkpoint
   */
  private async getCheckpoint(projectionName: string): Promise<ProjectionCheckpoint | null> {
    try {
      const result = await this.prisma.$queryRaw<ProjectionCheckpoint[]>`
        SELECT 
          projection_name as "projectionName",
          last_processed_position as "lastProcessedPosition",
          last_processed_at as "lastProcessedAt",
          is_active as "isActive"
        FROM projection_checkpoints 
        WHERE projection_name = ${projectionName}
      `;

      if (result.length === 0) {
        return null;
      }

      const row = result[0];
      if (!row) {
        return null;
      }

      return {
        projectionName: row.projectionName,
        lastProcessedPosition: BigInt(row.lastProcessedPosition),
        lastProcessedAt: new Date(row.lastProcessedAt),
        isActive: row.isActive,
      };
    } catch (error) {
      console.error(`Failed to get checkpoint for ${projectionName}:`, error);
      return null;
    }
  }

  /**
   * Update projection checkpoint
   */
  private async updateCheckpoint(
    projectionName: string,
    position?: bigint,
    isActive: boolean = true
  ): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO projection_checkpoints 
        (projection_name, last_processed_position, last_processed_at, is_active, updated_at)
        VALUES (${projectionName}, ${position?.toString() || '0'}, NOW(), ${isActive}, NOW())
        ON CONFLICT (projection_name) 
        DO UPDATE SET
          last_processed_position = CASE 
            WHEN ${position !== undefined} THEN EXCLUDED.last_processed_position 
            ELSE projection_checkpoints.last_processed_position 
          END,
          last_processed_at = CASE 
            WHEN ${position !== undefined} THEN EXCLUDED.last_processed_at 
            ELSE projection_checkpoints.last_processed_at 
          END,
          is_active = EXCLUDED.is_active,
          updated_at = EXCLUDED.updated_at
      `;
    } catch (error) {
      console.error(`Failed to update checkpoint for ${projectionName}:`, error);
      throw error;
    }
  }

  /**
   * Reset projection checkpoint
   */
  private async resetCheckpoint(projectionName: string): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        DELETE FROM projection_checkpoints WHERE projection_name = ${projectionName}
      `;
      console.log(`🗑️  Reset checkpoint for projection ${projectionName}`);
    } catch (error) {
      console.error(`Failed to reset checkpoint for ${projectionName}:`, error);
      throw error;
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get projection health metrics
   */
  async getHealthMetrics(): Promise<{
    totalProjections: number;
    runningProjections: number;
    stoppedProjections: number;
    checkpoints: ProjectionCheckpoint[];
  }> {
    const totalProjections = this.projectionConfigs.size;
    const runningProjections = Array.from(this.runningProjections.values()).filter(Boolean).length;
    const stoppedProjections = totalProjections - runningProjections;

    // Get all checkpoints
    const checkpointsResult = await this.prisma.$queryRaw<ProjectionCheckpoint[]>`
      SELECT 
        projection_name as "projectionName",
        last_processed_position as "lastProcessedPosition",
        last_processed_at as "lastProcessedAt",
        is_active as "isActive"
      FROM projection_checkpoints
      ORDER BY projection_name
    `;

    const checkpoints: ProjectionCheckpoint[] = checkpointsResult.map((row) => {
      return {
        projectionName: row.projectionName,
        lastProcessedPosition: BigInt(row.lastProcessedPosition),
        lastProcessedAt: new Date(row.lastProcessedAt),
        isActive: row.isActive,
      };
    });

    return {
      totalProjections,
      runningProjections,
      stoppedProjections,
      checkpoints,
    };
  }
}

/**
 * Default projection configurations for user service
 */
export const defaultUserProjectionConfigs: ProjectionConfig[] = [
  {
    name: 'user-read-model',
    batchSize: 50,
    pollInterval: 1000, // 1 second
    startFromBeginning: true,
    aggregateTypes: ['User'],
  },
  {
    name: 'user-analytics',
    batchSize: 100,
    pollInterval: 5000, // 5 seconds
    startFromBeginning: false,
    eventTypes: ['UserSignedIn', 'UserSignedOut', 'UserCreated'],
    aggregateTypes: ['User'],
  },
];

/**
 * Factory function to create projection service with default configurations
 */
export function createProjectionService(
  eventStore: PostgreSQLEventStore,
  eventDispatcher: UserEventDispatcher,
  prisma: PrismaClient
): UserProjectionService {
  const projectionService = new UserProjectionService(eventStore, eventDispatcher, prisma);

  // Register default projections
  for (const config of defaultUserProjectionConfigs) {
    projectionService.registerProjection(config);
  }

  return projectionService;
}
