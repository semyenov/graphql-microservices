import {
  type EventMetadata,
  eventMetadataSchema,
} from "@graphql-microservices/event-sourcing";
import { z } from "zod";
import type {
  Email,
  EventId,
  Pagination,
  Result,
  Sorting,
  UserFilter,
  UserId,
  Username,
  UserRole,
  UserSearchField,
  UserSortField,
  ValidationError,
} from "./types";

/**
 * Query type literals
 */
export const QueryType = {
  GET_USER_BY_ID: "GetUserById",
  GET_USER_BY_USERNAME: "GetUserByUsername",
  GET_USER_BY_EMAIL: "GetUserByEmail",
  GET_ALL_USERS: "GetAllUsers",
  GET_USERS_BY_IDS: "GetUsersByIds",
  GET_USER_EVENTS: "GetUserEvents",
  SEARCH_USERS: "SearchUsers",
} as const;

export type QueryType = (typeof QueryType)[keyof typeof QueryType];

/**
 * Base query structure (simplified)
 */
export interface BaseQuery<TType extends QueryType, TPayload> {
  readonly type: TType;
  readonly payload: TPayload;
  readonly metadata?: EventMetadata;
}

/**
 * Query payload types
 */
export interface GetUserByIdPayload {
  userId: string;
}

export interface GetUserByUsernamePayload {
  username: string;
}

export interface GetUserByEmailPayload {
  email: string;
}

export interface GetAllUsersPayload {
  filter?: UserFilter;
  pagination?: Pagination;
  sorting?: Sorting<UserSortField>;
}

export interface GetUsersByIdsPayload {
  userIds: string[];
}

export interface GetUserEventsPayload {
  userId: string;
  eventTypes?: string[];
  fromDate?: Date;
  toDate?: Date;
  pagination?: Pagination;
}

export interface SearchUsersPayload {
  searchTerm: string;
  searchFields?: UserSearchField[];
  filter?: UserFilter;
  pagination?: Pagination;
}

/**
 * Query type definitions
 */
export type GetUserByIdQuery = BaseQuery<
  typeof QueryType.GET_USER_BY_ID,
  GetUserByIdPayload
>;
export type GetUserByUsernameQuery = BaseQuery<
  typeof QueryType.GET_USER_BY_USERNAME,
  GetUserByUsernamePayload
>;
export type GetUserByEmailQuery = BaseQuery<
  typeof QueryType.GET_USER_BY_EMAIL,
  GetUserByEmailPayload
>;
export type GetAllUsersQuery = BaseQuery<
  typeof QueryType.GET_ALL_USERS,
  GetAllUsersPayload
>;
export type GetUsersByIdsQuery = BaseQuery<
  typeof QueryType.GET_USERS_BY_IDS,
  GetUsersByIdsPayload
>;
export type GetUserEventsQuery = BaseQuery<
  typeof QueryType.GET_USER_EVENTS,
  GetUserEventsPayload
>;
export type SearchUsersQuery = BaseQuery<
  typeof QueryType.SEARCH_USERS,
  SearchUsersPayload
>;

/**
 * Union type for all user queries
 */
export type UserQuery =
  | GetUserByIdQuery
  | GetUserByUsernameQuery
  | GetUserByEmailQuery
  | GetAllUsersQuery
  | GetUsersByIdsQuery
  | GetUserEventsQuery
  | SearchUsersQuery;

/**
 * Query validation schemas
 */
export const getUserByIdQuerySchema = z.object({
  type: z.literal(QueryType.GET_USER_BY_ID),
  metadata: eventMetadataSchema.optional(),
  payload: z.object({
    userId: z.string().uuid(),
  }),
});

export const getUserByUsernameQuerySchema = z.object({
  type: z.literal(QueryType.GET_USER_BY_USERNAME),
  metadata: eventMetadataSchema.optional(),
  payload: z.object({
    username: z.string().min(3).max(50),
  }),
});

export const getUserByEmailQuerySchema = z.object({
  type: z.literal(QueryType.GET_USER_BY_EMAIL),
  metadata: eventMetadataSchema.optional(),
  payload: z.object({
    email: z.email(),
  }),
});

export const getAllUsersQuerySchema = z.object({
  type: z.literal(QueryType.GET_ALL_USERS),
  metadata: eventMetadataSchema.optional(),
  payload: z.object({
    filter: z
      .object({
        role: z.enum(["USER", "ADMIN", "MODERATOR"]).optional(),
        isActive: z.boolean().optional(),
      })
      .optional(),
    pagination: z
      .object({
        offset: z.number().min(0).optional(),
        limit: z.number().min(1).max(100).optional(),
      })
      .optional(),
    sorting: z
      .object({
        field: z.enum(["username", "email", "name", "createdAt", "updatedAt"]),
        direction: z.enum(["ASC", "DESC"]),
      })
      .optional(),
  }),
});

export const getUsersByIdsQuerySchema = z.object({
  type: z.literal(QueryType.GET_USERS_BY_IDS),
  metadata: eventMetadataSchema.optional(),
  payload: z.object({
    userIds: z.array(z.string().uuid()).min(1).max(100),
  }),
});

export const getUserEventsQuerySchema = z.object({
  type: z.literal(QueryType.GET_USER_EVENTS),
  metadata: eventMetadataSchema.optional(),
  payload: z.object({
    userId: z.string().uuid(),
    eventTypes: z.array(z.string()).optional(),
    fromDate: z.date().optional(),
    toDate: z.date().optional(),
    pagination: z
      .object({
        offset: z.number().min(0).optional(),
        limit: z.number().min(1).max(100).optional(),
      })
      .optional(),
  }),
});

