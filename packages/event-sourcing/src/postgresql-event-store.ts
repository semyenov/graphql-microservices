import { createErrorLogger } from '@graphql-microservices/shared-errors';
import { type AsyncResult, type DomainError, Result } from '@graphql-microservices/shared-result';
import { Pool, type PoolClient } from 'pg';
import {
  BaseEventStore,
  type EventStoreConfig,
  type EventSubscription,
  type IStreamMetadata,
  type SubscriptionStats,
} from './event-store';
import {
  EventSourcingErrors,
  type IDomainEvent,
  type IEventStoreQuery,
  type ISnapshot,
  type IStoredEvent,
  type IStreamPosition,
} from './types';

const logError = createErrorLogger('event-sourcing-postgresql');

/**
 * PostgreSQL implementation of the event store
 */
export class PostgreSQLEventStore extends BaseEventStore {
  private readonly pool: Pool;
  private readonly subscriptions: Map<string, { interval: NodeJS.Timeout; active: boolean }> =
    new Map();

  constructor(config: EventStoreConfig) {
    super(config);
    this.pool = new Pool({
      connectionString: config.connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  /**
   * Initialize the event store schema
   */
  async initialize(): AsyncResult<void, DomainError> {
    return Result.tryCatchAsync(
      async () => {
        const client = await this.pool.connect();

        try {
          await client.query('BEGIN');

          // Create events table
          await client.query(`
          CREATE TABLE IF NOT EXISTS ${this.config.eventsTable} (
            global_position BIGSERIAL PRIMARY KEY,
            id UUID NOT NULL,
            type VARCHAR(255) NOT NULL,
            aggregate_id UUID NOT NULL,
            aggregate_type VARCHAR(255) NOT NULL,
            stream_position INTEGER NOT NULL,
            data JSONB NOT NULL,
            metadata JSONB NOT NULL,
            occurred_at TIMESTAMPTZ NOT NULL,
            stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            version INTEGER NOT NULL,
            
            UNIQUE(aggregate_id, stream_position),
            UNIQUE(id)
          )
        `);

          // Create indexes for efficient querying
          await client.query(`
          CREATE INDEX IF NOT EXISTS idx_events_aggregate_id 
          ON ${this.config.eventsTable} (aggregate_id)
        `);

          await client.query(`
          CREATE INDEX IF NOT EXISTS idx_events_aggregate_type 
          ON ${this.config.eventsTable} (aggregate_type)
        `);

          await client.query(`
          CREATE INDEX IF NOT EXISTS idx_events_type 
          ON ${this.config.eventsTable} (type)
        `);

          await client.query(`
          CREATE INDEX IF NOT EXISTS idx_events_occurred_at 
          ON ${this.config.eventsTable} (occurred_at)
        `);

          await client.query(`
          CREATE INDEX IF NOT EXISTS idx_events_global_position 
          ON ${this.config.eventsTable} (global_position)
        `);

          // Create snapshots table if enabled
          if (this.config.enableSnapshots) {
            await client.query(`
            CREATE TABLE IF NOT EXISTS ${this.config.snapshotsTable} (
              id SERIAL PRIMARY KEY,
              aggregate_id UUID NOT NULL,
              aggregate_type VARCHAR(255) NOT NULL,
              state JSONB NOT NULL,
              version INTEGER NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `);

            await client.query(`
            CREATE INDEX IF NOT EXISTS idx_snapshots_aggregate_id 
            ON ${this.config.snapshotsTable} (aggregate_id)
          `);

            await client.query(`
            CREATE INDEX IF NOT EXISTS idx_snapshots_version 
            ON ${this.config.snapshotsTable} (aggregate_id, version)
          `);
          }

          // Create outbox table if enabled
          if (this.config.enableOutbox) {
            await client.query(`
            CREATE TABLE IF NOT EXISTS ${this.config.outboxTable} (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              aggregate_id UUID NOT NULL,
              event_id UUID NOT NULL,
              event_type VARCHAR(255) NOT NULL,
              event_data JSONB NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              processed_at TIMESTAMPTZ,
              retry_count INTEGER DEFAULT 0,
              error_message TEXT
            )
          `);

            await client.query(`
            CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed 
            ON ${this.config.outboxTable} (processed_at) 
            WHERE processed_at IS NULL
          `);

            await client.query(`
            CREATE INDEX IF NOT EXISTS idx_outbox_aggregate_id 
            ON ${this.config.outboxTable} (aggregate_id)
          `);
          }

          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      (error) => EventSourcingErrors.EventStoreError('Failed to initialize event store', error)
    );
  }

  async appendToStream(
    aggregateId: string,
    events: IDomainEvent[],
    expectedVersion?: number
  ): AsyncResult<IStreamPosition[], DomainError> {
    const validation = this.validateEvents(events);
    if (Result.isErr(validation)) {
      return validation;
    }

    return this.withRetry(
      () => this.doAppendToStream(aggregateId, events, expectedVersion),
      'appendToStream'
    );
  }

  private async doAppendToStream(
    aggregateId: string,
    events: IDomainEvent[],
    expectedVersion?: number
  ): AsyncResult<IStreamPosition[], DomainError> {
    const client = await this.pool.connect();
    const positions: IStreamPosition[] = [];

    try {
      await client.query('BEGIN');

      // Lock the aggregate row to prevent concurrent updates
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [aggregateId]);

      // Check current version for optimistic concurrency
      const currentVersionResult = await this.getCurrentVersionWithClient(client, aggregateId);
      if (Result.isErr(currentVersionResult)) {
        await client.query('ROLLBACK');
        return currentVersionResult;
      }

      const currentVersion = currentVersionResult.value;

      if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
        await client.query('ROLLBACK');
        return Result.err(EventSourcingErrors.ConcurrencyConflict(expectedVersion, currentVersion));
      }

      // Insert events
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const streamPosition = currentVersion + i + 1;

        const result = await client.query(
          `
          INSERT INTO ${this.config.eventsTable} 
          (id, type, aggregate_id, aggregate_type, stream_position, data, metadata, occurred_at, version)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING global_position
        `,
          [
            event?.id,
            event?.type,
            event?.aggregateId,
            event?.aggregateType,
            streamPosition,
            JSON.stringify(event?.data),
            JSON.stringify(event?.metadata),
            event?.occurredAt,
            event?.version,
          ]
        );

        positions.push({
          globalPosition: BigInt(result.rows[0].global_position),
          streamPosition,
        });

        // Add to outbox if enabled
        if (this.config.enableOutbox) {
          await client.query(
            `
            INSERT INTO ${this.config.outboxTable}
            (id, aggregate_id, event_id, event_type, event_data)
            VALUES (gen_random_uuid(), $1, $2, $3, $4)
          `,
            [aggregateId, event.id, event.type, JSON.stringify(event)]
          );
        }
      }

      // Create snapshot if needed
      if (this.shouldCreateSnapshot(currentVersion + events.length)) {
        // This would need to be implemented based on how you reconstruct aggregates
        // For now, we'll skip automatic snapshot creation
      }

      await client.query('COMMIT');
      return Result.ok(positions);
    } catch (error) {
      await client.query('ROLLBACK');
      return Result.err(EventSourcingErrors.EventStoreError('Failed to append events', error));
    } finally {
      client.release();
    }
  }

  async readStream(
    aggregateId: string,
    fromVersion: number = 1,
    toVersion?: number
  ): AsyncResult<IStoredEvent[], DomainError> {
    return this.withRetry(
      () => this.doReadStream(aggregateId, fromVersion, toVersion),
      'readStream'
    );
  }

  private async doReadStream(
    aggregateId: string,
    fromVersion: number,
    toVersion?: number
  ): AsyncResult<IStoredEvent[], DomainError> {
    const client = await this.pool.connect();

    try {
      let query = `
        SELECT * FROM ${this.config.eventsTable}
        WHERE aggregate_id = $1 AND stream_position >= $2
      `;
      const params: unknown[] = [aggregateId, fromVersion];

      if (toVersion !== undefined) {
        query += ' AND stream_position <= $3';
        params.push(toVersion);
      }

      query += ' ORDER BY stream_position ASC';

      const result = await client.query(query, params);
      return Result.ok(result.rows.map(this.mapRowToStoredEvent));
    } catch (error) {
      return Result.err(EventSourcingErrors.EventStoreError('Failed to read stream', error));
    } finally {
      client.release();
    }
  }

  async readEvents(query: IEventStoreQuery): AsyncResult<IStoredEvent[], DomainError> {
    return this.withRetry(() => this.doReadEvents(query), 'readEvents');
  }

  private async doReadEvents(query: IEventStoreQuery): AsyncResult<IStoredEvent[], DomainError> {
    const client = await this.pool.connect();

    try {
      let sql = `SELECT * FROM ${this.config.eventsTable} WHERE 1=1`;
      const params: unknown[] = [];
      let paramIndex = 1;

      if (query.aggregateId) {
        sql += ` AND aggregate_id = $${paramIndex}`;
        params.push(query.aggregateId);
        paramIndex++;
      }

      if (query.aggregateType) {
        sql += ` AND aggregate_type = $${paramIndex}`;
        params.push(query.aggregateType);
        paramIndex++;
      }

      if (query.eventType) {
        sql += ` AND type = $${paramIndex}`;
        params.push(query.eventType);
        paramIndex++;
      }

      if (query.fromPosition) {
        sql += ` AND global_position >= $${paramIndex}`;
        params.push(query.fromPosition.toString());
        paramIndex++;
      }

      if (query.timeRange?.from) {
        sql += ` AND occurred_at >= $${paramIndex}`;
        params.push(query.timeRange.from);
        paramIndex++;
      }

      if (query.timeRange?.to) {
        sql += ` AND occurred_at <= $${paramIndex}`;
        params.push(query.timeRange.to);
        paramIndex++;
      }

      sql += ' ORDER BY global_position ASC';

      if (query.limit) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(query.limit);
      }

      const result = await client.query(sql, params);
      return Result.ok(result.rows.map(this.mapRowToStoredEvent));
    } catch (error) {
      return Result.err(EventSourcingErrors.EventStoreError('Failed to read events', error));
    } finally {
      client.release();
    }
  }

  async readAllEvents(
    fromPosition?: bigint,
    limit?: number
  ): AsyncResult<IStoredEvent[], DomainError> {
    const client = await this.pool.connect();

    try {
      let query = `SELECT * FROM ${this.config.eventsTable}`;
      const params: unknown[] = [];

      if (fromPosition !== undefined) {
        query += ' WHERE global_position >= $1';
        params.push(fromPosition.toString());
      }

      query += ' ORDER BY global_position ASC';

      if (limit !== undefined) {
        const limitIndex = params.length + 1;
        query += ` LIMIT $${limitIndex}`;
        params.push(limit);
      }

      const result = await client.query(query, params);
      return Result.ok(result.rows.map(this.mapRowToStoredEvent));
    } catch (error) {
      return Result.err(EventSourcingErrors.EventStoreError('Failed to read all events', error));
    } finally {
      client.release();
    }
  }

  async getCurrentVersion(aggregateId: string): AsyncResult<number, DomainError> {
    const client = await this.pool.connect();

    try {
      return await this.getCurrentVersionWithClient(client, aggregateId);
    } finally {
      client.release();
    }
  }

  private async getCurrentVersionWithClient(
    client: PoolClient,
    aggregateId: string
  ): AsyncResult<number, DomainError> {
    try {
      const result = await client.query(
        `
        SELECT COALESCE(MAX(stream_position), 0) as version
        FROM ${this.config.eventsTable}
        WHERE aggregate_id = $1
      `,
        [aggregateId]
      );

      return Result.ok(parseInt(result.rows[0].version));
    } catch (error) {
      return Result.err(
        EventSourcingErrors.EventStoreError('Failed to get current version', error)
      );
    }
  }

  async aggregateExists(aggregateId: string): AsyncResult<boolean, DomainError> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `
        SELECT 1 FROM ${this.config.eventsTable}
        WHERE aggregate_id = $1
        LIMIT 1
      `,
        [aggregateId]
      );

