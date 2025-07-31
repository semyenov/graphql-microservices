/**
 * Advanced Result type implementation inspired by neverthrow
 * Provides better type safety, chainability, and functional programming patterns
 */

/**
 * Base Result type using discriminated unions for type safety
 */
export type Ok<T> = {
  readonly _tag: 'ok';
  readonly value: T;
};

export type Err<E> = {
  readonly _tag: 'err';
  readonly error: E;
};

export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Result constructor functions
 */
export const ok = <T>(value: T): Ok<T> => ({
  _tag: 'ok',
  value,
});

export const err = <E>(error: E): Err<E> => ({
  _tag: 'err',
  error,
});

/**
 * Type guards
 */
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => 
  result._tag === 'ok';

export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => 
  result._tag === 'err';

/**
 * Result class for method chaining
 */
export class ResultWrapper<T, E> {
  constructor(private readonly result: Result<T, E>) {}

  /**
   * Transform the Ok value
   */
  map<U>(fn: (value: T) => U): ResultWrapper<U, E> {
    if (isOk(this.result)) {
      return new ResultWrapper(ok(fn(this.result.value)));
    }
    return new ResultWrapper(this.result as Err<E>);
  }

  /**
   * Transform the Err value
   */
  mapErr<F>(fn: (error: E) => F): ResultWrapper<T, F> {
    if (isErr(this.result)) {
      return new ResultWrapper(err(fn(this.result.error)));
    }
    return new ResultWrapper(this.result as Ok<T>);
  }

  /**
   * Chain operations that return Results
   */
  andThen<U>(fn: (value: T) => Result<U, E>): ResultWrapper<U, E> {
    if (isOk(this.result)) {
      return new ResultWrapper(fn(this.result.value));
    }
    return new ResultWrapper(this.result as Err<E>);
  }

  /**
   * Chain operations that return Results (async)
   */
  async andThenAsync<U>(fn: (value: T) => Promise<Result<U, E>>): Promise<ResultWrapper<U, E>> {
    if (isOk(this.result)) {
      const newResult = await fn(this.result.value);
      return new ResultWrapper(newResult);
    }
    return new ResultWrapper(this.result as Err<E>);
  }

  /**
   * Recover from errors
   */
  orElse<F>(fn: (error: E) => Result<T, F>): ResultWrapper<T, F> {
    if (isErr(this.result)) {
      return new ResultWrapper(fn(this.result.error));
    }
    return new ResultWrapper(this.result as Ok<T>);
  }

  /**
   * Match pattern for handling both cases
   */
  match<U>(pattern: {
    ok: (value: T) => U;
    err: (error: E) => U;
  }): U {
    if (isOk(this.result)) {
      return pattern.ok(this.result.value);
    }
    return pattern.err(this.result.error);
  }

  /**
   * Unwrap the value or throw
   */
  unwrap(): T {
    if (isOk(this.result)) {
      return this.result.value;
    }
    throw new Error(`Called unwrap on an Err value: ${this.result.error}`);
  }

  /**
   * Unwrap the error or throw
   */
  unwrapErr(): E {
    if (isErr(this.result)) {
      return this.result.error;
    }
    throw new Error(`Called unwrapErr on an Ok value`);
  }

  /**
   * Unwrap with a default value
   */
  unwrapOr(defaultValue: T): T {
    if (isOk(this.result)) {
      return this.result.value;
    }
    return defaultValue;
  }

  /**
   * Unwrap with a function to compute default
   */
  unwrapOrElse(fn: (error: E) => T): T {
    if (isOk(this.result)) {
      return this.result.value;
    }
    return fn(this.result.error);
  }

  /**
   * Convert to the raw Result type
   */
  unwrapResult(): Result<T, E> {
    return this.result;
  }

  /**
   * Type narrowing helpers
   */
  isOk(): boolean {
    return isOk(this.result);
  }

  isErr(): boolean {
    return isErr(this.result);
  }

  /**
   * Convert to Promise
   */
  toPromise(): Promise<T> {
    if (isOk(this.result)) {
      return Promise.resolve(this.result.value);
    }
    return Promise.reject(this.result.error);
  }
}

/**
 * Wrap a Result in a ResultWrapper for chaining
 */
export const wrap = <T, E>(result: Result<T, E>): ResultWrapper<T, E> => 
  new ResultWrapper(result);

/**
 * Helper functions for working with Results
 */
