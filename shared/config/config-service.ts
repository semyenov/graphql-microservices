/**
 * Type-safe configuration service with runtime validation
 */

import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type AsyncResult,
  type DomainError,
  domainError,
  Result,
  validationError,
} from '@graphql-microservices/shared-result';
import type { z } from 'zod';

/**
 * Configuration source types
 */
export type ConfigSource =
  | { type: 'env' }
  | { type: 'file'; path: string }
  | { type: 'memory'; data: Record<string, unknown> }
  | { type: 'remote'; url: string; headers?: Record<string, string> };

/**
 * Configuration options
 */
export interface ConfigOptions<T extends z.ZodSchema> {
  schema: T;
  sources?: ConfigSource[];
  refreshInterval?: number; // milliseconds
  onValidationError?: (errors: z.ZodError) => void;
  onRefresh?: (config: z.infer<T>) => void;
}

/**
 * Configuration change event
 */
export interface ConfigChangeEvent<T> {
  previous: T;
  current: T;
  changedKeys: string[];
}

/**
 * Type-safe configuration service
 */
export class ConfigService<T extends z.ZodSchema> extends EventEmitter {
  private config: z.infer<T> | null = null;
  private readonly options: Required<ConfigOptions<T>>;
  private refreshTimer?: NodeJS.Timeout;
  private isRefreshing = false;

  constructor(options: ConfigOptions<T>) {
    super();
    this.options = {
      sources: options.sources || [{ type: 'env' }],
      refreshInterval: options.refreshInterval || 0,
      onValidationError:
        options.onValidationError ||
        ((errors) => {
          console.error('Configuration validation failed:', errors.format());
        }),
      onRefresh: options.onRefresh || (() => {}),
      ...options,
    };
  }

  /**
   * Initialize configuration
   */
  async initialize(): AsyncResult<z.infer<T>, DomainError> {
    const result = await this.load();

    if (Result.isOk(result) && this.options.refreshInterval > 0) {
      this.startAutoRefresh();
    }

    return result;
  }

  /**
   * Get current configuration
   */
  get(): Result<z.infer<T>, DomainError> {
    if (!this.config) {
      return Result.err(domainError('CONFIG_NOT_LOADED', 'Configuration has not been loaded'));
    }
    return Result.ok(this.config);
  }

  /**
   * Get configuration value by path
   */
  getValue<K extends keyof z.infer<T>>(key: K): Result<z.infer<T>[K], DomainError> {
    const configResult = this.get();
    return Result.map(configResult, (config) => config[key]);
  }

