import {
  createErrorLogger,
  OptimisticConcurrencyError,
} from '@graphql-microservices/shared-errors';
import { Pool, type PoolClient } from 'pg';
import { BaseEventStore, type EventStoreConfig, type EventSubscription } from './event-store';
import type { DomainEvent, EventStoreQuery, StoredEvent, StreamPosition } from './types';

const logError = createErrorLogger('event-sourcing-postgresql');

/**
 * PostgreSQL implementation of the event store
 */
export class PostgreSQLEventStore extends BaseEventStore {
  private readonly pool: Pool;

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
  async initialize(): Promise<void> {
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
            aggregate_id UUID PRIMARY KEY,
            aggregate_type VARCHAR(255) NOT NULL,
            data JSONB NOT NULL,
            version INTEGER NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_snapshots_aggregate_type 
          ON ${this.config.snapshotsTable} (aggregate_type)
        `);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async appendToStream(
    aggregateId: string,
    events: DomainEvent[],
    expectedVersion?: number
  ): Promise<StreamPosition[]> {
    if (events.length === 0) {
      return [];
    }

    this.validateEvents(events);

    const client = await this.pool.connect();
    const positions: StreamPosition[] = [];

    try {
      await client.query('BEGIN');

      // Check current version for optimistic concurrency
      const currentVersion = await this.getCurrentVersionWithClient(client, aggregateId);

      if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
        throw new OptimisticConcurrencyError(aggregateId, expectedVersion, currentVersion);
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
      }

      await client.query('COMMIT');
      return positions;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async readStream(
    aggregateId: string,
    fromVersion: number = 1,
    toVersion?: number
  ): Promise<StoredEvent[]> {
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
      return result.rows.map(this.mapRowToStoredEvent);
    } finally {
      client.release();
    }
  }

  async readEvents(query: EventStoreQuery): Promise<StoredEvent[]> {
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
      return result.rows.map(this.mapRowToStoredEvent);
    } finally {
      client.release();
    }
  }

  async readAllEvents(fromPosition?: bigint, limit?: number): Promise<StoredEvent[]> {
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
      return result.rows.map(this.mapRowToStoredEvent);
    } finally {
      client.release();
    }
  }

  async getCurrentVersion(aggregateId: string): Promise<number> {
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
  ): Promise<number> {
    const result = await client.query(
      `
      SELECT COALESCE(MAX(stream_position), 0) as version
      FROM ${this.config.eventsTable}
      WHERE aggregate_id = $1
    `,
      [aggregateId]
    );

    return parseInt(result.rows[0].version);
  }

  async aggregateExists(aggregateId: string): Promise<boolean> {
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

      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }

  async saveSnapshot(
    aggregateId: string,
    aggregateType: string,
    snapshot: Record<string, unknown>,
    version: number
  ): Promise<void> {
    if (!this.config.enableSnapshots) {
      throw new Error('Snapshots are not enabled');
    }

    const client = await this.pool.connect();

    try {
      await client.query(
        `
        INSERT INTO ${this.config.snapshotsTable}
        (aggregate_id, aggregate_type, data, version)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (aggregate_id)
        DO UPDATE SET
          aggregate_type = EXCLUDED.aggregate_type,
          data = EXCLUDED.data,
          version = EXCLUDED.version,
          created_at = NOW()
      `,
        [aggregateId, aggregateType, JSON.stringify(snapshot), version]
      );
    } finally {
      client.release();
    }
  }

  async loadSnapshot(aggregateId: string): Promise<{
    data: Record<string, unknown>;
    version: number;
  } | null> {
    if (!this.config.enableSnapshots) {
      return null;
    }

    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `
        SELECT data, version FROM ${this.config.snapshotsTable}
        WHERE aggregate_id = $1
      `,
        [aggregateId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        data: JSON.parse(row.data),
        version: row.version,
      };
    } finally {
      client.release();
    }
  }

  async subscribe(
    callback: (events: StoredEvent[]) => Promise<void>,
    query?: EventStoreQuery
  ): Promise<EventSubscription> {
    // This is a simple implementation using polling
    // In production, you might want to use PostgreSQL LISTEN/NOTIFY
    // or a proper message queue like Redis Streams

    let isActive = true;
    let lastPosition = query?.fromPosition || BigInt(0);

    const pollInterval = setInterval(async () => {
      if (!isActive) return;

      try {
        const events = await this.readEvents({
          ...query,
          fromPosition: lastPosition + BigInt(1),
          limit: this.config.batchSize,
        });

        if (events.length > 0) {
          await callback(events);
          lastPosition = events[events.length - 1]?.position.globalPosition || BigInt(0);
        }
      } catch (error) {
        logError(error, { operation: 'eventSubscription' });
      }
    }, 1000); // Poll every second

    return {
      close: async () => {
        isActive = false;
        clearInterval(pollInterval);
      },
      isActive: () => isActive,
    };
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Map database row to StoredEvent
   */
  private mapRowToStoredEvent(row: {
    id: string;
    type: string;
    aggregate_id: string;
    aggregate_type: string;
    data: string;
    metadata: string;
    occurred_at: string;
    version: number;
    global_position: string;
    stream_position: number;
    stored_at: string;
  }): StoredEvent {
    return {
      id: row.id,
      type: row.type,
      aggregateId: row.aggregate_id,
      aggregateType: row.aggregate_type,
      data: JSON.parse(row.data),
      metadata: JSON.parse(row.metadata),
      occurredAt: new Date(row.occurred_at),
      version: row.version,
      position: {
        globalPosition: BigInt(row.global_position),
        streamPosition: row.stream_position,
      },
      storedAt: new Date(row.stored_at),
    };
  }
}
