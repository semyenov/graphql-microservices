/**
 * Common type utilities
 */

/**
 * Make all properties of T optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P];
};

/**
 * Make all properties of T readonly recursively
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T[P] extends object
      ? DeepReadonly<T[P]>
      : T[P];
};

/**
 * Make all properties of T required recursively
 */
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends (infer U)[]
    ? DeepRequired<U>[]
    : T[P] extends object | undefined
      ? DeepRequired<NonNullable<T[P]>>
      : T[P];
};

/**
 * Make properties K of T optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make properties K of T required
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Require at least one property from T
 */
export type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>;
}[keyof T];

/**
 * Require exactly one property from T
 */
export type RequireExactlyOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Record<Exclude<keyof T, K>, never>>;
}[keyof T];

/**
 * Make T nullable (T | null | undefined)
 */
export type Nullable<T> = T | null | undefined;

/**
 * Make all properties of T nullable
 */
export type NullableProps<T> = {
  [P in keyof T]: T[P] | null;
};

/**
 * Make specific properties nullable
 */
export type NullableBy<T, K extends keyof T> = Omit<T, K> & {
  [P in K]: T[P] | null;
};

/**
 * Extract non-nullable type
 */
export type NonNullableProps<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

/**
 * Type for objects with string keys
 */
export type StringRecord<T = unknown> = Record<string, T>;

/**
 * Type for objects with known keys
 */
export type StrictRecord<K extends string | number | symbol, V> = {
  [P in K]: V;
};

/**
 * Extract keys of T that have values of type V
 */
export type KeysOfType<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

/**
 * Pick properties of T that have values of type V
 */
export type PickByType<T, V> = Pick<T, KeysOfType<T, V>>;

/**
 * Omit properties of T that have values of type V
 */
export type OmitByType<T, V> = Omit<T, KeysOfType<T, V>>;

/**
 * Union to intersection
 */
export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

/**
 * Get the type of array elements
 */
export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

/**
 * Get the return type of a promise
 */
export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

/**
 * Get the type of object values
 */
export type ValueOf<T> = T[keyof T];

/**
 * Mutable version of T (remove readonly)
 */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Type assertion functions
 */
export const TypeAssertions = {
  /**
   * Assert that a value is defined
   */
  isDefined: <T>(value: T | null | undefined): value is T => value !== null && value !== undefined,

  /**
   * Assert that a value is not null
   */
  isNotNull: <T>(value: T | null): value is T => value !== null,

  /**
   * Assert that a value is not undefined
   */
  isNotUndefined: <T>(value: T | undefined): value is T => value !== undefined,

  /**
   * Assert that a value is a string
   */
  isString: (value: unknown): value is string => typeof value === 'string',

  /**
   * Assert that a value is a number
   */
  isNumber: (value: unknown): value is number => typeof value === 'number' && !Number.isNaN(value),

  /**
   * Assert that a value is a boolean
   */
  isBoolean: (value: unknown): value is boolean => typeof value === 'boolean',

  /**
   * Assert that a value is an object
   */
  isObject: (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value),

  /**
   * Assert that a value is an array
   */
  isArray: <T = unknown>(value: unknown): value is T[] => Array.isArray(value),

  /**
   * Assert that a value is a function
   */
  isFunction: (value: unknown): value is (...args: any[]) => any => typeof value === 'function',

  /**
   * Assert that a value is a Date
   */
  isDate: (value: unknown): value is Date =>
    value instanceof Date && !Number.isNaN(value.getTime()),

  /**
   * Assert that a value is a RegExp
   */
  isRegExp: (value: unknown): value is RegExp => value instanceof RegExp,

  /**
   * Assert that a value has a property
   */
  hasProperty: <K extends string | number | symbol>(
    value: unknown,
    property: K
  ): value is Record<K, unknown> =>
    typeof value === 'object' && value !== null && property in value,
};

/**
 * Utility to exhaustively check a discriminated union
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}

/**
 * Type-safe object keys
 */
export function objectKeys<T extends object>(obj: T): Array<keyof T> {
  return Object.keys(obj) as Array<keyof T>;
}

/**
 * Type-safe object entries
 */
export function objectEntries<T extends object>(obj: T): Array<[keyof T, T[keyof T]]> {
  return Object.entries(obj) as Array<[keyof T, T[keyof T]]>;
}

/**
 * Type-safe object from entries
 */
export function objectFromEntries<K extends string | number | symbol, V>(
  entries: Array<[K, V]>
): Record<K, V> {
  return Object.fromEntries(entries) as Record<K, V>;
}
