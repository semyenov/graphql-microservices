import { Pool } from 'pg';
import { OutboxEventStatus, OutboxProcessor, type IOutboxEvent, type IOutboxStore } from './outbox';
import type { IDomainEvent } from './types';

/**
 * PostgreSQL implementation of the outbox store
 */
export class PostgreSQLOutboxStore implements IOutboxStore {
  private readonly pool: Pool;
  private readonly tableName: string;

  constructor(connectionString: string, tableName: string = 'outbox_events') {
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    this.tableName = tableName;
  }

  /**
   * Initialize the outbox schema
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          event_id UUID NOT NULL,
          event_type VARCHAR(255) NOT NULL,
          aggregate_id UUID NOT NULL,
          aggregate_type VARCHAR(255) NOT NULL,
          event_data JSONB NOT NULL,
          metadata JSONB NOT NULL,
          occurred_at TIMESTAMPTZ NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          retry_count INTEGER NOT NULL DEFAULT 0,
          max_retries INTEGER NOT NULL DEFAULT 5,
          next_retry_at TIMESTAMPTZ,
          last_error TEXT,
          routing_key VARCHAR(255),
          publish_metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          
          UNIQUE(event_id)
        )
      `);

      // Create indexes for efficient querying
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_outbox_status 
        ON ${this.tableName} (status)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_outbox_next_retry 
        ON ${this.tableName} (status, next_retry_at) 
        WHERE status = 'FAILED'
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_outbox_created_at 
        ON ${this.tableName} (created_at)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_outbox_aggregate 
        ON ${this.tableName} (aggregate_type, aggregate_id)
      `);

      // Create trigger to update updated_at timestamp
      await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ language 'plpgsql'
      `);

      await client.query(`
        DROP TRIGGER IF EXISTS update_${this.tableName}_updated_at ON ${this.tableName};
        CREATE TRIGGER update_${this.tableName}_updated_at
          BEFORE UPDATE ON ${this.tableName}
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      `);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async addEvents(events: IDomainEvent[], routingKey?: string): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const event of events) {
        await client.query(
          `
          INSERT INTO ${this.tableName} 
          (event_id, event_type, aggregate_id, aggregate_type, event_data, metadata, occurred_at, routing_key)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (event_id) DO NOTHING
        `,
          [
            event.id,
            event.type,
            event.aggregateId,
            event.aggregateType,
            JSON.stringify(event.data),
            JSON.stringify(event.metadata),
            event.occurredAt,
            routingKey,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getPendingEvents(limit: number = 10): Promise<IOutboxEvent[]> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `
        SELECT * FROM ${this.tableName}
        WHERE status = $1
        ORDER BY created_at ASC
        LIMIT $2
      `,
        [OutboxEventStatus.PENDING, limit]
      );

      return result.rows.map(this.mapRowToOutboxEvent);
    } finally {
      client.release();
    }
  }

  async markAsProcessing(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) {
      return;
    }

    const client = await this.pool.connect();

    try {
      await client.query(
        `
        UPDATE ${this.tableName}
        SET status = $1
        WHERE id = ANY($2)
      `,
        [OutboxEventStatus.PROCESSING, eventIds]
      );
    } finally {
      client.release();
    }
  }

  async markAsPublished(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) {
      return;
    }

    const client = await this.pool.connect();

    try {
      await client.query(
        `
        UPDATE ${this.tableName}
        SET status = $1
        WHERE id = ANY($2)
      `,
        [OutboxEventStatus.PUBLISHED, eventIds]
      );
    } finally {
      client.release();
    }
  }

  async markAsFailed(eventIds: string[], error: string): Promise<void> {
    if (eventIds.length === 0) {
      return;
    }

    const client = await this.pool.connect();

    try {
      await client.query(
        `
        UPDATE ${this.tableName}
        SET 
          status = $1,
          retry_count = retry_count + 1,
          next_retry_at = $2,
          last_error = $3
        WHERE id = ANY($4)
      `,
        [
          OutboxEventStatus.FAILED,
          OutboxProcessor.calculateNextRetryTime(0, {
            initialRetryDelay: 1000,
            retryBackoffMultiplier: 2,
            maxRetryDelay: 300000,
            maxRetries: 5,
            batchSize: 10,
            processingInterval: 5000,
          }),
          error,
          eventIds,
        ]
      );
    } finally {
      client.release();
    }
  }

  async getFailedEventsForRetry(limit: number = 10): Promise<IOutboxEvent[]> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `
        SELECT * FROM ${this.tableName}
        WHERE status = $1 
          AND retry_count < max_retries 
          AND (next_retry_at IS NULL OR next_retry_at <= NOW())
        ORDER BY created_at ASC
        LIMIT $2
      `,
        [OutboxEventStatus.FAILED, limit]
      );

      return result.rows.map(this.mapRowToOutboxEvent);
    } finally {
      client.release();
    }
  }

  async cleanupPublishedEvents(olderThan: Date): Promise<number> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `
        DELETE FROM ${this.tableName}
        WHERE status = $1 AND created_at < $2
      `,
        [OutboxEventStatus.PUBLISHED, olderThan]
      );

      return result.rowCount || 0;
    } finally {
      client.release();
    }
  }

  /**
   * Get outbox statistics
   */
  async getStatistics(): Promise<{
    pending: number;
    processing: number;
    published: number;
    failed: number;
    total: number;
  }> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM ${this.tableName}
        GROUP BY status
      `);

      const stats = {
        pending: 0,
        processing: 0,
        published: 0,
        failed: 0,
        total: 0,
      };

      for (const row of result.rows) {
        const count = parseInt(row.count);
        stats.total += count;

        switch (row.status) {
          case OutboxEventStatus.PENDING:
            stats.pending = count;
            break;
          case OutboxEventStatus.PROCESSING:
            stats.processing = count;
            break;
          case OutboxEventStatus.PUBLISHED:
            stats.published = count;
            break;
          case OutboxEventStatus.FAILED:
            stats.failed = count;
            break;
        }
      }

      return stats;
    } finally {
      client.release();
    }
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Map database row to OutboxEvent
   */
  private mapRowToOutboxEvent(row: {
    id: string;
    event_id: string;
    event_type: string;
    aggregate_id: string;
    aggregate_type: string;
    metadata: string;
    occurred_at: string;
    status: string;
    next_retry_at: string | null;
    last_error: string | null;
    event_data: string;
    publish_metadata: string | null;
    created_at: string;
    updated_at: string;
    routing_key: string;
    retry_count: number;
    max_retries: number;
    processed_at: string | null;
    error_message: string | null;
  }): IOutboxEvent {
    return {
      id: row.id,
      event: {
        id: row.event_id,
        type: row.event_type,
        aggregateId: row.aggregate_id,
        aggregateType: row.aggregate_type,
        data: JSON.parse(row.event_data),
        metadata: JSON.parse(row.metadata),
        occurredAt: new Date(row.occurred_at),
        version: 1, // We don't store version in outbox, it's in the event store
      },
      status: row.status as OutboxEventStatus,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : undefined,
      lastError: row.last_error ?? undefined,
      routingKey: row.routing_key,
      publishMetadata: row.publish_metadata ? JSON.parse(row.publish_metadata) : undefined,
    };
  }
}
