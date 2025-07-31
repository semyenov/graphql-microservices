import type { GraphQLRequestContext } from '@apollo/server';
import { nanoid } from 'nanoid';
import pino from 'pino';
import pinoHttp from 'pino-http';

// Request/Response type interfaces for HTTP middleware
interface HttpRequest {
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  url?: string;
  correlationId?: string;
}

interface HttpResponse {
  statusCode: number;
  headers?: Record<string, string>;
  setHeader(name: string, value: string): void;
}

type NextFunction = () => void;

/**
 * Log levels for structured logging
 */
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

/**
 * Log context interface for correlation and metadata
 */
export interface LogContext {
  correlationId?: string;
  requestId?: string;
  userId?: string;
  operation?: string;
  service?: string;
  version?: string;
  duration?: number;
  [key: string]: unknown;
}

/**
 * Structured log entry
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: Error | unknown;
  timestamp?: string;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level?: LogLevel;
  service: string;
  version?: string;
  prettyPrint?: boolean;
  destination?: string;
  correlationIdHeader?: string;
  redactFields?: string[];
}

/**
 * Default configuration
 */
const defaultConfig: Partial<LoggerConfig> = {
  level: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO,
  prettyPrint: process.env.NODE_ENV !== 'production',
  correlationIdHeader: 'x-correlation-id',
  redactFields: [
    'password',
    'token',
    'authorization',
    'cookie',
    'secret',
    'key',
    'api_key',
    'access_token',
    'refresh_token',
  ],
};

/**
 * Create a structured logger instance
 */
export const createLogger = (config: LoggerConfig) => {
  const finalConfig = { ...defaultConfig, ...config };

  // Base pino configuration
  const pinoConfig: pino.LoggerOptions = {
    name: config.service,
    level: finalConfig.level || LogLevel.INFO,
    redact: {
      paths: finalConfig.redactFields || [],
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => ({ level: label }),
      log: (object) => ({
        ...object,
        service: config.service,
        version: config.version || process.env.APP_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        hostname: process.env.HOSTNAME || 'unknown',
        pid: process.pid,
      }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  // Configure pretty printing for development
  if (finalConfig.prettyPrint) {
    pinoConfig.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
        messageFormat: '[{service}] {msg}',
      },
    };
  }

  const logger = pino(pinoConfig);

  return {
    trace: (message: string, context?: LogContext) => logger.trace({ ...context }, message),
    debug: (message: string, context?: LogContext) => logger.debug({ ...context }, message),
    info: (message: string, context?: LogContext) => logger.info({ ...context }, message),
    warn: (message: string, context?: LogContext) => logger.warn({ ...context }, message),
    error: (message: string, error?: Error | unknown, context?: LogContext) => {
      const errorInfo =
        error instanceof Error
          ? {
              error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
              },
            }
          : { error };

      logger.error({ ...context, ...errorInfo }, message);
    },
    fatal: (message: string, error?: Error | unknown, context?: LogContext) => {
      const errorInfo =
        error instanceof Error
          ? {
              error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
              },
            }
          : { error };

      logger.fatal({ ...context, ...errorInfo }, message);
    },
    // Performance logging
    timing: (message: string, duration: number, context?: LogContext) =>
      logger.info({ ...context, duration, metric: 'timing' }, message),
    // Business metric logging
    metric: (name: string, value: number, unit?: string, context?: LogContext) =>
      logger.info(
        {
          ...context,
          metric: 'business',
          metricName: name,
          metricValue: value,
          metricUnit: unit,
        },
        `Metric: ${name} = ${value}${unit ? ` ${unit}` : ''}`
      ),
    // Audit logging
    audit: (action: string, resource: string, context?: LogContext) =>
      logger.info(
        {
          ...context,
          category: 'audit',
          action,
          resource,
        },
        `Audit: ${action} on ${resource}`
      ),

    // Raw pino logger for advanced use cases
    raw: logger,
  };
};

/**
 * Correlation ID utilities
 */
export const correlationUtils = {
  generate: (): string => nanoid(16),

  fromRequest: (req: HttpRequest, headerName = 'x-correlation-id'): string => {
    return (req.headers?.[headerName] as string) || correlationUtils.generate();
  },

  middleware:
    (headerName = 'x-correlation-id') =>
    (req: HttpRequest, res: HttpResponse, next: NextFunction) => {
      const correlationId = correlationUtils.fromRequest(req, headerName);
      req.correlationId = correlationId;
      res.setHeader(headerName, correlationId);
      next();
    },
};

/**
 * GraphQL request logging plugin for Apollo Server
 */
