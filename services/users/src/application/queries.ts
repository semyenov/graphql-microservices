import { z } from 'zod';

/**
 * Base query interface
 */
export interface Query {
  readonly type: string;
  readonly metadata?: {
    correlationId?: string;
    userId?: string;
    source?: string;
    timestamp?: Date;
  };
}

/**
 * Get User By ID Query
 */
export interface GetUserByIdQuery extends Query {
  type: 'GetUserById';
  payload: {
    userId: string;
  };
}

export const getUserByIdQuerySchema = z.object({
  type: z.literal('GetUserById'),
  payload: z.object({
    userId: z.string().uuid(),
  }),
  metadata: z
    .object({
      correlationId: z.string().optional(),
      userId: z.string().optional(),
      source: z.string().optional(),
      timestamp: z.date().optional(),
    })
    .optional(),
});

/**
 * Get User By Username Query
 */
export interface GetUserByUsernameQuery extends Query {
  type: 'GetUserByUsername';
  payload: {
    username: string;
  };
}

export const getUserByUsernameQuerySchema = z.object({
  type: z.literal('GetUserByUsername'),
  payload: z.object({
    username: z.string().min(3).max(50),
  }),
  metadata: z
    .object({
      correlationId: z.string().optional(),
      userId: z.string().optional(),
      source: z.string().optional(),
      timestamp: z.date().optional(),
    })
    .optional(),
});

/**
 * Get User By Email Query
 */
export interface GetUserByEmailQuery extends Query {
  type: 'GetUserByEmail';
  payload: {
    email: string;
  };
}

export const getUserByEmailQuerySchema = z.object({
  type: z.literal('GetUserByEmail'),
  payload: z.object({
    email: z.string().email(),
  }),
  metadata: z
    .object({
      correlationId: z.string().optional(),
      userId: z.string().optional(),
      source: z.string().optional(),
      timestamp: z.date().optional(),
    })
    .optional(),
});

/**
 * Get All Users Query
 */
export interface GetAllUsersQuery extends Query {
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

export const getAllUsersQuerySchema = z.object({
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
  metadata: z
    .object({
      correlationId: z.string().optional(),
      userId: z.string().optional(),
      source: z.string().optional(),
      timestamp: z.date().optional(),
    })
    .optional(),
});

/**
 * Get Users By IDs Query (for batch loading)
 */
export interface GetUsersByIdsQuery extends Query {
  type: 'GetUsersByIds';
  payload: {
    userIds: string[];
  };
}

export const getUsersByIdsQuerySchema = z.object({
  type: z.literal('GetUsersByIds'),
  payload: z.object({
    userIds: z.array(z.string().uuid()).min(1).max(100),
  }),
  metadata: z
    .object({
      correlationId: z.string().optional(),
      userId: z.string().optional(),
      source: z.string().optional(),
      timestamp: z.date().optional(),
    })
    .optional(),
});

/**
 * Get User Events Query (for admin/audit purposes)
 */
export interface GetUserEventsQuery extends Query {
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

export const getUserEventsQuerySchema = z.object({
  type: z.literal('GetUserEvents'),
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
  metadata: z
    .object({
      correlationId: z.string().optional(),
      userId: z.string().optional(),
      source: z.string().optional(),
      timestamp: z.date().optional(),
    })
    .optional(),
});

/**
 * Search Users Query
 */
export interface SearchUsersQuery extends Query {
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

export const searchUsersQuerySchema = z.object({
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
  metadata: z
    .object({
      correlationId: z.string().optional(),
      userId: z.string().optional(),
      source: z.string().optional(),
      timestamp: z.date().optional(),
    })
    .optional(),
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
export const querySchemas = {
  GetUserById: getUserByIdQuerySchema,
  GetUserByUsername: getUserByUsernameQuerySchema,
  GetUserByEmail: getUserByEmailQuerySchema,
  GetAllUsers: getAllUsersQuerySchema,
  GetUsersByIds: getUsersByIdsQuerySchema,
  GetUserEvents: getUserEventsQuerySchema,
  SearchUsers: searchUsersQuerySchema,
} as const;

/**
 * Validate a query against its schema
 */
export function validateQuery<T extends Query>(query: T): T {
  const schema = querySchemas[query.type as keyof typeof querySchemas];

  if (!schema) {
    throw new Error(`Unknown query type: ${query.type}`);
  }

  try {
    return schema.parse(query) as T;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
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
  metadata: Record<string, unknown>;
  occurredAt: Date;
  version: number;
}

/**
 * Paginated query result
 */
export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  offset: number;
  limit: number;
  hasMore: boolean;
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
