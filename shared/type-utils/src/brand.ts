/**
 * Brand type utility for creating nominal types
 * This prevents accidental mixing of different ID types, amounts, etc.
 */

export type Brand<K, T> = K & { __brand: T };

/**
 * Common branded types used across services
 */
export type UUID = Brand<string, 'UUID'>;
export type Email = Brand<string, 'Email'>;
export type URL = Brand<string, 'URL'>;
export type NonEmptyString = Brand<string, 'NonEmptyString'>;
export type PositiveNumber = Brand<number, 'PositiveNumber'>;
export type NonNegativeNumber = Brand<number, 'NonNegativeNumber'>;
export type Integer = Brand<number, 'Integer'>;
export type Timestamp = Brand<number, 'Timestamp'>;
export type ISODateString = Brand<string, 'ISODateString'>;

/**
 * Type guards for common branded types
 */
export const isUUID = (value: unknown): value is UUID =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const isEmail = (value: unknown): value is Email =>
  typeof value === 'string' && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);

export const isURL = (value: unknown): value is URL => {
  if (typeof value !== 'string') return false;
  try {
    new globalThis.URL(value);
    return true;
  } catch {
    return false;
  }
};

export const isNonEmptyString = (value: unknown): value is NonEmptyString =>
  typeof value === 'string' && value.trim().length > 0;

export const isPositiveNumber = (value: unknown): value is PositiveNumber =>
  typeof value === 'number' && value > 0 && Number.isFinite(value);

export const isNonNegativeNumber = (value: unknown): value is NonNegativeNumber =>
  typeof value === 'number' && value >= 0 && Number.isFinite(value);

export const isInteger = (value: unknown): value is Integer =>
  typeof value === 'number' && Number.isInteger(value);

export const isTimestamp = (value: unknown): value is Timestamp =>
  typeof value === 'number' && value > 0 && Number.isInteger(value);

export const isISODateString = (value: unknown): value is ISODateString => {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
};

/**
 * Factory for creating custom branded type guards
 */
export function createBrandGuard<T extends Brand<any, any>>(
  predicate: (value: unknown) => boolean
): (value: unknown) => value is T {
  return predicate as (value: unknown) => value is T;
}

/**
 * Utility to cast a value to a branded type after validation
 */
export function brand<T extends Brand<any, any>>(value: any): T {
  return value as T;
}

/**
 * Utility to unbrand a branded type
 */
export function unbrand<T extends Brand<K, any>, K>(value: T): K {
  return value as unknown as K;
}
