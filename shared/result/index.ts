/**
 * Modern Result type for functional error handling
 * Inspired by Rust's Result type and functional programming patterns
 */

/**
 * Success type
 */
export type Ok<T> = {
  readonly _tag: 'Ok';
  readonly value: T;
};

/**
 * Error type
 */
export type Err<E> = {
  readonly _tag: 'Err';
  readonly error: E;
};

/**
 * Result type - represents either success (Ok) or failure (Err)
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Type guards
 */
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => {
  return result._tag === 'Ok';
};

export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => {
  return result._tag === 'Err';
};

/**
 * Constructors
 */
export const ok = <T>(value: T): Ok<T> => ({
  _tag: 'Ok',
  value,
});

export const err = <E>(error: E): Err<E> => ({
  _tag: 'Err',
  error,
});

/**
 * Result namespace with static methods
 */
export const Result = {
  ok,
  err,
  isOk,
  isErr,

  /**
   * Map the success value
   */
  map: <T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> => {
    return isOk(result) ? ok(fn(result.value)) : result;
  },

  /**
   * Map the error value
   */
  mapErr: <T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> => {
    return isErr(result) ? err(fn(result.error)) : result;
  },

  /**
   * Flat map (bind/chain) for Result
   */
  flatMap: <T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> => {
    return isOk(result) ? fn(result.value) : result;
  },

  /**
   * Get the value or a default
   */
  unwrapOr: <T, E>(result: Result<T, E>, defaultValue: T): T => {
    return isOk(result) ? result.value : defaultValue;
  },

  /**
   * Get the value or compute a default
   */
  unwrapOrElse: <T, E>(result: Result<T, E>, fn: (error: E) => T): T => {
    return isOk(result) ? result.value : fn(result.error);
  },

  /**
   * Convert to a nullable value
   */
  toNullable: <T, E>(result: Result<T, E>): T | null => {
    return isOk(result) ? result.value : null;
  },

  /**
   * Convert to undefined on error
   */
  toUndefined: <T, E>(result: Result<T, E>): T | undefined => {
    return isOk(result) ? result.value : undefined;
  },

  /**
   * Create a Result from a nullable value
   */
  fromNullable: <T, E>(value: T | null | undefined, error: E): Result<T, E> => {
    return value !== null && value !== undefined ? ok(value) : err(error);
  },

  /**
   * Create a Result from a Promise
   */
  fromPromise: async <T, E = Error>(
    promise: Promise<T>,
    mapError?: (error: unknown) => E
  ): Promise<Result<T, E>> => {
    try {
      const value = await promise;
      return ok(value);
    } catch (error) {
      const mappedError = mapError ? mapError(error) : (error as E);
      return err(mappedError);
    }
  },

  /**
   * Create a Result from a function that might throw
   */
  tryCatch: <T, E = Error>(fn: () => T, mapError?: (error: unknown) => E): Result<T, E> => {
    try {
      return ok(fn());
    } catch (error) {
      const mappedError = mapError ? mapError(error) : (error as E);
      return err(mappedError);
    }
  },

  /**
   * Create an async Result from an async function that might throw
   */
  tryCatchAsync: async <T, E = Error>(
    fn: () => Promise<T>,
    mapError?: (error: unknown) => E
  ): Promise<Result<T, E>> => {
    try {
      const value = await fn();
      return ok(value);
    } catch (error) {
      const mappedError = mapError ? mapError(error) : (error as E);
      return err(mappedError);
    }
  },

  /**
   * Combine multiple Results into a single Result
   */
  all: <T, E>(results: Result<T, E>[]): Result<T[], E> => {
    const values: T[] = [];
    for (const result of results) {
      if (isErr(result)) {
        return result;
      }
      values.push(result.value);
    }
    return ok(values);
  },

  /**
   * Combine multiple Results, collecting all errors
   */
  allSettled: <T, E>(results: Result<T, E>[]): Result<T[], E[]> => {
    const values: T[] = [];
    const errors: E[] = [];

    for (const result of results) {
      if (isOk(result)) {
        values.push(result.value);
      } else {
        errors.push(result.error);
      }
    }

    return errors.length > 0 ? err(errors) : ok(values);
  },

  /**
   * Execute side effects based on Result
   */
  match: <T, E, R>(
    result: Result<T, E>,
    handlers: {
      ok: (value: T) => R;
      err: (error: E) => R;
    }
  ): R => {
    return isOk(result) ? handlers.ok(result.value) : handlers.err(result.error);
  },

  /**
   * Execute side effects without changing the Result
   */
  tap: <T, E>(result: Result<T, E>, fn: (value: T) => void): Result<T, E> => {
    if (isOk(result)) {
      fn(result.value);
    }
    return result;
  },

  /**
   * Execute error side effects without changing the Result
   */
  tapErr: <T, E>(result: Result<T, E>, fn: (error: E) => void): Result<T, E> => {
    if (isErr(result)) {
      fn(result.error);
    }
    return result;
  },

  /**
   * Unwrap the value, throwing if error
   */
  unwrap: <T, E>(result: Result<T, E>): T => {
    if (isOk(result)) {
      return result.value;
    }
    throw new Error(
      typeof result.error === 'object' && result.error !== null && 'message' in result.error
        ? (result.error as any).message
        : String(result.error)
    );
  },
};

