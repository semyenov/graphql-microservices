/**
 * Tracing utilities for CQRS components
 */

import {
  type AsyncResult,
  type DomainError,
  domainError,
  Result,
} from '@graphql-microservices/shared-result';

/**
 * Mock span interface for when OpenTelemetry is not available
 */
interface MockSpan {
  setStatus(status: { code: number; message?: string }): void;
  recordException(exception: Error): void;
  setAttribute(key: string, value: string | number | boolean): void;
  end(): void;
}

/**
 * Create a mock span for development/testing
 */
function createMockSpan(name: string): MockSpan {
  const startTime = Date.now();

  return {
    setStatus(status: { code: number; message?: string }) {
      if (process.env.NODE_ENV === 'development') {
        console.log(
          `[TRACE] ${name} - Status: ${status.code === 1 ? 'OK' : 'ERROR'}${status.message ? ` - ${status.message}` : ''}`
        );
      }
    },

    recordException(exception: Error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`[TRACE] ${name} - Exception:`, exception.message);
      }
    },

    setAttribute(key: string, value: string | number | boolean) {
      if (process.env.NODE_ENV === 'development' && process.env.TRACE_VERBOSE === 'true') {
        console.log(`[TRACE] ${name} - Attribute: ${key}=${value}`);
      }
    },

    end() {
      const duration = Date.now() - startTime;
      if (process.env.NODE_ENV === 'development') {
        console.log(`[TRACE] ${name} - Duration: ${duration}ms`);
      }
    },
  };
}

/**
 * Current span context (for simplicity, using a mock implementation)
 */
let currentSpan: MockSpan | null = null;

/**
 * Create a span and execute a function within it
 */
export async function createSpan<T>(
  name: string,
  fn: (span: MockSpan) => Promise<Result<T, DomainError>>
): AsyncResult<T, DomainError> {
  const span = createMockSpan(name);
  const previousSpan = currentSpan;
  currentSpan = span;

  try {
    const result = await fn(span);
    span.end();
    return result;
  } catch (error) {
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    span.setStatus({ code: 2, message: error instanceof Error ? error.message : String(error) });
    span.end();
    return Result.err(domainError('TRACING_ERROR', 'Error during traced operation', error));
  } finally {
    currentSpan = previousSpan;
  }
}

/**
 * Add attributes to the current span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  if (currentSpan) {
    for (const [key, value] of Object.entries(attributes)) {
      currentSpan.setAttribute(key, value);
    }
  }
}

/**
 * Set the status of the current span
 */
export function setSpanStatus(code: number, message?: string): void {
  if (currentSpan) {
    currentSpan.setStatus({ code, message });
  }
}

/**
 * Record an exception in the current span
 */
export function recordSpanException(exception: Error): void {
  if (currentSpan) {
    currentSpan.recordException(exception);
  }
}

/**
 * Trace metadata for events and commands
 */
export interface TraceMetadata {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  baggage?: Record<string, string>;
}

/**
 * Generate a simple trace ID
 */
export function generateTraceId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate a simple span ID
 */
export function generateSpanId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Extract trace context from metadata
 */
export function extractTraceContext(metadata?: Record<string, unknown>): TraceMetadata {
  if (!metadata) {
    return {
      traceId: generateTraceId(),
      spanId: generateSpanId(),
    };
  }

  return {
    traceId: (metadata.traceId as string) || generateTraceId(),
    spanId: (metadata.spanId as string) || generateSpanId(),
    parentSpanId: metadata.parentSpanId as string,
    baggage: metadata.baggage as Record<string, string>,
  };
}

/**
 * Inject trace context into metadata
 */
export function injectTraceContext(
  metadata: Record<string, unknown>,
  context: TraceMetadata
): Record<string, unknown> {
  return {
    ...metadata,
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    baggage: context.baggage,
  };
}

/**
 * Trace decorator for class methods
 */
export function Trace(spanName?: string) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const name = spanName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      return createSpan(name, async (span) => {
        try {
          const result = await originalMethod.apply(this, args);

          // Handle Result type
          if (result && typeof result === 'object' && 'isOk' in result) {
            if (!result.isOk) {
              span.setStatus({ code: 2, message: result.error?.message });
            }
          }

          return result;
        } catch (error) {
          span.recordException(error instanceof Error ? error : new Error(String(error)));
          throw error;
        }
      });
    };

    return descriptor;
  };
}

