/**
 * Result type for functional error handling
 * Inspired by Rust's Result<T, E> type and neverthrow library
 */

import { 
  Result as ResultV2, 
  Ok, 
  Err, 
  ok as okV2, 
  err as errV2,
  isOk as isOkV2,
  isErr as isErrV2,
  wrap,
  ResultHelpers,
  type AsyncResult
} from './result-v2';

// Re-export V2 types for gradual migration
export { 
  ResultV2,
  Ok,
  Err,
  wrap,
  ResultHelpers,
  AsyncResult,
  matchError,
  type SafeResult,
  type OkType,
  type ErrType,
  type ResultType,
  resultDo,
  pipe,
  ResultError
} from './result-v2';

// Re-export error types
export * from './result-errors';

/**
 * Legacy Result type for backward compatibility
 * @deprecated Use ResultV2 for new code
 */
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

/**
 * Result utility functions with adapters to V2
 */
export const Result = {
  /**
   * Create a successful result
   */
  ok: <T>(data: T): Result<T, never> => ({ success: true, data }),

  /**
   * Create an error result
   */
  err: <E>(error: E): Result<never, E> => ({ success: false, error }),

  /**
   * Check if a result is successful
   */
  isOk: <T, E>(result: Result<T, E>): result is { success: true; data: T } =>
    result.success === true,

  /**
   * Check if a result is an error
   */
  isErr: <T, E>(result: Result<T, E>): result is { success: false; error: E } =>
    result.success === false,

  /**
   * Map the success value of a result
   */
  map: <T, U, E>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> =>
    Result.isOk(result) ? Result.ok(fn(result.data)) : result,

  /**
   * Map the error value of a result
   */
  mapErr: <T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> =>
    Result.isErr(result) ? Result.err(fn(result.error)) : result,

  /**
   * Chain results together (flatMap)
   */
  flatMap: <T, U, E>(result: Result<T, E>, fn: (data: T) => Result<U, E>): Result<U, E> =>
    Result.isOk(result) ? fn(result.data) : result,

  /**
   * Chain error handling
   */
  flatMapErr: <T, E, F>(result: Result<T, E>, fn: (error: E) => Result<T, F>): Result<T, F> =>
    Result.isErr(result) ? fn(result.error) : result,

  /**
   * Get the value or a default
   */
  unwrapOr: <T, E>(result: Result<T, E>, defaultValue: T): T =>
    Result.isOk(result) ? result.data : defaultValue,

  /**
   * Get the value or compute a default
   */
  unwrapOrElse: <T, E>(result: Result<T, E>, fn: (error: E) => T): T =>
    Result.isOk(result) ? result.data : fn(result.error),

  /**
   * Convert a Result to a Promise
   */
  toPromise: <T, E>(result: Result<T, E>): Promise<T> =>
    Result.isOk(result) ? Promise.resolve(result.data) : Promise.reject(result.error),

  /**
   * Create a Result from a Promise
   */
  fromPromise: async <T, E = Error>(
    promise: Promise<T>,
    mapError?: (error: unknown) => E
  ): Promise<Result<T, E>> => {
    try {
      const data = await promise;
      return Result.ok(data);
    } catch (error) {
      return Result.err(mapError ? mapError(error) : (error as E));
    }
  },

  /**
   * Try to execute a function and return a Result
   */
  try: <T, E = Error>(fn: () => T, mapError?: (error: unknown) => E): Result<T, E> => {
    try {
      return Result.ok(fn());
    } catch (error) {
      return Result.err(mapError ? mapError(error) : (error as E));
    }
  },

  /**
   * Try to execute an async function and return a Result
   */
  tryAsync: async <T, E = Error>(
    fn: () => Promise<T>,
    mapError?: (error: unknown) => E
  ): Promise<Result<T, E>> => {
    try {
      const data = await fn();
      return Result.ok(data);
    } catch (error) {
      return Result.err(mapError ? mapError(error) : (error as E));
    }
  },

  /**
   * Combine multiple Results into a single Result
   */
  all: <T, E>(results: Result<T, E>[]): Result<T[], E> => {
    const values: T[] = [];
    for (const result of results) {
      if (Result.isErr(result)) {
        return result;
      }
      values.push(result.data);
    }
    return Result.ok(values);
  },

  /**
   * Combine multiple Results, collecting all errors
   */
  allSettled: <T, E>(results: Result<T, E>[]): Result<T[], E[]> => {
    const values: T[] = [];
    const errors: E[] = [];

    for (const result of results) {
      if (Result.isOk(result)) {
        values.push(result.data);
      } else {
        errors.push(result.error);
      }
    }

    return errors.length > 0 ? Result.err(errors) : Result.ok(values);
  },

  /**
   * Convert legacy Result to V2 Result
   */
  toV2: <T, E>(result: Result<T, E>): ResultV2<T, E> =>
    Result.isOk(result) ? okV2(result.data) : errV2(result.error),

  /**
   * Convert V2 Result to legacy Result
   */
  fromV2: <T, E>(result: ResultV2<T, E>): Result<T, E> =>
    isOkV2(result) ? Result.ok(result.value) : Result.err(result.error),

  /**
   * Pattern matching for Result
   */
  match: <T, E, U>(
    result: Result<T, E>,
    patterns: {
      ok: (data: T) => U;
      err: (error: E) => U;
    }
  ): U => {
    if (Result.isOk(result)) {
      return patterns.ok(result.data);
    }
    return patterns.err(result.error);
  },

  /**
   * Chain operations using the V2 wrapper
   * This allows using the new chaining API with legacy Results
   */
  chain: <T, E>(result: Result<T, E>) => wrap(Result.toV2(result)),
};

/**
 * Type guard to check if a value is a Result
 */
export const isResult = <T, E>(value: unknown): value is Result<T, E> =>
  typeof value === 'object' &&
  value !== null &&
  'success' in value &&
  (value.success === true ? 'data' in value : 'error' in value);

/**
 * Migration utilities
 */
export const Migration = {
  /**
   * Migrate a function that returns legacy Result to V2
   */
  wrapFunction: <Args extends any[], T, E>(
    fn: (...args: Args) => Result<T, E>
  ) => (...args: Args): ResultV2<T, E> => {
    const result = fn(...args);
    return Result.toV2(result);
  },

  /**
   * Migrate an async function that returns legacy Result to V2
   */
  wrapAsyncFunction: <Args extends any[], T, E>(
    fn: (...args: Args) => Promise<Result<T, E>>
  ) => async (...args: Args): Promise<ResultV2<T, E>> => {
    const result = await fn(...args);
    return Result.toV2(result);
  },

  /**
   * Create a compatibility layer for gradual migration
   */
  createCompatibleResult: <T, E>() => ({
    ok: (data: T): Result<T, E> => Result.ok(data),
    err: (error: E): Result<T, E> => Result.err(error),
    okV2: (data: T): ResultV2<T, E> => okV2(data),
    errV2: (error: E): ResultV2<T, E> => errV2(error),
  }),
};