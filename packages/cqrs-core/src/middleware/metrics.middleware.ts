import type { AsyncResult, DomainError } from '@graphql-microservices/shared-result';
import { Result } from '@graphql-microservices/shared-result';
import type { ICommand } from '../types/command.js';
import type { IEvent } from '../types/event.js';
import type { IHandlerContext } from '../types/handler.js';
import type {
  ICommandMiddleware,
  IEventMiddleware,
  IQueryMiddleware,
  MiddlewareNext,
} from '../types/middleware.js';
import type { IQuery, IQueryResult } from '../types/query.js';

/**
 * Metrics collector interface
 */
export interface IMetricsCollector {
  incrementCounter(name: string, tags?: Record<string, string>): void;
  recordHistogram(name: string, value: number, tags?: Record<string, string>): void;
  recordGauge(name: string, value: number, tags?: Record<string, string>): void;
}

/**
 * Simple in-memory metrics collector
 */
export class InMemoryMetricsCollector implements IMetricsCollector {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private gauges = new Map<string, number>();

  incrementCounter(name: string, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags);
    this.counters.set(key, (this.counters.get(key) || 0) + 1);
  }

  recordHistogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);
  }

  recordGauge(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags);
    this.gauges.set(key, value);
  }

  getMetrics(): Record<string, any> {
    return {
      counters: Object.fromEntries(this.counters),
      histograms: Object.fromEntries(this.histograms),
      gauges: Object.fromEntries(this.gauges),
    };
  }

  private getKey(name: string, tags?: Record<string, string>): string {
    if (!tags) return name;
    const tagStr = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    return `${name}[${tagStr}]`;
  }
}

/**
 * Metrics middleware configuration
 */
export interface MetricsMiddlewareConfig {
  /**
   * Metrics collector
   */
  collector?: IMetricsCollector;

  /**
   * Metric name prefix
   */
  prefix?: string;

  /**
   * Default tags
   */
  defaultTags?: Record<string, string>;
}

/**
 * Command metrics middleware
 */
export class CommandMetricsMiddleware implements ICommandMiddleware {
  private readonly collector: IMetricsCollector;
  private readonly prefix: string;
  private readonly defaultTags: Record<string, string>;

  constructor(config: MetricsMiddlewareConfig = {}) {
    this.collector = config.collector || new InMemoryMetricsCollector();
    this.prefix = config.prefix || 'cqrs.command';
    this.defaultTags = config.defaultTags || {};
  }

  async execute<TCommand extends ICommand, TResult>(
    command: TCommand,
    next: MiddlewareNext<TCommand, TResult>,
    context?: IHandlerContext
  ): AsyncResult<TResult, DomainError> {
    const startTime = Date.now();
    const tags = {
      ...this.defaultTags,
      command_type: command.type,
    };

    this.collector.incrementCounter(`${this.prefix}.execution.started`, tags);

    const result = await next(command);
    const duration = Date.now() - startTime;

    if (Result.isOk(result)) {
      this.collector.incrementCounter(`${this.prefix}.execution.success`, tags);
    } else {
      this.collector.incrementCounter(`${this.prefix}.execution.error`, {
        ...tags,
        error_code: result.error.code,
      });
    }

    this.collector.recordHistogram(`${this.prefix}.execution.duration`, duration, tags);

    return result;
  }
}

/**
 * Query metrics middleware
 */
export class QueryMetricsMiddleware implements IQueryMiddleware {
  private readonly collector: IMetricsCollector;
  private readonly prefix: string;
  private readonly defaultTags: Record<string, string>;

  constructor(config: MetricsMiddlewareConfig = {}) {
    this.collector = config.collector || new InMemoryMetricsCollector();
    this.prefix = config.prefix || 'cqrs.query';
    this.defaultTags = config.defaultTags || {};
  }

  async execute<TQuery extends IQuery, TResult>(
    query: TQuery,
    next: MiddlewareNext<TQuery, IQueryResult<TResult>>,
    context?: IHandlerContext
  ): AsyncResult<IQueryResult<TResult>, DomainError> {
    const startTime = Date.now();
    const tags = {
      ...this.defaultTags,
      query_type: query.type,
      cacheable: String(query.metadata.cacheable || false),
    };

    this.collector.incrementCounter(`${this.prefix}.execution.started`, tags);

    const result = await next(query);
    const duration = Date.now() - startTime;

    if (Result.isOk(result)) {
      const resultTags = {
        ...tags,
        from_cache: String(result.value.metadata?.fromCache || false),
      };
      this.collector.incrementCounter(`${this.prefix}.execution.success`, resultTags);

      if (result.value.metadata?.fromCache) {
        this.collector.incrementCounter(`${this.prefix}.cache.hit`, tags);
      } else {
        this.collector.incrementCounter(`${this.prefix}.cache.miss`, tags);
      }
    } else {
      this.collector.incrementCounter(`${this.prefix}.execution.error`, {
        ...tags,
        error_code: result.error.code,
      });
    }

    this.collector.recordHistogram(`${this.prefix}.execution.duration`, duration, tags);

    return result;
  }
}

/**
 * Event metrics middleware
 */
export class EventMetricsMiddleware implements IEventMiddleware {
  private readonly collector: IMetricsCollector;
  private readonly prefix: string;
  private readonly defaultTags: Record<string, string>;

  constructor(config: MetricsMiddlewareConfig = {}) {
    this.collector = config.collector || new InMemoryMetricsCollector();
    this.prefix = config.prefix || 'cqrs.event';
    this.defaultTags = config.defaultTags || {};
  }

  async handle<TEvent extends IEvent>(
    event: TEvent,
    next: MiddlewareNext<TEvent, void>,
    context?: IHandlerContext
  ): AsyncResult<void, DomainError> {
    const startTime = Date.now();
    const tags = {
      ...this.defaultTags,
      event_type: event.type,
      aggregate_type: event.aggregateType || 'unknown',
    };

    this.collector.incrementCounter(`${this.prefix}.handling.started`, tags);

    const result = await next(event);
    const duration = Date.now() - startTime;

    if (Result.isOk(result)) {
      this.collector.incrementCounter(`${this.prefix}.handling.success`, tags);
    } else {
      this.collector.incrementCounter(`${this.prefix}.handling.error`, {
        ...tags,
        error_code: result.error.code,
      });
    }

    this.collector.recordHistogram(`${this.prefix}.handling.duration`, duration, tags);

    return result;
  }
}
