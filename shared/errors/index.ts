import { GraphQLError, type GraphQLErrorExtensions } from 'graphql';

/**
 * Error codes for consistent error identification across services
 */
export enum ErrorCode {
  // Authentication & Authorization
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_TOKEN = 'INVALID_TOKEN',

  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  CONFLICT = 'CONFLICT',

  // Business logic
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',

  // System errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',

  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  UNIQUE_CONSTRAINT_VIOLATION = 'UNIQUE_CONSTRAINT_VIOLATION',
  FOREIGN_KEY_VIOLATION = 'FOREIGN_KEY_VIOLATION',
}

/**
 * Base error interface for extensions
 */
export interface BaseErrorExtensions extends GraphQLErrorExtensions {
  code: ErrorCode;
  timestamp: string;
  service?: string;
  correlationId?: string;
}

/**
 * Base class for all application errors
 */
export class BaseGraphQLError extends GraphQLError {
  constructor(message: string, code: ErrorCode, extensions?: Partial<BaseErrorExtensions>) {
    super(message, {
      extensions: {
        code,
        timestamp: new Date().toISOString(),
        ...extensions,
      },
    });
    this.name = this.constructor.name;
  }
}

/**
 * Authentication error - user is not authenticated
 */
export class AuthenticationError extends BaseGraphQLError {
  constructor(message = 'Authentication required', extensions?: Partial<BaseErrorExtensions>) {
    super(message, ErrorCode.UNAUTHENTICATED, extensions);
  }
}

/**
 * Authorization error - user lacks required permissions
 */
export class AuthorizationError extends BaseGraphQLError {
  constructor(message = 'Insufficient permissions', extensions?: Partial<BaseErrorExtensions>) {
    super(message, ErrorCode.UNAUTHORIZED, extensions);
  }
}

/**
 * Validation error with field-specific details
 */
export interface ValidationErrorExtensions extends BaseErrorExtensions {
  validationErrors?: Array<{
    field: string;
    message: string;
    value?: unknown;
  }>;
}

export class ValidationError extends GraphQLError {
  constructor(
    message: string,
    validationErrors?: ValidationErrorExtensions['validationErrors'],
    extensions?: Partial<ValidationErrorExtensions>
  ) {
    super(message, {
      extensions: {
        code: ErrorCode.VALIDATION_ERROR,
        timestamp: new Date().toISOString(),
        validationErrors,
        ...extensions,
      },
    });
    this.name = 'ValidationError';
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends BaseGraphQLError {
  constructor(
    resource: string,
    identifier?: string | number,
    extensions?: Partial<BaseErrorExtensions>
  ) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, ErrorCode.NOT_FOUND, extensions);
  }
}

/**
 * Resource already exists error
 */
export class AlreadyExistsError extends BaseGraphQLError {
  constructor(
    resource: string,
    field?: string,
    value?: string,
    extensions?: Partial<BaseErrorExtensions>
  ) {
    const message =
      field && value
        ? `${resource} with ${field} '${value}' already exists`
        : `${resource} already exists`;
    super(message, ErrorCode.ALREADY_EXISTS, extensions);
  }
}

/**
 * Business rule violation error
 */
export class BusinessRuleError extends BaseGraphQLError {
  constructor(message: string, extensions?: Partial<BaseErrorExtensions>) {
    super(message, ErrorCode.BUSINESS_RULE_VIOLATION, extensions);
  }
}

/**
 * Rate limiting error
 */
export interface RateLimitErrorExtensions extends BaseErrorExtensions {
  retryAfter?: number; // seconds until retry is allowed
  limit?: number;
  remaining?: number;
  reset?: string; // ISO timestamp
}

export class RateLimitError extends GraphQLError {
  constructor(
    message = 'Rate limit exceeded',
    rateLimitInfo?: Partial<RateLimitErrorExtensions>,
    extensions?: Partial<RateLimitErrorExtensions>
  ) {
    super(message, {
      extensions: {
        code: ErrorCode.RATE_LIMITED,
        timestamp: new Date().toISOString(),
        ...rateLimitInfo,
        ...extensions,
      },
    });
    this.name = 'RateLimitError';
  }
}

