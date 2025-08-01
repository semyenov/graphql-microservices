import { randomUUID } from 'node:crypto';
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
  QUERY_COMPLEXITY_EXCEEDED = 'QUERY_COMPLEXITY_EXCEEDED',

  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  UNIQUE_CONSTRAINT_VIOLATION = 'UNIQUE_CONSTRAINT_VIOLATION',
  FOREIGN_KEY_VIOLATION = 'FOREIGN_KEY_VIOLATION',

  // Event sourcing errors
  OPTIMISTIC_CONCURRENCY_VIOLATION = 'OPTIMISTIC_CONCURRENCY_VIOLATION',
  AGGREGATE_NOT_FOUND = 'AGGREGATE_NOT_FOUND',
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
 * Token expiration error
 */
export class TokenExpiredError extends BaseGraphQLError {
  constructor(message = 'Token has expired', extensions?: Partial<BaseErrorExtensions>) {
    super(message, ErrorCode.TOKEN_EXPIRED, extensions);
  }
}

/**
 * Invalid token error
 */
export class InvalidTokenError extends BaseGraphQLError {
  constructor(message = 'Invalid token', extensions?: Partial<BaseErrorExtensions>) {
    super(message, ErrorCode.INVALID_TOKEN, extensions);
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
 * Query complexity error
 */
export interface QueryComplexityErrorExtensions extends BaseErrorExtensions {
  complexity: number;
  maximumComplexity: number;
}

export class QueryComplexityError extends GraphQLError {
  constructor(
    message = 'Query is too complex',
    complexity: number,
    maximumComplexity: number,
    extensions?: Partial<QueryComplexityErrorExtensions>
  ) {
    super(message, {
      extensions: {
        code: ErrorCode.QUERY_COMPLEXITY_EXCEEDED,
        timestamp: new Date().toISOString(),
        complexity,
        maximumComplexity,
        ...extensions,
      },
    });
    this.name = 'QueryComplexityError';
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
 * Foreign key constraint violation error
 */
export class ForeignKeyViolationError extends DatabaseError {
  constructor(field: string, referencedTable?: string, extensions?: Partial<BaseErrorExtensions>) {
    const message = referencedTable
      ? `Invalid reference: ${field} references a non-existent record in ${referencedTable}`
      : `Foreign key constraint violation on field '${field}'`;
    super(message, ErrorCode.FOREIGN_KEY_VIOLATION, {
      field,
      referencedTable,
      ...extensions,
    });
  }
}

/**
 * Event sourcing specific errors
 */

/**
 * Optimistic concurrency error for event sourcing
 */
export class OptimisticConcurrencyError extends BaseGraphQLError {
  constructor(
    aggregateId: string,
    expectedVersion: number,
    actualVersion: number,
    extensions?: Partial<BaseErrorExtensions>
  ) {
    const message =
      `Optimistic concurrency violation for aggregate ${aggregateId}. ` +
      `Expected version ${expectedVersion}, but actual version is ${actualVersion}`;
    super(message, ErrorCode.OPTIMISTIC_CONCURRENCY_VIOLATION, {
      aggregateId,
      expectedVersion,
      actualVersion,
      ...extensions,
    });
  }
}

/**
 * Aggregate not found error for event sourcing
 */
export class AggregateNotFoundError extends BaseGraphQLError {
  constructor(
    aggregateId: string,
    aggregateType?: string,
    extensions?: Partial<BaseErrorExtensions>
  ) {
    const message = aggregateType
      ? `${aggregateType} aggregate with ID ${aggregateId} was not found`
      : `Aggregate with ID ${aggregateId} was not found`;
    super(message, ErrorCode.AGGREGATE_NOT_FOUND, {
      aggregateId,
      aggregateType,
      ...extensions,
    });
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
    if (error.name === 'TokenExpiredError' || error.message.includes('jwt expired')) {
      return new TokenExpiredError('JWT token has expired');
    }

    if (error.name === 'JsonWebTokenError' || error.message.includes('invalid token')) {
      return new InvalidTokenError('JWT token is invalid');
    }

    // Event sourcing errors
    if (
      error.name === 'OptimisticConcurrencyError' ||
      error.message.includes('concurrency violation')
    ) {
      // Try to extract details from the error message
      const aggregateMatch = error.message.match(/aggregate (\w+)/);
      const expectedMatch = error.message.match(/Expected version (\d+)/);
      const actualMatch = error.message.match(/actual version is (\d+)/);

      return new OptimisticConcurrencyError(
        aggregateMatch?.[1] || 'unknown',
        Number(expectedMatch?.[1]) || 0,
        Number(actualMatch?.[1]) || 0
      );
    }

    if (
      error.name === 'AggregateNotFoundError' ||
      (error.message.includes('aggregate') && error.message.includes('not found'))
    ) {
      const aggregateMatch = error.message.match(/aggregate.*?ID (\w+)/);
      const typeMatch = error.message.match(/(\w+) aggregate/);

      return new AggregateNotFoundError(aggregateMatch?.[1] || 'unknown', typeMatch?.[1]);
    }

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
 * Shared validation utilities
 */

/**
 * Type guards for common validation patterns
 */
export const isValidId = (id: unknown): id is string => {
  return typeof id === 'string' && id.length > 0;
};

export const isValidDate = (date: unknown): date is Date => {
  return date instanceof Date && !Number.isNaN(date.getTime());
};

export const isValidEmail = (email: unknown): email is string => {
  if (typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidUUID = (uuid: unknown): uuid is string => {
  if (typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

export const isValidUrl = (url: unknown): url is string => {
  if (typeof url !== 'string') return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validation utilities for common business rules
 */
export const validateRequired = <T>(value: T | null | undefined, fieldName: string): T => {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError(`${fieldName} is required`);
  }
  return value;
};

export const validateLength = (
  value: string,
  min: number,
  max: number,
  fieldName: string
): string => {
  if (value.length < min || value.length > max) {
    throw new ValidationError(`${fieldName} must be between ${min} and ${max} characters`, [
      { field: fieldName, message: `Length must be between ${min} and ${max}`, value },
    ]);
  }
  return value;
};

export const validateRange = (
  value: number,
  min: number,
  max: number,
  fieldName: string
): number => {
  if (value < min || value > max) {
    throw new ValidationError(`${fieldName} must be between ${min} and ${max}`, [
      { field: fieldName, message: `Value must be between ${min} and ${max}`, value },
    ]);
  }
  return value;
};

/**
 * Standardized ID generation utilities
 */

/**
 * Generate a random UUID v4
 * Standardized across all packages
 */
export const generateId = (): string => {
  return randomUUID();
};

/**
 * Generate a correlation ID for request tracing
 * Uses the same format as regular IDs for consistency
 */
export const generateCorrelationId = (): string => {
  return randomUUID();
};

/**
 * Generate a causation ID (usually derived from correlation ID)
 * @param correlationId The correlation ID to base the causation ID on
 */
export const generateCausationId = (correlationId?: string): string => {
  return correlationId || randomUUID();
};

/**
 * Generate a deterministic UUID v5 based on namespace and name
 * Useful for generating consistent IDs from business keys
 * @param namespace UUID namespace
 * @param name The name/key to generate UUID from
 */
export const generateDeterministicId = (namespace: string, name: string): string => {
  // For now, use a simple approach. In production, you'd use proper UUID v5
  // This is a placeholder implementation
  const combined = `${namespace}:${name}`;
  // Simple hash-based approach (in production, use proper UUID v5 library)
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to UUID-like format (this is not a real UUID v5, just for demo)
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-5${hex.slice(1, 4)}-8${hex.slice(0, 3)}-${hex.slice(0, 12).padEnd(12, '0')}`;
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