export const ResultHelpers = {
  /**
   * Try to execute a function and return a Result
   */
  tryCatch: <T, E = Error>(
    fn: () => T,
    onError: (error: unknown) => E
  ): Result<T, E> => {
    try {
      return ok(fn());
    } catch (error) {
      return err(onError(error));
    }
  },

  /**
   * Try to execute an async function and return a Result
   */
  tryCatchAsync: async <T, E = Error>(
    fn: () => Promise<T>,
    onError: (error: unknown) => E
  ): Promise<Result<T, E>> => {
    try {
      const value = await fn();
      return ok(value);
    } catch (error) {
      return err(onError(error));
    }
  },

  /**
   * Convert a Promise to a Result
   */
  fromPromise: async <T, E = Error>(
    promise: Promise<T>,
    onError: (error: unknown) => E
  ): Promise<Result<T, E>> => {
    try {
      const value = await promise;
      return ok(value);
    } catch (error) {
      return err(onError(error));
    }
  },

  /**
   * Combine multiple Results into one
   */
  combine: <T extends readonly Result<any, any>[]>(
    results: T
  ): Result<
    { [K in keyof T]: T[K] extends Result<infer U, any> ? U : never },
    { [K in keyof T]: T[K] extends Result<any, infer E> ? E : never }[number]
  > => {
    const values: any[] = [];
    
    for (const result of results) {
      if (isErr(result)) {
        return result as any;
      }
      values.push((result as Ok<any>).value);
    }
    
    return ok(values as any);
  },

  /**
   * Combine Results, collecting all errors
   */
  combineWithAllErrors: <T extends readonly Result<any, any>[]>(
    results: T
  ): Result<
    { [K in keyof T]: T[K] extends Result<infer U, any> ? U : never },
    Array<{ [K in keyof T]: T[K] extends Result<any, infer E> ? E : never }[number]>
  > => {
    const values: any[] = [];
    const errors: any[] = [];
    
    for (const result of results) {
      if (isOk(result)) {
        values.push(result.value);
      } else {
        errors.push(result.error);
      }
    }
    
    if (errors.length > 0) {
      return err(errors);
    }
    
    return ok(values as any);
  },

  /**
   * Sequence an array of Results
   */
  sequence: <T, E>(results: Result<T, E>[]): Result<T[], E> => {
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
   * Traverse an array with a function that returns Results
   */
  traverse: <T, U, E>(
    items: T[],
    fn: (item: T) => Result<U, E>
  ): Result<U[], E> => {
    const results: U[] = [];
    
    for (const item of items) {
      const result = fn(item);
      if (isErr(result)) {
        return result;
      }
      results.push(result.value);
    }
    
    return ok(results);
  },

  /**
   * Partition an array of Results into Ok and Err arrays
   */
  partition: <T, E>(
    results: Result<T, E>[]
  ): { oks: T[]; errs: E[] } => {
    const oks: T[] = [];
    const errs: E[] = [];
    
    for (const result of results) {
      if (isOk(result)) {
        oks.push(result.value);
      } else {
        errs.push(result.error);
      }
    }
    
    return { oks, errs };
  },
};

/**
 * Type utilities for Result
 */
export type OkType<R> = R extends Result<infer T, any> ? T : never;
export type ErrType<R> = R extends Result<any, infer E> ? E : never;

/**
 * Infer Result types from functions
 */
export type ResultType<T extends (...args: any[]) => any> = 
  ReturnType<T> extends Result<infer U, infer E> ? Result<U, E> : 
  ReturnType<T> extends Promise<Result<infer U, infer E>> ? Result<U, E> : 
  never;

/**
 * Create typed error classes
 */
export abstract class ResultError {
  abstract readonly _tag: string;
  abstract readonly message: string;
}

// /**
//  * Example domain errors
//  */
// export class ValidationError extends ResultError {
//   readonly _tag = 'ValidationError';
//   constructor(public readonly message: string, public readonly field?: string) {
//     super();
//   }
// }

// export class NotFoundError extends ResultError {
//   readonly _tag = 'NotFoundError';
//   constructor(public readonly message: string, public readonly id: string) {
//     super();
//   }
// }

// export class UnauthorizedError extends ResultError {
//   readonly _tag = 'UnauthorizedError';
//   constructor(public readonly message: string) {
//     super();
//   }
// }

/**
 * Pattern matching for errors
 */
export const matchError = <E extends ResultError, R>(
  error: E,
  patterns: {
    [K in E['_tag']]?: (error: Extract<E, { _tag: K }>) => R;
  } & {
    _?: (error: E) => R;
  }
): R => {
  const handler = patterns[error._tag as E['_tag']] || patterns._;
  if (!handler) {
    throw new Error(`No handler for error type: ${error._tag}`);
  }
  return handler(error as any);
};

/**
 * Result type with constrained error types
 */
export type SafeResult<T, E extends ResultError = ResultError> = Result<T, E>;

/**
 * Async Result type alias
 */
export type AsyncResult<T, E> = Promise<Result<T, E>>;

/**
 * Railway-oriented programming helpers
 */
export const pipe = <T, E>(result: Result<T, E>) => ({
  pipe: <U>(fn: (wrapped: ResultWrapper<T, E>) => ResultWrapper<U, E>) => 
    pipe(fn(wrap(result)).unwrapResult()),
  value: () => result,
});

/**
 * Do notation for Result (similar to Haskell's do notation)
 */
export function resultDo<T, E>(
  fn: (helpers: {
    bind: <U>(name: string, result: Result<U, E>) => U;
    return: (value: T) => Result<T, E>;
  }) => Result<T, E>
): Result<T, E> {
  const bindings: Record<string, any> = {};
  
  const bind = <U>(name: string, result: Result<U, E>): U => {
    if (isErr(result)) {
      throw result;
    }
    bindings[name] = result.value;
    return result.value;
  };
  
  const returnValue = (value: T): Result<T, E> => ok(value);
  
  try {
    return fn({ bind, return: returnValue });
  } catch (error) {
    if (error && typeof error === 'object' && '_tag' in error && error._tag === 'err') {
      return error as Err<E>;
    }
    throw error;
  }
}