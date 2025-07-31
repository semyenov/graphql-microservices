/**
 * Common error types for use with Result type
 */

import { ResultError } from './result-v2';

/**
 * Validation error with optional field information
 */
export class ValidationError extends ResultError {
  readonly _tag = 'ValidationError';
  constructor(
    public readonly message: string, 
    public readonly field?: string,
    public readonly value?: unknown
  ) {
    super();
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends ResultError {
  readonly _tag = 'NotFoundError';
  constructor(
    public readonly message: string, 
    public readonly resource: string,
    public readonly id: string
  ) {
    super();
  }
}

/**
 * Unauthorized access error
 */
export class UnauthorizedError extends ResultError {
  readonly _tag = 'UnauthorizedError';
  constructor(
    public readonly message: string,
    public readonly reason?: string
  ) {
    super();
  }
}

/**
 * Forbidden access error (user is authenticated but lacks permissions)
 */
export class ForbiddenError extends ResultError {
  readonly _tag = 'ForbiddenError';
  constructor(
    public readonly message: string,
    public readonly resource?: string,
    public readonly action?: string
  ) {
    super();
  }
}

/**
 * Business rule violation error
 */
export class BusinessRuleError extends ResultError {
  readonly _tag = 'BusinessRuleError';
  constructor(
    public readonly message: string,
    public readonly rule: string,
    public readonly context?: Record<string, unknown>
  ) {
    super();
  }
}

/**
 * Conflict error (e.g., unique constraint violation)
 */
export class ConflictError extends ResultError {
  readonly _tag = 'ConflictError';
  constructor(
    public readonly message: string,
    public readonly field?: string,
    public readonly existingValue?: unknown
  ) {
    super();
  }
}

/**
 * External service error
 */
export class ExternalServiceError extends ResultError {
  readonly _tag = 'ExternalServiceError';
  constructor(
    public readonly message: string,
    public readonly service: string,
    public readonly originalError?: unknown
  ) {
    super();
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends ResultError {
  readonly _tag = 'RateLimitError';
  constructor(
    public readonly message: string,
    public readonly limit: number,
    public readonly windowMs: number,
    public readonly retryAfter?: Date
  ) {
    super();
  }
}

/**
 * Internal server error
 */
export class InternalError extends ResultError {
  readonly _tag = 'InternalError';
  constructor(
    public readonly message: string,
    public readonly code?: string,
    public readonly stack?: string
  ) {
    super();
  }
}

/**
 * Type alias for all error types
 */
export type DomainError = 
  | ValidationError
  | NotFoundError
  | UnauthorizedError
  | ForbiddenError
  | BusinessRuleError
  | ConflictError
  | ExternalServiceError
  | RateLimitError
  | InternalError;