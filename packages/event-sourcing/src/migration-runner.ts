import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Client } from 'pg';

/**
 * Migration runner for event sourcing database schema
 */
export class MigrationRunner {
  private readonly connectionString: string;
  private readonly migrationsPath: string;

  constructor(connectionString: string, migrationsPath?: string) {
    this.connectionString = connectionString;
    this.migrationsPath = migrationsPath || join(dirname(__filename), '../migrations');
  }

  /**
   * Run all pending migrations
   */
  async runMigrations(): Promise<void> {
    const client = new Client({ connectionString: this.connectionString });

    try {
      await client.connect();

      // Create migrations tracking table
      await this.createMigrationsTable(client);

      // Get all migration files
      const migrationFiles = this.getMigrationFiles();

      // Get applied migrations
      const appliedMigrations = await this.getAppliedMigrations(client);

      // Run pending migrations
      for (const file of migrationFiles) {
        if (!appliedMigrations.includes(file)) {
          console.log(`Running migration: ${file}`);
          await this.runMigration(client, file);
          await this.recordMigration(client, file);
          console.log(`✅ Completed migration: ${file}`);
        } else {
          console.log(`⏭️  Skipping already applied migration: ${file}`);
        }
      }

      console.log('🎉 All migrations completed successfully');
    } finally {
      await client.end();
    }
  }

  /**
   * Create the migrations tracking table
   */
  private async createMigrationsTable(client: Client): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_sourcing_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  /**
   * Get all migration files sorted by name
   */
  private getMigrationFiles(): string[] {
    try {
      const files = readdirSync(this.migrationsPath)
        .filter((file) => file.endsWith('.sql'))
        .sort();

      if (files.length === 0) {
        console.log('No migration files found');
      }

      return files;
    } catch (error) {
      throw new Error(
        `Could not read migrations directory: ${this.migrationsPath}. Error: ${error}`
      );
    }
  }

  /**
   * Get list of applied migrations
   */
  private async getAppliedMigrations(client: Client): Promise<string[]> {
    const result = await client.query(
      'SELECT filename FROM event_sourcing_migrations ORDER BY applied_at ASC'
    );

    return result.rows.map((row) => row.filename);
  }

  /**
   * Execute a single migration file
   */
  private async runMigration(client: Client, filename: string): Promise<void> {
    const filePath = join(this.migrationsPath, filename);

    try {
      const sql = readFileSync(filePath, 'utf8');

      // Execute migration in a transaction
      await client.query('BEGIN');

      try {
        await client.query(sql);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      throw new Error(`Failed to run migration ${filename}: ${error}`);
    }
  }

  /**
   * Record a successfully applied migration
   */
  private async recordMigration(client: Client, filename: string): Promise<void> {
    await client.query('INSERT INTO event_sourcing_migrations (filename) VALUES ($1)', [filename]);
  }

  /**
   * Rollback the last migration (use with caution!)
   */
  async rollbackLastMigration(): Promise<void> {
    console.warn('⚠️  Migration rollback is not implemented. Handle rollbacks manually.');
    console.warn(
      '⚠️  Event sourcing systems should never lose events - consider data migration instead.'
    );
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<{
    applied: string[];
    pending: string[];
  }> {
    const client = new Client({ connectionString: this.connectionString });

    try {
      await client.connect();
      await this.createMigrationsTable(client);

      const allMigrations = this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations(client);

      const pending = allMigrations.filter((file) => !appliedMigrations.includes(file));

      return {
        applied: appliedMigrations,
        pending,
      };
    } finally {
      await client.end();
    }
  }
}

/**
 * CLI runner for migrations
 */
export async function runMigrationsFromCLI(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const runner = new MigrationRunner(connectionString);

  const command = process.argv[2];

  switch (command) {
    case 'migrate':
      await runner.runMigrations();
      break;

    case 'status':
      {
        const status = await runner.getMigrationStatus();
        console.log('\n📊 Migration Status:');
        console.log(`✅ Applied: ${status.applied.length} migrations`);
        console.log(`⏳ Pending: ${status.pending.length} migrations`);

        if (status.pending.length > 0) {
          console.log('\n📋 Pending migrations:');
          status.pending.forEach((file) => console.log(`  - ${file}`));
        }
      }
      break;

    default:
      console.log('Usage:');
      console.log('  bun run migrate      - Run all pending migrations');
      console.log('  bun run migrate status - Show migration status');
      break;
  }
}

// If this file is run directly, execute CLI
if (import.meta.main) {
  runMigrationsFromCLI().catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
}
