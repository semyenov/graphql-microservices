/**
 * Common domain error types with discriminated unions
 */

export interface BaseDomainError {
  code: string;
  message: string;
  details?: unknown;
  timestamp?: Date;
  correlationId?: string;
}

export interface ValidationError extends BaseDomainError {
  code: 'VALIDATION_ERROR';
  field?: string;
  value?: unknown;
  constraints?: Record<string, string>;
}

export interface NotFoundError extends BaseDomainError {
  code: 'NOT_FOUND';
  resource: string;
  id: string | number;
}

export interface ConflictError extends BaseDomainError {
  code: 'CONFLICT';
  resource: string;
  conflictingField?: string;
  existingId?: string | number;
}

export interface UnauthorizedError extends BaseDomainError {
  code: 'UNAUTHORIZED';
  reason?: 'MISSING_TOKEN' | 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'INVALID_CREDENTIALS';
}

export interface ForbiddenError extends BaseDomainError {
  code: 'FORBIDDEN';
  requiredPermission?: string;
  userPermissions?: string[];
}

export interface BusinessRuleError extends BaseDomainError {
  code: 'BUSINESS_RULE_VIOLATION';
  rule: string;
  context?: Record<string, unknown>;
}

export interface InternalError extends BaseDomainError {
  code: 'INTERNAL_ERROR';
  stack?: string;
  cause?: unknown;
}

export interface RateLimitError extends BaseDomainError {
  code: 'RATE_LIMIT_EXCEEDED';
  limit: number;
  window: string;
  retryAfter?: Date;
}

export interface TimeoutError extends BaseDomainError {
  code: 'TIMEOUT';
  operation: string;
  timeout: number;
}

export interface ExternalServiceError extends BaseDomainError {
  code: 'EXTERNAL_SERVICE_ERROR';
  service: string;
  statusCode?: number;
  response?: unknown;
}

/**
 * Union type of all domain errors
 */
export type DomainError =
  | ValidationError
  | NotFoundError
  | ConflictError
  | UnauthorizedError
  | ForbiddenError
  | BusinessRuleError
  | InternalError
  | RateLimitError
  | TimeoutError
  | ExternalServiceError;

/**
 * Type guards for domain errors
 */
export const isValidationError = (error: DomainError): error is ValidationError =>
  error.code === 'VALIDATION_ERROR';

export const isNotFoundError = (error: DomainError): error is NotFoundError =>
  error.code === 'NOT_FOUND';

export const isConflictError = (error: DomainError): error is ConflictError =>
  error.code === 'CONFLICT';

export const isUnauthorizedError = (error: DomainError): error is UnauthorizedError =>
  error.code === 'UNAUTHORIZED';

export const isForbiddenError = (error: DomainError): error is ForbiddenError =>
  error.code === 'FORBIDDEN';

export const isBusinessRuleError = (error: DomainError): error is BusinessRuleError =>
  error.code === 'BUSINESS_RULE_VIOLATION';

export const isInternalError = (error: DomainError): error is InternalError =>
  error.code === 'INTERNAL_ERROR';

export const isRateLimitError = (error: DomainError): error is RateLimitError =>
  error.code === 'RATE_LIMIT_EXCEEDED';

export const isTimeoutError = (error: DomainError): error is TimeoutError =>
  error.code === 'TIMEOUT';

export const isExternalServiceError = (error: DomainError): error is ExternalServiceError =>
  error.code === 'EXTERNAL_SERVICE_ERROR';

/**
 * Error factory functions
 */
export const DomainErrors = {
  validation: (message: string, field?: string, value?: unknown): ValidationError => ({
    code: 'VALIDATION_ERROR',
    message,
    field,
    value,
  }),

  notFound: (resource: string, id: string | number): NotFoundError => ({
    code: 'NOT_FOUND',
    message: `${resource} with id ${id} not found`,
    resource,
    id,
  }),

  conflict: (
    resource: string,
    message: string,
    conflictingField?: string,
    existingId?: string | number
  ): ConflictError => ({
    code: 'CONFLICT',
    message,
    resource,
    conflictingField,
    existingId,
  }),

  unauthorized: (
    message = 'Unauthorized',
    reason?: UnauthorizedError['reason']
  ): UnauthorizedError => ({
    code: 'UNAUTHORIZED',
    message,
    reason,
  }),

  forbidden: (
    message = 'Forbidden',
    requiredPermission?: string,
    userPermissions?: string[]
  ): ForbiddenError => ({
    code: 'FORBIDDEN',
    message,
    requiredPermission,
    userPermissions,
  }),

  businessRule: (
    rule: string,
    message: string,
    context?: Record<string, unknown>
  ): BusinessRuleError => ({
    code: 'BUSINESS_RULE_VIOLATION',
    message,
    rule,
    context,
  }),

  internal: (message: string, cause?: unknown): InternalError => ({
    code: 'INTERNAL_ERROR',
    message,
    cause,
    stack: new Error().stack,
  }),

  rateLimit: (limit: number, window: string, retryAfter?: Date): RateLimitError => ({
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Rate limit exceeded: ${limit} requests per ${window}`,
    limit,
    window,
    retryAfter,
  }),

  timeout: (operation: string, timeout: number): TimeoutError => ({
    code: 'TIMEOUT',
    message: `Operation '${operation}' timed out after ${timeout}ms`,
    operation,
    timeout,
  }),

  externalService: (
    service: string,
    message: string,
    statusCode?: number,
    response?: unknown
  ): ExternalServiceError => ({
    code: 'EXTERNAL_SERVICE_ERROR',
    message,
    service,
    statusCode,
    response,
  }),
};

/**
 * Convert unknown errors to DomainError
 */
export function toDomainError(error: unknown): DomainError {
  if (error && typeof error === 'object' && 'code' in error) {
    return error as DomainError;
  }

  if (error instanceof Error) {
    return DomainErrors.internal(error.message, error);
  }

  return DomainErrors.internal('An unknown error occurred', error);
}
