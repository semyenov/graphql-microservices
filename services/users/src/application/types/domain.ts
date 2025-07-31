import type { z } from 'zod';
import type { Brand } from '@graphql-microservices/shared-type-utils';

export {
  ok,
  err,
  wrap,
  type Result,
  ValidationError,
} from '@graphql-microservices/shared-type-utils';

export type UserId = Brand<string, 'UserId'>;
export type AggregateId = Brand<string, 'AggregateId'>;
export type Username = Brand<string, 'Username'>;
export type Email = Brand<string, 'Email'>;
export type EventId = Brand<string, 'EventId'>;
export type RefreshToken = Brand<string, 'RefreshToken'>;
export type AccessToken = Brand<string, 'AccessToken'>;

/**
 * User role enumeration
 */
export const UserRole = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  MODERATOR: 'MODERATOR',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/**
 * Sort field enumeration
 */
export const UserSortField = {
  USERNAME: 'username',
  EMAIL: 'email',
  NAME: 'name',
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
} as const;

export type UserSortField = (typeof UserSortField)[keyof typeof UserSortField];

/**
 * Sort direction enumeration
 */
export const SortDirection = {
  ASC: 'ASC',
  DESC: 'DESC',
} as const;

export type SortDirection = (typeof SortDirection)[keyof typeof SortDirection];

/**
 * Common pagination interface
 */
export interface Pagination {
  offset?: number;
  limit?: number;
}

/**
 * Common sorting interface
 */
export interface Sorting<TField = string> {
  field: TField;
  direction: SortDirection;
}

/**
 * Common filter interface
 */
export interface UserFilter {
  role?: UserRole;
  isActive?: boolean;
}

/**
 * Search fields enumeration
 */
export const UserSearchField = {
  USERNAME: 'username',
  EMAIL: 'email',
  NAME: 'name',
} as const;

export type UserSearchField = (typeof UserSearchField)[keyof typeof UserSearchField];

/**
 * Command metadata interface
 */
export interface CommandMetadata {
  correlationId?: string;
  causationId?: string;
  userId?: UserId;
  timestamp?: Date;
  [key: string]: unknown;
}

// Note: Result types are now imported from @shared/type-utils above

/**
 * Type helper for extracting inferred type from Zod schema
 */
export type InferSchema<TSchema> = TSchema extends z.ZodType<infer T> ? T : never;

/**
 * Type helper for creating discriminated unions
 */
export type DiscriminatedUnion<TType extends string, TData = {}> = {
  type: TType;
} & TData;

/**
 * Type helper for creating exhaustive switches
 */
export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}

/**
 * Type predicate helpers
 */
export const is = {
  userId: (value: string): value is UserId =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value),
  email: (value: string): value is Email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  username: (value: string): value is Username => /^[a-zA-Z0-9_]{3,50}$/.test(value),
} as const;

/**
 * Type-safe cache key templates
 */
export type CacheKeyTemplate =
  | `user:${UserId}`
  | `user:username:${Username}`
  | `user:email:${Email}`
  | `users:${string}`
  | `user:events:${UserId}`;

/**
 * Cache key builder
 */
export const cacheKey = {
  user: (id: UserId): CacheKeyTemplate => `user:${id}`,
  userByUsername: (username: Username): CacheKeyTemplate => `user:username:${username}`,
  userByEmail: (email: Email): CacheKeyTemplate => `user:email:${email}`,
  userEvents: (id: UserId): CacheKeyTemplate => `user:events:${id}`,
  users: (suffix: string): CacheKeyTemplate => `users:${suffix}`,
} as const;
