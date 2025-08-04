import type { IncomingMessage } from 'node:http';
import { createServer } from 'node:http';
import {
  ApolloGateway,
  type GraphQLDataSourceProcessOptions,
  IntrospectAndCompose,
  RemoteGraphQLDataSource,
  type ServiceEndpointDefinition,
} from '@apollo/gateway';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { startStandaloneServer } from '@apollo/server/standalone';
import { createGraphQLLoggingPlugin, createLogger } from '@graphql-microservices/logger';
import { CacheService } from '@graphql-microservices/shared-cache';
import { GatewayConfig } from '@graphql-microservices/shared-config';
import { Result } from '@graphql-microservices/shared-result';

// Initialize logger first (using defaults)
const logger = createLogger({ service: 'gateway' });

// Initialize configuration
const configResult = await GatewayConfig.initialize();
if (Result.isErr(configResult)) {
  logger.error('Failed to initialize configuration:', configResult.error);
  process.exit(1);
}
const env = configResult.value;

// Initialize cache service
const cacheService = new CacheService(env.REDIS_URL || 'redis://localhost:6379');

// Context interface for gateway
export interface GatewayContext {
  req: IncomingMessage;
  cacheService: CacheService;
  correlationId: string;
  logger: ReturnType<typeof createLogger>;
}

// Custom data source to forward headers and handle retries
class AuthenticatedDataSource extends RemoteGraphQLDataSource {
  override willSendRequest({ request, context }: GraphQLDataSourceProcessOptions<GatewayContext>) {
    // Forward the authorization header from the original request
    if (context.req?.headers?.authorization) {
      request.http?.headers.set('authorization', context.req.headers.authorization);
    }

    // Forward correlation ID for distributed tracing
    if (context.correlationId) {
      request.http?.headers.set('x-correlation-id', context.correlationId);
    }

    // Add timeout
    request.http?.headers.set('x-timeout', '30000');
  }
}

// Configure subgraphs with health check URLs
const subgraphConfigs: ServiceEndpointDefinition[] = env.SUBGRAPH_URLS
  ? JSON.parse(env.SUBGRAPH_URLS)
  : [
      { name: 'users', url: 'http://localhost:4001/graphql' },
      { name: 'products', url: 'http://localhost:4002/graphql' },
      { name: 'orders', url: 'http://localhost:4003/graphql' },
    ];

// Health check endpoints for subgraphs
const healthCheckEndpoints = subgraphConfigs.map((sg) => ({
  name: sg.name,
  url: sg.url?.replace('/graphql', '/health') || '',
}));

// Create gateway with polling for schema updates
const gateway = new ApolloGateway({
  supergraphSdl: new IntrospectAndCompose({
    subgraphs: subgraphConfigs,
    pollIntervalInMs: env.NODE_ENV === 'production' ? 30000 : 10000, // Poll every 30s in prod, 10s in dev
  }),
  buildService({ url }) {
    return new AuthenticatedDataSource({ url });
  },
  serviceHealthCheck: true,
});

// Create HTTP server for health checks
const httpServer = createServer(async (req, res) => {
  if (req.url === '/health') {
    // Check gateway health
    const isHealthy = await gateway.serviceHealthCheck();
    res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: isHealthy ? 'healthy' : 'unhealthy',
        service: 'gateway',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      })
    );
  }
});

// Create Apollo Server
const server = new ApolloServer<GatewayContext>({
  gateway,
  introspection: env.INTROSPECTION_ENABLED,
  includeStacktraceInErrorResponses: env.NODE_ENV !== 'production',
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    createGraphQLLoggingPlugin(logger),
    {
      async requestDidStart() {
        return {
          async willSendResponse(requestContext) {
            // Add correlation ID to response headers
            if (requestContext.contextValue.correlationId) {
              requestContext.response.http.headers.set(
                'x-correlation-id',
                requestContext.contextValue.correlationId
              );
            }
          },
        };
      },
    },
  ],
  formatError: (err) => {
    // Log errors with correlation ID
    const correlationId =
      (err.extensions?.context as { correlationId?: string })?.correlationId || 'unknown';
    logger.error(`GraphQL Error`, err, {
      correlationId,
      path: err.path,
      code: err.extensions?.code,
    });

    // Remove sensitive information in production
    if (env.NODE_ENV === 'production') {
      delete err.extensions?.exception;
      delete err.extensions?.stacktrace;
    }

    return err;
  },
});

// Start server
const { url } = await startStandaloneServer(server, {
  listen: { port: env.PORT },
  context: async ({ req }): Promise<GatewayContext> => {
    // Generate correlation ID if not present
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      `gw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      req,
      cacheService,
      correlationId,
      logger,
    };
  },
});

// Check subgraph health on startup
async function checkSubgraphHealth() {
  logger.info('Checking subgraph health...');
  for (const endpoint of healthCheckEndpoints) {
    try {
      const response = await fetch(endpoint.url);
      const status = response.ok ? 'healthy' : 'unhealthy';
      logger.info(`Subgraph health check`, {
        service: endpoint.name,
        status,
        httpStatus: response.status,
      });
    } catch (error) {
      logger.error(`Error checking health of subgraph`, error as Error, {
        service: endpoint.name,
      });
    }
  }
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`, { signal });

  try {
    // Stop accepting new requests
    httpServer.close();

    // Close gateway
    await gateway.stop();

    // Disconnect from Redis
    await cacheService.disconnect();

    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error as Error);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Log startup information
logger.info('Apollo Gateway starting...');
logger.info('Gateway ready', {
  url,
  healthCheck: `${url.replace('/graphql', '/health')}`,
  playgroundEnabled: env.PLAYGROUND_ENABLED,
  introspectionEnabled: env.INTROSPECTION_ENABLED,
  schemaPollInterval: env.NODE_ENV === 'production' ? '30s' : '10s',
  subgraphs: subgraphConfigs,
});

// Initial health check
setTimeout(checkSubgraphHealth, 1000);