export const searchUsersQuerySchema = z.object({
  type: z.literal(QueryType.SEARCH_USERS),
  metadata: eventMetadataSchema.optional(),
  payload: z.object({
    searchTerm: z.string().min(1).max(100),
    searchFields: z.array(z.enum(["username", "email", "name"])).optional(),
    filter: z
      .object({
        role: z.enum(["USER", "ADMIN", "MODERATOR"]).optional(),
        isActive: z.boolean().optional(),
      })
      .optional(),
    pagination: z
      .object({
        offset: z.number().min(0).optional(),
        limit: z.number().min(1).max(100).optional(),
      })
      .optional(),
  }),
});

/**
 * Query validation schema map
 */
export const querySchemas = {
  [QueryType.GET_USER_BY_ID]: getUserByIdQuerySchema,
  [QueryType.GET_USER_BY_USERNAME]: getUserByUsernameQuerySchema,
  [QueryType.GET_USER_BY_EMAIL]: getUserByEmailQuerySchema,
  [QueryType.GET_ALL_USERS]: getAllUsersQuerySchema,
  [QueryType.GET_USERS_BY_IDS]: getUsersByIdsQuerySchema,
  [QueryType.GET_USER_EVENTS]: getUserEventsQuerySchema,
  [QueryType.SEARCH_USERS]: searchUsersQuerySchema,
} as const satisfies Record<QueryType, z.ZodSchema>;

/**
 * Type-safe query validation
 */
export function validateQuery<T extends UserQuery>(query: T): T {
  const schema = querySchemas[query.type];
  if (!schema) {
    throw new Error(`Unknown query type: ${query.type}`);
  }

  const result = schema.safeParse(query);

  if (!result.success) {
    const messages = result.error.issues
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ");
    throw new Error(`Query validation failed: ${messages}`);
  }

  return result.data as T;
}

/**
 * Query factory functions
 */
export const createQuery = {
  getUserById: (
    userId: UserId,
    metadata?: EventMetadata
  ): GetUserByIdQuery => ({
    type: QueryType.GET_USER_BY_ID,
    payload: { userId },
    metadata,
  }),

  getUserByUsername: (
    username: Username,
    metadata?: EventMetadata
  ): GetUserByUsernameQuery => ({
    type: QueryType.GET_USER_BY_USERNAME,
    payload: { username },
    metadata,
  }),

  getUserByEmail: (
    email: Email,
    metadata?: EventMetadata
  ): GetUserByEmailQuery => ({
    type: QueryType.GET_USER_BY_EMAIL,
    payload: { email },
    metadata,
  }),

  getAllUsers: (
    payload: GetAllUsersPayload = {},
    metadata?: EventMetadata
  ): GetAllUsersQuery => ({
    type: QueryType.GET_ALL_USERS,
    payload,
    metadata,
  }),

  getUsersByIds: (
    userIds: UserId[],
    metadata?: EventMetadata
  ): GetUsersByIdsQuery => ({
    type: QueryType.GET_USERS_BY_IDS,
    payload: { userIds },
    metadata,
  }),

  getUserEvents: (
    payload: GetUserEventsPayload,
    metadata?: EventMetadata
  ): GetUserEventsQuery => ({
    type: QueryType.GET_USER_EVENTS,
    payload,
    metadata,
  }),

  searchUsers: (
    payload: SearchUsersPayload,
    metadata?: EventMetadata
  ): SearchUsersQuery => ({
    type: QueryType.SEARCH_USERS,
    payload,
    metadata,
  }),
} as const;

/**
 * User view model (read model)
 */
export interface UserViewModel {
  id: UserId;
  username: Username;
  email: Email;
  name: string;
  phoneNumber?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  version?: number;
}

/**
 * User event view model
 */
export interface UserEventViewModel {
  id: EventId;
  type: string;
  aggregateId: UserId;
  data: Record<string, unknown>;
  metadata: EventMetadata;
  occurredAt: Date;
  version: number;
}

/**
 * Paginated result with improved typing
 */
export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset?: number;
}

/**
 * Query result with discriminated union
 */
export type QueryResult<T = unknown> =
  | Result<T, never>
  | Result<never, Error>;

/**
 * Type guards for queries
 */
export const isQuery = {
  getUserById: (query: UserQuery): query is GetUserByIdQuery =>
    query.type === QueryType.GET_USER_BY_ID,
  getUserByUsername: (query: UserQuery): query is GetUserByUsernameQuery =>
    query.type === QueryType.GET_USER_BY_USERNAME,
  getUserByEmail: (query: UserQuery): query is GetUserByEmailQuery =>
    query.type === QueryType.GET_USER_BY_EMAIL,
  getAllUsers: (query: UserQuery): query is GetAllUsersQuery =>
    query.type === QueryType.GET_ALL_USERS,
  getUsersByIds: (query: UserQuery): query is GetUsersByIdsQuery =>
    query.type === QueryType.GET_USERS_BY_IDS,
  getUserEvents: (query: UserQuery): query is GetUserEventsQuery =>
    query.type === QueryType.GET_USER_EVENTS,
  searchUsers: (query: UserQuery): query is SearchUsersQuery =>
    query.type === QueryType.SEARCH_USERS,
} as const;

/**
 * Helper to create paginated results
 */
export function createPaginatedResult<T>(
  items: T[],
  totalCount: number,
  offset: number,
  limit: number
): PaginatedResult<T> {
  const hasMore = offset + items.length < totalCount;
  return {
    items,
    totalCount,
    offset,
    limit,
    hasMore,
    nextOffset: hasMore ? offset + limit : undefined,
  };
}