/**
 * Metrics recording (mock implementation)
 */
export interface MetricRecorder {
  recordCounter(name: string, value: number, tags?: Record<string, string>): void;
  recordGauge(name: string, value: number, tags?: Record<string, string>): void;
  recordHistogram(name: string, value: number, tags?: Record<string, string>): void;
}

/**
 * Mock metric recorder for development
 */
class MockMetricRecorder implements MetricRecorder {
  recordCounter(name: string, value: number, tags?: Record<string, string>): void {
    if (process.env.NODE_ENV === 'development' && process.env.METRICS_VERBOSE === 'true') {
      console.log(`[METRIC] Counter: ${name} = ${value}`, tags || {});
    }
  }

  recordGauge(name: string, value: number, tags?: Record<string, string>): void {
    if (process.env.NODE_ENV === 'development' && process.env.METRICS_VERBOSE === 'true') {
      console.log(`[METRIC] Gauge: ${name} = ${value}`, tags || {});
    }
  }

  recordHistogram(name: string, value: number, tags?: Record<string, string>): void {
    if (process.env.NODE_ENV === 'development' && process.env.METRICS_VERBOSE === 'true') {
      console.log(`[METRIC] Histogram: ${name} = ${value}`, tags || {});
    }
  }
}

/**
 * Global metric recorder instance
 */
export const metrics: MetricRecorder = new MockMetricRecorder();

/**
 * Record command execution metrics
 */
export function recordCommandMetrics(
  commandType: string,
  duration: number,
  success: boolean,
  metadata?: Record<string, string>
): void {
  const tags = {
    command_type: commandType,
    success: String(success),
    ...metadata,
  };

  metrics.recordCounter('command.executions', 1, tags);
  metrics.recordHistogram('command.duration', duration, tags);

  if (!success) {
    metrics.recordCounter('command.failures', 1, tags);
  }
}

/**
 * Record event processing metrics
 */
export function recordEventMetrics(
  eventType: string,
  duration: number,
  success: boolean,
  metadata?: Record<string, string>
): void {
  const tags = {
    event_type: eventType,
    success: String(success),
    ...metadata,
  };

  metrics.recordCounter('event.processed', 1, tags);
  metrics.recordHistogram('event.processing_duration', duration, tags);

  if (!success) {
    metrics.recordCounter('event.processing_failures', 1, tags);
  }
}

/**
 * Record query execution metrics
 */
export function recordQueryMetrics(
  queryType: string,
  duration: number,
  success: boolean,
  resultCount?: number,
  metadata?: Record<string, string>
): void {
  const tags = {
    query_type: queryType,
    success: String(success),
    ...metadata,
  };

  metrics.recordCounter('query.executions', 1, tags);
  metrics.recordHistogram('query.duration', duration, tags);

  if (resultCount !== undefined) {
    metrics.recordHistogram('query.result_count', resultCount, tags);
  }

  if (!success) {
    metrics.recordCounter('query.failures', 1, tags);
  }
}

/**
 * Context propagation utilities
 */
export interface TracingContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  flags?: number;
  baggage?: Map<string, string>;
}

/**
 * Create a new tracing context
 */
export function createTracingContext(parent?: TracingContext): TracingContext {
  return {
    traceId: parent?.traceId || generateTraceId(),
    spanId: generateSpanId(),
    parentSpanId: parent?.spanId,
    flags: parent?.flags || 0,
    baggage: parent?.baggage ? new Map(parent.baggage) : new Map(),
  };
}

/**
 * Serialize tracing context for transport
 */
export function serializeTracingContext(context: TracingContext): string {
  const obj = {
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    flags: context.flags,
    baggage: context.baggage ? Object.fromEntries(context.baggage) : undefined,
  };

  return JSON.stringify(obj);
}

/**
 * Deserialize tracing context from transport
 */
export function deserializeTracingContext(serialized: string): TracingContext | null {
  try {
    const obj = JSON.parse(serialized);

    return {
      traceId: obj.traceId,
      spanId: obj.spanId,
      parentSpanId: obj.parentSpanId,
      flags: obj.flags || 0,
      baggage: obj.baggage ? new Map(Object.entries(obj.baggage)) : new Map(),
    };
  } catch {
    return null;
  }
}