  /**
   * Get nested configuration value
   */
  getNestedValue(path: string): Result<unknown, DomainError> {
    const configResult = this.get();

    return Result.flatMap(configResult, (config) => {
      const keys = path.split('.');
      let value: any = config;

      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return Result.err(
            domainError('CONFIG_KEY_NOT_FOUND', `Configuration key '${path}' not found`)
          );
        }
      }

      return Result.ok(value);
    });
  }

  /**
   * Reload configuration
   */
  async reload(): AsyncResult<z.infer<T>, DomainError> {
    return this.load();
  }

  /**
   * Stop auto-refresh
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /**
   * Load configuration from sources
   */
  private async load(): AsyncResult<z.infer<T>, DomainError> {
    if (this.isRefreshing) {
      return Result.err(
        domainError('CONFIG_REFRESH_IN_PROGRESS', 'Configuration refresh already in progress')
      );
    }

    this.isRefreshing = true;
    try {
      // Merge configurations from all sources
      const mergedConfig = await this.mergeSources();

      return Result.flatMap(mergedConfig, (rawConfig) => {
        // Validate configuration
        const parseResult = this.options.schema.safeParse(rawConfig);

        if (!parseResult.success) {
          this.options.onValidationError(parseResult.error);

          const fieldErrors = parseResult.error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          }));

          return Result.err(validationError(fieldErrors));
        }

        const newConfig = parseResult.data;

        // Check for changes
        if (this.config) {
          const changedKeys = this.detectChanges(this.config, newConfig);
          if (changedKeys.length > 0) {
            const event: ConfigChangeEvent<z.infer<T>> = {
              previous: this.config,
              current: newConfig,
              changedKeys,
            };
            this.emit('change', event);
          }
        }

        this.config = newConfig;
        this.options.onRefresh(newConfig);

        return Result.ok(newConfig);
      });
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Merge configuration from all sources
   */
  private async mergeSources(): AsyncResult<Record<string, unknown>, DomainError> {
    let merged: Record<string, unknown> = {};

    for (const source of this.options.sources) {
      const sourceResult = await this.loadSource(source);

      if (Result.isErr(sourceResult)) {
        return sourceResult;
      }

      merged = this.deepMerge(merged, sourceResult.value);
    }

    return Result.ok(merged);
  }

  /**
   * Load configuration from a single source
   */
  private async loadSource(
    source: ConfigSource
  ): AsyncResult<Record<string, unknown>, DomainError> {
    switch (source.type) {
      case 'env':
        return Result.ok(process.env as Record<string, unknown>);

      case 'memory':
        return Result.ok(source.data);

      case 'file':
        return this.loadFromFile(source.path);

      case 'remote':
        return this.loadFromRemote(source.url, source.headers);

      default:
        return Result.err(
          domainError('UNKNOWN_CONFIG_SOURCE', `Unknown configuration source type`)
        );
    }
  }

  /**
   * Load configuration from file
   */
  private async loadFromFile(path: string): AsyncResult<Record<string, unknown>, DomainError> {
    return Result.tryCatchAsync(
      async () => {
        const absolutePath = join(process.cwd(), path);
        const content = await readFile(absolutePath, 'utf-8');

        // Parse based on file extension
        if (path.endsWith('.json')) {
          return JSON.parse(content);
        } else if (path.endsWith('.yaml') || path.endsWith('.yml')) {
          // Would need to add yaml parsing library
          throw new Error('YAML parsing not implemented');
        } else {
          throw new Error(`Unsupported file type: ${path}`);
        }
      },
      (error) =>
        domainError('CONFIG_FILE_ERROR', `Failed to load configuration from ${path}`, error)
    );
  }

  /**
   * Load configuration from remote source
   */
  private async loadFromRemote(
    url: string,
    headers?: Record<string, string>
  ): AsyncResult<Record<string, unknown>, DomainError> {
    return Result.tryCatchAsync(
      async () => {
        const response = await fetch(url, { headers });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
      },
      (error) =>
        domainError('CONFIG_REMOTE_ERROR', `Failed to load configuration from ${url}`, error)
    );
  }

  /**
   * Deep merge objects
   */
  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...target };

    for (const key in source) {
      if (Object.hasOwn(source, key)) {
        if (
          typeof source[key] === 'object' &&
          source[key] !== null &&
          !Array.isArray(source[key]) &&
          typeof result[key] === 'object' &&
          result[key] !== null &&
          !Array.isArray(result[key])
        ) {
          result[key] = this.deepMerge(
            result[key] as Record<string, unknown>,
            source[key] as Record<string, unknown>
          );
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * Detect changes between configurations
   */
  private detectChanges(previous: any, current: any, path = ''): string[] {
    const changes: string[] = [];

    // Check all keys in current
    for (const key in current) {
      const currentPath = path ? `${path}.${key}` : key;

      if (!(key in previous)) {
        changes.push(currentPath);
      } else if (typeof current[key] === 'object' && current[key] !== null) {
        if (typeof previous[key] === 'object' && previous[key] !== null) {
          changes.push(...this.detectChanges(previous[key], current[key], currentPath));
        } else {
          changes.push(currentPath);
        }
      } else if (current[key] !== previous[key]) {
        changes.push(currentPath);
      }
    }

    // Check for removed keys
    for (const key in previous) {
      if (!(key in current)) {
        const currentPath = path ? `${path}.${key}` : key;
        changes.push(currentPath);
      }
    }

    return changes;
  }

  /**
   * Start auto-refresh timer
   */
  private startAutoRefresh(): void {
    this.refreshTimer = setInterval(async () => {
      await this.reload();
    }, this.options.refreshInterval);
  }
}

/**
 * Create a typed configuration service
 */
export function createConfigService<T extends z.ZodSchema>(
  options: ConfigOptions<T>
): ConfigService<T> {
  return new ConfigService(options);
}

/**
 * Configuration builder for fluent API
 */
export class ConfigBuilder<T extends z.ZodSchema> {
  private options: ConfigOptions<T>;

  constructor(schema: T) {
    this.options = { schema };
  }

  withEnv(): this {
    this.options.sources = [...(this.options.sources || []), { type: 'env' }];
    return this;
  }

  withFile(path: string): this {
    this.options.sources = [...(this.options.sources || []), { type: 'file', path }];
    return this;
  }

  withMemory(data: Record<string, unknown>): this {
    this.options.sources = [...(this.options.sources || []), { type: 'memory', data }];
    return this;
  }

  withRemote(url: string, headers?: Record<string, string>): this {
    this.options.sources = [...(this.options.sources || []), { type: 'remote', url, headers }];
    return this;
  }

  withRefreshInterval(milliseconds: number): this {
    this.options.refreshInterval = milliseconds;
    return this;
  }

  onValidationError(handler: (errors: z.ZodError) => void): this {
    this.options.onValidationError = handler;
    return this;
  }

  onRefresh(handler: (config: z.infer<T>) => void): this {
    this.options.onRefresh = handler;
    return this;
  }

  build(): ConfigService<T> {
    return new ConfigService(this.options);
  }
}

/**
 * Create a configuration builder
 */
export function configBuilder<T extends z.ZodSchema>(schema: T): ConfigBuilder<T> {
  return new ConfigBuilder(schema);
}
