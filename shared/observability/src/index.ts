import { observabilityEnvSchema, parseEnv } from '@graphql-microservices/shared-config';
import { createErrorLogger } from '@graphql-microservices/shared-errors';
import { context, type Span, type SpanContext, SpanStatusCode, trace } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DataloaderInstrumentation } from '@opentelemetry/instrumentation-dataloader';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';
import { Resource } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import type {
  ApolloServerPlugin,
  GraphQLRequestContext,
  GraphQLRequestListener,
} from 'apollo-server-plugin-base';
import type { GraphQLError } from 'graphql';

const logError = createErrorLogger('observability');

// Parse environment configuration
const env = parseEnv(observabilityEnvSchema);

/**
 * Initialize OpenTelemetry SDK with auto-instrumentation
 */
export const initializeObservability = (serviceName: string): NodeSDK => {
  // Create resource identifying the service
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: env.NODE_ENV,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'graphql-microservices',
  });

  // Create trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    headers: env.OTEL_EXPORTER_OTLP_HEADERS,
  });

  // Create metric exporter
  const metricExporter = new OTLPMetricExporter({
    url: env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
    headers: env.OTEL_EXPORTER_OTLP_HEADERS,
  });

  // Register instrumentations
  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        requestHook: (span, request) => {
          span.setAttribute('http.request.body.size', request.headers['content-length'] || 0);
        },
        responseHook: (span, response) => {
          span.setAttribute('http.response.body.size', response.headers['content-length'] || 0);
        },
      }),
      new GraphQLInstrumentation({
        mergeItems: true,
        ignoreTrivialResolveSpans: true,
        allowValues: env.NODE_ENV === 'development',
      }),
      new RedisInstrumentation({
        dbStatementSerializer: (cmdName, cmdArgs) => {
          // Don't log sensitive data
          return `${cmdName} ${cmdArgs.length} args`;
        },
      }),
      new DataloaderInstrumentation(),
    ],
  });

  // Initialize SDK
  const sdk = new NodeSDK({
    resource,
    spanProcessor: new BatchSpanProcessor(traceExporter),
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 60000, // Export every minute
    }),
  });

  // Start SDK
  sdk.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('OpenTelemetry terminated successfully'))
      .catch((error) => logError(error, { operation: 'otel-shutdown' }));
  });

  return sdk;
};

/**
 * Get the current active span
 */
export const getActiveSpan = (): Span | undefined => {
  return trace.getActiveSpan();
};

/**
 * Create a new span within the current context
 */
export const createSpan = (
  name: string,
  fn: (span: Span) => Promise<void> | void
): Promise<void> | void => {
  const tracer = trace.getTracer('graphql-microservices');
  return tracer.startActiveSpan(name, async (span) => {
    try {
      await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
};

/**
 * Add attributes to the current span
 */
export const addSpanAttributes = (attributes: Record<string, string | number | boolean>): void => {
  const span = getActiveSpan();
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        span.setAttribute(key, value);
      }
    });
  }
};

/**
 * Add an event to the current span
 */
export const addSpanEvent = (
  name: string,
  attributes?: Record<string, string | number | boolean>
): void => {
  const span = getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
};

/**
 * Apollo Server plugin for OpenTelemetry integration
 */
export const createOpenTelemetryPlugin = <TContext>(): ApolloServerPlugin<TContext> => {
  return {
    async requestDidStart(
      requestContext: GraphQLRequestContext<TContext>
    ): Promise<GraphQLRequestListener<TContext>> {
      // Create a span for the entire request
      const span = getActiveSpan();

      if (span) {
        // Add request metadata
        span.setAttribute(
          'graphql.operation.name',
          requestContext.request.operationName || 'anonymous'
        );
        span.setAttribute('graphql.document', requestContext.request.query || '');

        if (requestContext.request.variables) {
          // Log variable keys but not values (for security)
          span.setAttribute(
            'graphql.variables.keys',
            Object.keys(requestContext.request.variables)
          );
        }
      }

      return {
        async willSendResponse(requestContext) {
          const span = getActiveSpan();
          if (span && requestContext.response.errors) {
            // Record errors
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: 'GraphQL errors occurred',
            });

            requestContext.response.errors.forEach((error: GraphQLError) => {
              span.recordException({
                name: error.name || 'GraphQLError',
                message: error.message,
                stack: error.stack,
              });

              span.addEvent('graphql.error', {
                'error.message': error.message,
                'error.path': error.path?.join('.'),
                'error.code': error.extensions?.code,
              });
            });
          }
        },

        async executionDidStart() {
          return {
            willResolveField({ info }) {
              // This is handled by GraphQLInstrumentation
              return (error, _result) => {
                if (error) {
                  const span = getActiveSpan();
                  if (span) {
                    span.addEvent('graphql.field.error', {
                      'field.name': info.fieldName,
                      'field.path': info.path,
                      'error.message': error.message,
                    });
                  }
                }
              };
            },
          };
        },
      };
    },
  };
};

/**
 * Metrics helper for recording custom metrics
 */
export class MetricsRecorder {
  private readonly meterName: string;

  constructor(serviceName: string) {
    this.meterName = serviceName;
  }

  /**
   * Record a counter metric
   */
  recordCounter(
    name: string,
    value = 1,
    attributes?: Record<string, string | number | boolean>
  ): void {
    const _meter = trace.getTracer(this.meterName);
    const span = getActiveSpan();
    if (span) {
      span.addEvent(`metric.${name}`, {
        value,
        ...attributes,
      });
    }
  }

  /**
   * Record a histogram metric
   */
  recordHistogram(
    name: string,
    value: number,
    attributes?: Record<string, string | number | boolean>
  ): void {
    const _meter = trace.getTracer(this.meterName);
    const span = getActiveSpan();
    if (span) {
      span.addEvent(`metric.${name}`, {
        value,
        type: 'histogram',
        ...attributes,
      });
    }
  }

  /**
   * Record operation duration
   */
  async recordDuration<T>(
    operationName: string,
    operation: () => Promise<T> | T,
    attributes?: Record<string, string | number | boolean>
  ): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await operation();
      const duration = Date.now() - startTime;

      this.recordHistogram(`${operationName}.duration`, duration, {
        ...attributes,
        success: true,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.recordHistogram(`${operationName}.duration`, duration, {
        ...attributes,
        success: false,
        error: error instanceof Error ? error.name : 'unknown',
      });

      throw error;
    }
  }
}

/**
 * Context propagation helpers
 */
export const extractTraceContext = (
  headers: Record<string, string | string[] | undefined>
): SpanContext | undefined => {
  // Extract W3C Trace Context from headers
  const traceparent = headers.traceparent;
  if (traceparent && typeof traceparent === 'string') {
    // Parse traceparent header
    const parts = traceparent.split('-');
    if (parts.length === 4) {
      return {
        traceId: parts[1],
        spanId: parts[2],
        traceFlags: parseInt(parts[3], 16),
        isRemote: true,
      };
    }
  }
  return undefined;
};

/**
 * Inject trace context into outgoing headers
 */
export const injectTraceContext = (headers: Record<string, string>): Record<string, string> => {
  const span = getActiveSpan();
  if (span) {
    const spanContext = span.spanContext();
    headers.traceparent = `00-${spanContext.traceId}-${spanContext.spanId}-0${spanContext.traceFlags.toString(16)}`;
  }
  return headers;
};

/**
 * Export all components
 */
export { trace, context, SpanStatusCode, type Span, type SpanContext };
