/**
 * Example of how to integrate OpenTelemetry observability into a GraphQL microservice
 */

import { ApolloServer, type GraphQLResponse } from '@apollo/server';
import type { AuthContext } from '@graphql-microservices/shared-auth';
import {
  addSpanAttributes,
  addSpanEvent,
  createOpenTelemetryPlugin,
  createSpan,
  extractTraceContext,
  initializeObservability,
  injectTraceContext,
  MetricsRecorder,
} from './index';

/**
 * Initialize observability for a service
 * Call this at the very beginning of your service, before any other imports that might be instrumented
 */
export const setupServiceObservability = (serviceName: string) => {
  // Initialize OpenTelemetry SDK
  const sdk = initializeObservability(serviceName);

  // Create metrics recorder for the service
  const metrics = new MetricsRecorder(serviceName);

  return { sdk, metrics };
};

/**
 * Example of instrumenting a GraphQL resolver
 */
export const instrumentedResolver = async <TArgs, TResult>(
  operationName: string,
  resolver: (args: TArgs) => Promise<TResult>,
  args: TArgs,
  attributes?: Record<string, unknown>
): Promise<TResult> => {
  return createSpan(`resolver.${operationName}`, async (_span) => {
    // Add custom attributes
    addSpanAttributes({
      'resolver.name': operationName,
      ...attributes,
    });

    try {
      // Execute the resolver
      const result = await resolver(args);

      // Add success event
      addSpanEvent('resolver.success', {
        operation: operationName,
      });

      return result;
    } catch (error) {
      // Error is automatically recorded by createSpan
      addSpanEvent('resolver.error', {
        operation: operationName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }) as Promise<TResult>;
};

/**
 * Example of instrumenting database operations
 */
export const instrumentedDatabaseOperation = async <T>(
  operation: string,
  query: () => Promise<T>,
  metrics: MetricsRecorder
): Promise<T> => {
  return metrics.recordDuration(
    `database.${operation}`,
    async () => {
      return createSpan(`db.${operation}`, async (_span) => {
        addSpanAttributes({
          'db.operation': operation,
          'db.system': 'postgresql',
        });

        return query();
      }) as Promise<T>;
    },
    { operation }
  );
};

/**
 * Example of instrumenting cache operations
 */
export const instrumentedCacheOperation = async <T>(
  operation: 'get' | 'set' | 'delete',
  key: string,
  fn: () => Promise<T>,
  metrics: MetricsRecorder
): Promise<T> => {
  return createSpan(`cache.${operation}`, async (_span) => {
    addSpanAttributes({
      'cache.operation': operation,
      'cache.key': key,
    });

    const result = await fn();

    // Record cache metrics
    if (operation === 'get') {
      const hit = result !== null && result !== undefined;
      metrics.recordCounter(`cache.${hit ? 'hit' : 'miss'}`, 1, { key });
      addSpanAttributes({ 'cache.hit': hit });
    }

    return result;
  }) as Promise<T>;
};

/**
 * Example of creating an instrumented Apollo Server
 */
export const createInstrumentedApolloServer = <TContext extends AuthContext>(
  schema: unknown,
  serviceName: string,
  formatError?: (error: unknown) => unknown
) => {
  const server = new ApolloServer<TContext>({
    schema,
    plugins: [
      createOpenTelemetryPlugin<TContext>(),
      {
        // Custom plugin for service-specific metrics
        async requestDidStart() {
          const metrics = new MetricsRecorder(serviceName);
          const startTime = Date.now();

          return {
            async willSendResponse(requestContext) {
              const duration = Date.now() - startTime;

              // Record request metrics
              metrics.recordHistogram('graphql.request.duration', duration, {
                operationName: requestContext.request.operationName || 'anonymous',
                hasErrors: !!(requestContext.response as GraphQLResponse).errors?.length,
              });

              if ((requestContext.response as GraphQLResponse).errors?.length) {
                metrics.recordCounter(
                  'graphql.errors',
                  (requestContext.response as GraphQLResponse).errors.length,
                  {
                    operationName: requestContext.request.operationName || 'anonymous',
                  }
                );
              }
            },
          };
        },
      },
    ],
    formatError,
  });

  return server;
};

/**
 * Example context factory with trace propagation
 */
export const createInstrumentedContext = async <TContext>(
  req: { headers?: Record<string, string> },
  baseContext: () => Promise<TContext> | TContext
): Promise<TContext & { traceId?: string }> => {
  // Extract trace context from incoming request
  const traceContext = extractTraceContext(req.headers || {});

  // Get base context
  const context = await baseContext();

  // Add trace ID to context for correlation
  return {
    ...context,
    traceId: traceContext?.traceId,
  };
};

/**
 * Example of making an instrumented HTTP request to another service
 */
export const makeInstrumentedRequest = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  return createSpan('http.request', async (_span): Promise<Response> => {
    // Add request attributes
    addSpanAttributes({
      'http.url': url,
      'http.method': options.method || 'GET',
    });

    // Inject trace context into headers
    const headers = injectTraceContext({
      ...((options.headers as Record<string, string>) || {}),
    });

    // Make the request
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Add response attributes
    addSpanAttributes({
      'http.status_code': response.status,
      'http.response_content_length': response.headers.get('content-length') || '',
    });

    return response;
  }) as Promise<Response>;
};

/**
 * Example usage in a service:
 *
 * ```typescript
 * // At the top of your service file, before other imports
 * import { setupServiceObservability } from '@graphql-microservices/shared-observability/service-integration';
 * const { metrics } = setupServiceObservability('users-service');
 *
 * // In your resolvers
 * const resolvers = {
 *   Query: {
 *     user: async (_, { id }, context) => {
 *       return instrumentedResolver(
 *         'getUser',
 *         async ({ id }) => {
 *           // Your resolver logic here
 *           const user = await instrumentedDatabaseOperation(
 *             'findUser',
 *             () => context.prisma.user.findUnique({ where: { id } }),
 *             metrics
 *           );
 *           return user;
 *         },
 *         { id },
 *         { userId: id }
 *       );
 *     },
 *   },
 * };
 *
 * // Create instrumented server
 * const server = createInstrumentedApolloServer(
 *   buildSubgraphSchema([{ typeDefs, resolvers }]),
 *   'users-service',
 *   formatError
 * );
 * ```
 */