      return Result.ok(result.rows.length > 0);
    } catch (error) {
      return Result.err(
        EventSourcingErrors.EventStoreError('Failed to check aggregate existence', error)
      );
    } finally {
      client.release();
    }
  }

  async saveSnapshot(snapshot: ISnapshot): AsyncResult<void, DomainError> {
    if (!this.config.enableSnapshots) {
      return Result.err(EventSourcingErrors.EventStoreError('Snapshots are not enabled'));
    }

    const client = await this.pool.connect();

    try {
      await client.query(
        `
        INSERT INTO ${this.config.snapshotsTable}
        (aggregate_id, aggregate_type, state, version)
        VALUES ($1, $2, $3, $4)
      `,
        [
          snapshot.aggregateId,
          snapshot.aggregateType,
          JSON.stringify(snapshot.state),
          snapshot.version,
        ]
      );

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(EventSourcingErrors.EventStoreError('Failed to save snapshot', error));
    } finally {
      client.release();
    }
  }

  async loadSnapshot(aggregateId: string): AsyncResult<ISnapshot | null, DomainError> {
    if (!this.config.enableSnapshots) {
      return Result.ok(null);
    }

    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `
        SELECT * FROM ${this.config.snapshotsTable}
        WHERE aggregate_id = $1
        ORDER BY version DESC, created_at DESC
        LIMIT 1
      `,
        [aggregateId]
      );

      if (result.rows.length === 0) {
        return Result.ok(null);
      }

      const row = result.rows[0];
      return Result.ok({
        aggregateId: row.aggregate_id,
        aggregateType: row.aggregate_type,
        version: row.version,
        state: row.state,
        createdAt: new Date(row.created_at),
      });
    } catch (error) {
      return Result.err(EventSourcingErrors.EventStoreError('Failed to load snapshot', error));
    } finally {
      client.release();
    }
  }

  async loadSnapshotAtVersion(
    aggregateId: string,
    version: number
  ): AsyncResult<ISnapshot | null, DomainError> {
    if (!this.config.enableSnapshots) {
      return Result.ok(null);
    }

    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `
        SELECT * FROM ${this.config.snapshotsTable}
        WHERE aggregate_id = $1 AND version = $2
        LIMIT 1
      `,
        [aggregateId, version]
      );

      if (result.rows.length === 0) {
        return Result.ok(null);
      }

      const row = result.rows[0];
      return Result.ok({
        aggregateId: row.aggregate_id,
        aggregateType: row.aggregate_type,
        version: row.version,
        state: row.state,
        createdAt: new Date(row.created_at),
      });
    } catch (error) {
      return Result.err(
        EventSourcingErrors.EventStoreError('Failed to load snapshot at version', error)
      );
    } finally {
      client.release();
    }
  }

  async getStreamMetadata(aggregateId: string): AsyncResult<IStreamMetadata | null, DomainError> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `
        SELECT 
          aggregate_type,
          MIN(occurred_at) as created_at,
          MAX(occurred_at) as updated_at,
          MAX(version) as version,
          COUNT(*) as event_count,
          MAX(CASE WHEN type LIKE '%Deleted%' THEN 1 ELSE 0 END) as is_deleted
        FROM ${this.config.eventsTable}
        WHERE aggregate_id = $1
        GROUP BY aggregate_type
      `,
        [aggregateId]
      );

      if (result.rows.length === 0) {
        return Result.ok(null);
      }

      const row = result.rows[0];
      return Result.ok({
        aggregateId,
        aggregateType: row.aggregate_type,
        version: parseInt(row.version),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        eventCount: parseInt(row.event_count),
        isDeleted: row.is_deleted === 1,
      });
    } catch (error) {
      return Result.err(
        EventSourcingErrors.EventStoreError('Failed to get stream metadata', error)
      );
    } finally {
      client.release();
    }
  }

  async bulkAppend(
    operations: Array<{
      aggregateId: string;
      events: IDomainEvent[];
      expectedVersion?: number;
    }>
  ): AsyncResult<IStreamPosition[][], DomainError> {
    const client = await this.pool.connect();
    const allPositions: IStreamPosition[][] = [];

    try {
      await client.query('BEGIN');

      for (const operation of operations) {
        // Lock the aggregate
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [operation.aggregateId]);

        // Check version
        const currentVersionResult = await this.getCurrentVersionWithClient(
          client,
          operation.aggregateId
        );
        if (Result.isErr(currentVersionResult)) {
          await client.query('ROLLBACK');
          return currentVersionResult;
        }

        const currentVersion = currentVersionResult.value;

        if (
          operation.expectedVersion !== undefined &&
          currentVersion !== operation.expectedVersion
        ) {
          await client.query('ROLLBACK');
          return Result.err(
            EventSourcingErrors.ConcurrencyConflict(operation.expectedVersion, currentVersion)
          );
        }

        // Insert events
        const positions: IStreamPosition[] = [];
        for (let i = 0; i < operation.events.length; i++) {
          const event = operation.events[i];
          const streamPosition = currentVersion + i + 1;

          const result = await client.query(
            `
            INSERT INTO ${this.config.eventsTable} 
            (id, type, aggregate_id, aggregate_type, stream_position, data, metadata, occurred_at, version)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING global_position
          `,
            [
              event?.id,
              event?.type,
              event?.aggregateId,
              event?.aggregateType,
              streamPosition,
              JSON.stringify(event?.data),
              JSON.stringify(event?.metadata),
              event?.occurredAt,
              event?.version,
            ]
          );

          positions.push({
            globalPosition: BigInt(result.rows[0].global_position),
            streamPosition,
          });
        }

        allPositions.push(positions);
      }

      await client.query('COMMIT');
      return Result.ok(allPositions);
    } catch (error) {
      await client.query('ROLLBACK');
      return Result.err(EventSourcingErrors.EventStoreError('Failed to bulk append events', error));
    } finally {
      client.release();
    }
  }

  async subscribe(
    callback: (events: IStoredEvent[]) => Promise<void>,
    query?: IEventStoreQuery
  ): AsyncResult<EventSubscription, DomainError> {
    const id = `pg-sub-${Date.now()}-${Math.random()}`;
    let isActive = true;
    let isPaused = false;
    let lastPosition = query?.fromPosition || BigInt(0);

    const stats: SubscriptionStats = {
      eventsReceived: 0,
      eventsProcessed: 0,
      errors: 0,
      isPaused: false,
    };

    const pollInterval = setInterval(async () => {
      if (!isActive || isPaused) return;

      try {
        const eventsResult = await this.readEvents({
          ...query,
          fromPosition: lastPosition + BigInt(1),
          limit: this.config.batchSize,
        });

        if (Result.isOk(eventsResult) && eventsResult.value.length > 0) {
          stats.eventsReceived += eventsResult.value.length;
          stats.lastEventTime = new Date();

          try {
            await callback(eventsResult.value);
            stats.eventsProcessed += eventsResult.value.length;
            lastPosition =
              eventsResult.value[eventsResult.value.length - 1]?.position.globalPosition ||
              BigInt(0);
          } catch (error) {
            stats.errors++;
            logError(error, { operation: 'eventSubscriptionCallback' });
          }
        }
      } catch (error) {
        stats.errors++;
        logError(error, { operation: 'eventSubscription' });
      }
    }, 1000); // Poll every second

    this.subscriptions.set(id, { interval: pollInterval, active: true });

    const subscription: EventSubscription = {
      id,
      close: async () => {
        isActive = false;
        clearInterval(pollInterval);
        this.subscriptions.delete(id);
      },
      isActive: () => isActive,
      pause: () => {
        isPaused = true;
        stats.isPaused = true;
      },
      resume: () => {
        isPaused = false;
        stats.isPaused = false;
      },
      getStats: () => ({ ...stats }),
    };

    return Result.ok(subscription);
  }

  /**
   * Clean up resources
   */
  async close(): AsyncResult<void, DomainError> {
    try {
      // Close all subscriptions
      for (const [_id, sub] of this.subscriptions) {
        clearInterval(sub.interval);
      }
      this.subscriptions.clear();

      await this.pool.end();
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(EventSourcingErrors.EventStoreError('Failed to close event store', error));
    }
  }

  /**
   * Map database row to StoredEvent
   */
  private mapRowToStoredEvent(row: {
    id: string;
    type: string;
    aggregate_id: string;
    aggregate_type: string;
    data: any;
    metadata: any;
    occurred_at: string | Date;
    version: number;
    global_position: string;
    stream_position: number;
    stored_at: string | Date;
  }): IStoredEvent {
    return {
      id: row.id,
      type: row.type,
      aggregateId: row.aggregate_id,
      aggregateType: row.aggregate_type,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      occurredAt: new Date(row.occurred_at),
      storedAt: new Date(row.stored_at),
      version: row.version,
      position: {
        globalPosition: BigInt(row.global_position),
        streamPosition: row.stream_position,
      },
    };
  }
}