/**
 * AsyncResult type for async operations
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

// Re-export AsyncResult as a namespace member for better compatibility
export const AsyncResult = {
  ok: async <T>(value: T): AsyncResult<T, any> => Promise.resolve(ok(value)),
  err: async <E>(error: E): AsyncResult<any, E> => Promise.resolve(err(error)),
  fromPromise: Result.fromPromise,
  tryCatchAsync: Result.tryCatchAsync,
};

/**
 * Pipe function for Result composition
 */
export const pipe = <T, E>(value: Result<T, E>) => ({
  to: <U>(fn: (result: Result<T, E>) => Result<U, E>) => pipe(fn(value)),
  value: () => value,
});

/**
 * Domain-specific error types for use with Result
 */
export interface DomainError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export const domainError = (code: string, message: string, details?: unknown): DomainError => ({
  code,
  message,
  details,
});

/**
 * Validation error with multiple field errors
 */
export interface ValidationError extends DomainError {
  readonly code: 'VALIDATION_ERROR';
  readonly fieldErrors: Array<{
    field: string;
    message: string;
    value?: unknown;
  }>;
}

export const validationError = (fieldErrors: ValidationError['fieldErrors']): ValidationError => ({
  code: 'VALIDATION_ERROR',
  message: 'Validation failed',
  fieldErrors,
});

/**
 * Common domain errors
 */
export const NotFoundError = (resource: string, id?: string): DomainError =>
  domainError('NOT_FOUND', id ? `${resource} with id '${id}' not found` : `${resource} not found`);

export const AlreadyExistsError = (resource: string, field: string, value: string): DomainError =>
  domainError('ALREADY_EXISTS', `${resource} with ${field} '${value}' already exists`);

export const UnauthorizedError = (message = 'Unauthorized'): DomainError =>
  domainError('UNAUTHORIZED', message);

export const ForbiddenError = (message = 'Forbidden'): DomainError =>
  domainError('FORBIDDEN', message);

export const BusinessRuleError = (message: string, details?: unknown): DomainError =>
  domainError('BUSINESS_RULE_VIOLATION', message, details);

/**
 * Result builders for common patterns
 */
export const resultBuilder = {
  /**
   * Validate multiple conditions
   */
  validate: <T>(
    value: T,
    validators: Array<(value: T) => Result<void, DomainError>>
  ): Result<T, DomainError> => {
    for (const validator of validators) {
      const result = validator(value);
      if (isErr(result)) {
        return result;
      }
    }
    return ok(value);
  },

  /**
   * Chain multiple async operations
   */
  chain: <T, E>(
    ...operations: Array<(prev: T) => AsyncResult<T, E>>
  ): ((initial: T) => AsyncResult<T, E>) => {
    return (initial: T) =>
      operations.reduce(
        async (prevPromise, operation) => {
          const prev = await prevPromise;
          return isOk(prev) ? operation(prev.value) : prev;
        },
        Promise.resolve(ok(initial)) as AsyncResult<T, E>
      );
  },

  /**
   * Execute operations in sequence, stop on first error
   */
  sequence: async <T, E>(operations: Array<() => AsyncResult<T, E>>): AsyncResult<T[], E> => {
    const results: T[] = [];

    for (const operation of operations) {
      const result = await operation();
      if (isErr(result)) {
        return result;
      }
      results.push(result.value);
    }

    return ok(results);
  },
};

/**
 * Type utilities for Result
 */
export type UnwrapOk<T> = T extends Result<infer U, any> ? U : never;
export type UnwrapErr<T> = T extends Result<any, infer E> ? E : never;

/**
 * Monad laws verification (for testing)
 */
export const resultMonadLaws = {
  // Left identity: Result.of(a).flatMap(f) === f(a)
  leftIdentity: <T, U, E>(value: T, fn: (value: T) => Result<U, E>): boolean => {
    const left = Result.flatMap(ok(value), fn);
    const right = fn(value);
    return JSON.stringify(left) === JSON.stringify(right);
  },

  // Right identity: m.flatMap(Result.of) === m
  rightIdentity: <T, E>(result: Result<T, E>): boolean => {
    const left = Result.flatMap(result, ok);
    const right = result;
    return JSON.stringify(left) === JSON.stringify(right);
  },

  // Associativity: m.flatMap(f).flatMap(g) === m.flatMap(x => f(x).flatMap(g))
  associativity: <T, U, V, E>(
    result: Result<T, E>,
    f: (value: T) => Result<U, E>,
    g: (value: U) => Result<V, E>
  ): boolean => {
    const left = Result.flatMap(Result.flatMap(result, f), g);
    const right = Result.flatMap(result, (x) => Result.flatMap(f(x), g));
    return JSON.stringify(left) === JSON.stringify(right);
  },
};