export const createGraphQLLoggingPlugin = (logger: ReturnType<typeof createLogger>) => ({
  async requestDidStart(requestContext: GraphQLRequestContext<Record<string, unknown>>) {
    const correlationId =
      requestContext.request.http?.headers.get('x-correlation-id') || correlationUtils.generate();

    // Add correlation ID to context
    requestContext.contextValue.correlationId = correlationId;
    requestContext.contextValue.logger = logger;

    const startTime = Date.now();

    return {
      async didResolveOperation(requestContext: GraphQLRequestContext<Record<string, unknown>>) {
        const operation = requestContext.request.operationName || 'Unknown';

        logger.info('GraphQL operation started', {
          correlationId,
          operation,
          query: requestContext.request.query?.substring(0, 200),
          variables: requestContext.request.variables,
        });
      },

      async didEncounterErrors(requestContext: GraphQLRequestContext<Record<string, unknown>>) {
        const operation = requestContext.request.operationName || 'Unknown';

        requestContext.errors?.forEach((error) => {
          logger.error('GraphQL operation error', error, {
            correlationId,
            operation,
            errorCode: error.extensions?.code,
            errorPath: error.path,
          });
        });
      },

      async willSendResponse(requestContext: GraphQLRequestContext<Record<string, unknown>>) {
        const duration = Date.now() - startTime;
        const operation = requestContext.request.operationName || 'Unknown';
        const success = !requestContext.errors || requestContext.errors.length === 0;

        logger.timing('GraphQL operation completed', duration, {
          correlationId,
          operation,
          success,
          errorCount: requestContext.errors?.length || 0,
        });

        // Add correlation ID to response
        if (requestContext.response.http) {
          requestContext.response.http.headers.set('x-correlation-id', correlationId);
        }
      },
    };
  },
});

/**
 * HTTP request logging middleware using pino-http
 */
export const createHttpLoggingMiddleware = (config: LoggerConfig) => {
  const logger = createLogger(config);

  return pinoHttp({
    logger: logger.raw,
    genReqId: (req: HttpRequest) => req.correlationId || correlationUtils.generate(),
    serializers: {
      req: (req: HttpRequest) => ({
        method: req.method,
        url: req.url,
        headers: {
          'user-agent': req.headers?.['user-agent'],
          'content-type': req.headers?.['content-type'],
          'content-length': req.headers?.['content-length'],
          'x-correlation-id': req.headers?.['x-correlation-id'],
        },
        correlationId: req.correlationId,
      }),
      res: (res: HttpResponse) => ({
        statusCode: res.statusCode,
        headers: {
          'content-type': res.headers?.['content-type'],
          'content-length': res.headers?.['content-length'],
          'x-correlation-id': res.headers?.['x-correlation-id'],
        },
      }),
    },
    customLogLevel: (_req: HttpRequest, res: HttpResponse, err: Error | undefined) => {
      if (res.statusCode >= 400 && res.statusCode < 500) return 'warn';
      if (res.statusCode >= 500 || err) return 'error';
      return 'info';
    },
  });
};

/**
 * Performance timer utility
 */
export class Timer {
  private startTime: number;
  private logger: ReturnType<typeof createLogger>;
  private context: LogContext;

  constructor(logger: ReturnType<typeof createLogger>, context: LogContext = {}) {
    this.logger = logger;
    this.context = context;
    this.startTime = Date.now();
  }

  stop(message: string, additionalContext?: LogContext): number {
    const duration = Date.now() - this.startTime;
    this.logger.timing(message, duration, { ...this.context, ...additionalContext });
    return duration;
  }
}

/**
 * Create a timer instance
 */
export const createTimer = (logger: ReturnType<typeof createLogger>, context?: LogContext) =>
  new Timer(logger, context);

/**
 * Database query logging utility
 */
export const createDatabaseLogger = (logger: ReturnType<typeof createLogger>) => ({
  query: (sql: string, params?: unknown[], context?: LogContext) => {
    const timer = createTimer(logger, context);

    return {
      success: (rowCount?: number) => {
        const duration = timer.stop('Database query executed', {
          queryType: 'SELECT',
          rowCount,
          sql: sql.substring(0, 100),
        });
        return duration;
      },

      error: (error: Error) => {
        timer.stop('Database query failed', {
          sql: sql.substring(0, 100),
          error: error.message,
        });
        logger.error('Database query error', error, {
          ...context,
          sql: sql.substring(0, 200),
          params,
        });
      },
    };
  },

  mutation: (operation: string, table: string, context?: LogContext) => {
    const timer = createTimer(logger, context);

    return {
      success: (affectedRows?: number) => {
        timer.stop(`Database ${operation} completed`, {
          operation,
          table,
          affectedRows,
        });
      },

      error: (error: Error) => {
        timer.stop(`Database ${operation} failed`, {
          operation,
          table,
        });
        logger.error(`Database ${operation} error`, error, {
          ...context,
          operation,
          table,
        });
      },
    };
  },
});

/**
 * Export types and utilities
 */
export type Logger = ReturnType<typeof createLogger>;
export type DatabaseLogger = ReturnType<typeof createDatabaseLogger>;

/**
 * Global logger instance (optional)
 */
let globalLogger: Logger | null = null;

export const setGlobalLogger = (logger: Logger) => {
  globalLogger = logger;
};

export const getGlobalLogger = (): Logger => {
  if (!globalLogger) {
    throw new Error('Global logger not initialized. Call setGlobalLogger() first.');
  }
  return globalLogger;
};

/**
 * Default export
 */
export default {
  createLogger,
  createGraphQLLoggingPlugin,
  createHttpLoggingMiddleware,
  createTimer,
  createDatabaseLogger,
  correlationUtils,
  LogLevel,
};