/**
 * Database-specific errors
 */
export class DatabaseError extends BaseGraphQLError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.DATABASE_ERROR,
    extensions?: Partial<BaseErrorExtensions>
  ) {
    super(message, code, extensions);
  }
}

export class UniqueConstraintError extends DatabaseError {
  constructor(field: string, value?: string, extensions?: Partial<BaseErrorExtensions>) {
    const message = value
      ? `A record with ${field} '${value}' already exists`
      : `Unique constraint violation on field '${field}'`;
    super(message, ErrorCode.UNIQUE_CONSTRAINT_VIOLATION, extensions);
  }
}

/**
 * Internal server error for unexpected failures
 */
export class InternalServerError extends BaseGraphQLError {
  constructor(message = 'An unexpected error occurred', extensions?: Partial<BaseErrorExtensions>) {
    super(message, ErrorCode.INTERNAL_SERVER_ERROR, extensions);
  }
}

/**
 * Error formatting utilities
 */
export const formatError = (
  error: GraphQLError,
  includeStackTrace = false,
  service?: string
): GraphQLError => {
  // Add service name if provided
  if (service && error.extensions) {
    error.extensions.service = service;
  }

  // Remove stack trace in production unless explicitly requested
  if (!includeStackTrace && error.stack) {
    delete error.stack;
  }

  // Ensure timestamp is present
  if (error.extensions && !error.extensions.timestamp) {
    error.extensions.timestamp = new Date().toISOString();
  }

  return error;
};

/**
 * Check if an error is a specific type
 */
export const isErrorCode = (error: unknown, code: ErrorCode): boolean => {
  return error instanceof GraphQLError && error.extensions?.code === code;
};

/**
 * Convert unknown errors to GraphQL errors
 */
export const toGraphQLError = (
  error: unknown,
  defaultMessage = 'An error occurred'
): GraphQLError => {
  if (error instanceof GraphQLError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for specific error patterns
    if (error.message.includes('Unique constraint failed')) {
      const field = error.message.match(/on the fields \(`(.*?)`\)/)?.[1] || 'unknown';
      return new UniqueConstraintError(field);
    }

    if (error.message.includes('Invalid credentials')) {
      return new AuthenticationError('Invalid credentials');
    }

    if (error.message.includes('not found')) {
      return new NotFoundError('Resource');
    }

    // Default to internal server error with original message
    return new InternalServerError(error.message);
  }

  // Handle non-Error objects
  return new InternalServerError(defaultMessage);
};

/**
 * Error context enrichment
 */
export interface ErrorContext {
  userId?: string;
  correlationId?: string;
  service?: string;
  operation?: string;
  [key: string]: unknown;
}

export const enrichError = (error: GraphQLError, context: ErrorContext): GraphQLError => {
  return new GraphQLError(error.message, {
    ...error,
    extensions: {
      ...error.extensions,
      ...context,
    },
  });
};

/**
 * Type guard for GraphQL errors
 */
export const isGraphQLError = (error: unknown): error is GraphQLError => {
  return error instanceof GraphQLError;
};

/**
 * Create a context-aware error logger
 */
export const createErrorLogger = (service: string) => {
  return (error: unknown, context?: ErrorContext): void => {
    const graphQLError = toGraphQLError(error);
    const enrichedError = enrichError(graphQLError, { service, ...context });

    // Log based on severity
    const code = enrichedError.extensions?.code as ErrorCode;

    if (
      code === ErrorCode.INTERNAL_SERVER_ERROR ||
      code === ErrorCode.DATABASE_ERROR ||
      code === ErrorCode.SERVICE_UNAVAILABLE
    ) {
      console.error('[ERROR]', {
        service,
        error: enrichedError,
        stack: error instanceof Error ? error.stack : undefined,
      });
    } else {
      console.warn('[WARNING]', {
        service,
        error: enrichedError,
      });
    }
  };
};
