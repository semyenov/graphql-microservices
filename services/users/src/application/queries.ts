import { type EventMetadata, eventMetadataSchema } from '@graphql-microservices/event-sourcing';
import { z } from 'zod';

/**
 * Base query interface
 */
export interface Query<
  TType extends string = string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
> {
  readonly type: TType;
  readonly metadata?: TMetadata;
}

/**
 * Get User By ID Query
 */
export interface GetUserByIdQuery extends Query<'GetUserById'> {
  type: 'GetUserById';
  payload: {
    userId: string;
  };
}

export const getUserByIdQuerySchema: z.ZodType<GetUserByIdQuery> = z.object({
  type: z.literal('GetUserById'),
  metadata: eventMetadataSchema,
  payload: z.object({
    userId: z.string(),
  }),
});

/**
 * Get User By Username Query
 */
export interface GetUserByUsernameQuery extends Query<'GetUserByUsername'> {
  type: 'GetUserByUsername';
  payload: {
    username: string;
  };
}

export const getUserByUsernameQuerySchema: z.ZodType<GetUserByUsernameQuery> = z.object({
  type: z.literal('GetUserByUsername'),
  metadata: eventMetadataSchema,
  payload: z.object({
    username: z.string().min(3).max(50),
  }),
});

/**
 * Get User By Email Query
 */
export interface GetUserByEmailQuery extends Query<'GetUserByEmail'> {
  type: 'GetUserByEmail';
  payload: {
    email: string;
  };
}

export const getUserByEmailQuerySchema: z.ZodType<GetUserByEmailQuery> = z.object({
  type: z.literal('GetUserByEmail'),
  metadata: eventMetadataSchema,
  payload: z.object({
    email: z.string().email(),
  }),
});

/**
 * Get All Users Query
 */
export interface GetAllUsersQuery extends Query<'GetAllUsers'> {
  type: 'GetAllUsers';
  payload: {
    filter?: {
      role?: 'USER' | 'ADMIN' | 'MODERATOR';
      isActive?: boolean;
    };
    pagination?: {
      offset?: number;
      limit?: number;
    };
    sorting?: {
      field: 'username' | 'email' | 'name' | 'createdAt' | 'updatedAt';
      direction: 'ASC' | 'DESC';
    };
  };
}

export const getAllUsersQuerySchema: z.ZodType<GetAllUsersQuery> = z.object({
  type: z.literal('GetAllUsers'),
  payload: z.object({
    filter: z
      .object({
        role: z.enum(['USER', 'ADMIN', 'MODERATOR']).optional(),
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
        field: z.enum(['username', 'email', 'name', 'createdAt', 'updatedAt']),
        direction: z.enum(['ASC', 'DESC']),
      })
      .optional(),
  }),
  metadata: eventMetadataSchema,
});

/**
 * Get Users By IDs Query (for batch loading)
 */
export interface GetUsersByIdsQuery extends Query<'GetUsersByIds'> {
  type: 'GetUsersByIds';
  payload: {
    userIds: string[];
  };
}

export const getUsersByIdsQuerySchema: z.ZodType<GetUsersByIdsQuery> = z.object({
  type: z.literal('GetUsersByIds'),
  payload: z.object({
    userIds: z.array(z.uuid()).min(1).max(100),
  }),
  metadata: eventMetadataSchema,
});

/**
 * Get User Events Query (for admin/audit purposes)
 */
export interface GetUserEventsQuery extends Query<'GetUserEvents'> {
  type: 'GetUserEvents';
  payload: {
    userId: string;
    eventTypes?: string[];
    fromDate?: Date;
    toDate?: Date;
    pagination?: {
      offset?: number;
      limit?: number;
    };
  };
}

export const getUserEventsQuerySchema: z.ZodType<GetUserEventsQuery> = z.object({
  type: z.literal('GetUserEvents'),
  payload: z.object({
    userId: z.uuid(),
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
  metadata: eventMetadataSchema,
});

/**
 * Search Users Query
 */
export interface SearchUsersQuery extends Query<'SearchUsers'> {
  type: 'SearchUsers';
  payload: {
    searchTerm: string;
    searchFields?: ('username' | 'email' | 'name')[];
    filter?: {
      role?: 'USER' | 'ADMIN' | 'MODERATOR';
      isActive?: boolean;
    };
    pagination?: {
      offset?: number;
      limit?: number;
    };
  };
}

export const searchUsersQuerySchema: z.ZodType<SearchUsersQuery> = z.object({
  type: z.literal('SearchUsers'),
  payload: z.object({
    searchTerm: z.string().min(1).max(100),
    searchFields: z.array(z.enum(['username', 'email', 'name'])).optional(),
    filter: z
      .object({
        role: z.enum(['USER', 'ADMIN', 'MODERATOR']).optional(),
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
  metadata: eventMetadataSchema,
});

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
 * Query validation schemas map
 */
export const userQuerySchemas = {
  GetUserById: getUserByIdQuerySchema,
  GetUserByUsername: getUserByUsernameQuerySchema,
  GetUserByEmail: getUserByEmailQuerySchema,
  GetAllUsers: getAllUsersQuerySchema,
  GetUsersByIds: getUsersByIdsQuerySchema,
  GetUserEvents: getUserEventsQuerySchema,
  SearchUsers: searchUsersQuerySchema,
} as const;

export type UserQuerySchema = typeof userQuerySchemas;
export type UserQueryType = keyof UserQuerySchema;

/**
 * Validate a query against its schema
 */
export function validateQuery<T extends UserQuery>(query: T): T {
  const schema = userQuerySchemas[query.type];
  if (!schema) {
    throw new Error(`Unknown query type: ${query.type}`);
  }

  try {
    return schema.parse(query) as unknown as T;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');

      throw new Error(`Query validation failed: ${messages}`);
    }
    throw error;
  }
}

/**
 * User view model (read model)
 */
export interface UserViewModel {
  id: string;
  username: string;
  email: string;
  name: string;
  phoneNumber?: string;
  role: 'USER' | 'ADMIN' | 'MODERATOR';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  version?: number; // Aggregate version (optional for view models)
}

/**
 * User event view model
 */
export interface UserEventViewModel {
  id: string;
  type: string;
  aggregateId: string;
  data: Record<string, unknown>;
  metadata: EventMetadata;
  occurredAt: Date;
  version: number;
}

/**
 * Paginated query result
 */
export interface PaginatedResult<T, TMetadata extends EventMetadata = EventMetadata> {
  items: T[];
  totalCount: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  metadata?: TMetadata;
}

/**
 * Query result interface
 */
export interface QueryResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    executionTime?: number;
    cacheHit?: boolean;
    source?: string;
  };
}
