import type { EventStore, EventStoreQuery } from '@graphql-microservices/event-sourcing';
import type { CacheService } from '@graphql-microservices/shared-cache';
import type { PrismaClient } from '../../generated/prisma';
import {
  type GetAllUsersQuery,
  type GetUserByEmailQuery,
  type GetUserByIdQuery,
  type GetUserByUsernameQuery,
  type GetUserEventsQuery,
  type GetUsersByIdsQuery,
  type PaginatedResult,
  type QueryResult,
  type SearchUsersQuery,
  type UserEventViewModel,
  type UserQuery,
  type UserViewModel,
  validateQuery,
} from './queries';

/**
 * Query handler interface
 */
export interface QueryHandler<T extends UserQuery, R = unknown> {
  handle(query: T): Promise<QueryResult<R>>;
}

/**
 * Base query handler with common functionality
 */
abstract class BaseQueryHandler<T extends UserQuery, R = unknown> implements QueryHandler<T, R> {
  constructor(
    protected readonly prisma: PrismaClient,
    protected readonly eventStore: EventStore,
    protected readonly cacheService?: CacheService
  ) {}

  abstract handle(query: T): Promise<QueryResult<R>>;

  /**
   * Transform Prisma user to view model
   */
  protected transformUserToViewModel(user: {
    id: string;
    username: string;
    email: string;
    name: string;
    phoneNumber?: string | null;
    role: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): UserViewModel {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      phoneNumber: user.phoneNumber ?? undefined,
      role: user.role as 'USER' | 'ADMIN' | 'MODERATOR',
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Execute query with caching support
   */
  protected async executeWithCache<T>(
    cacheKey: string,
    queryFn: () => Promise<T>,
    ttl: number = 300 // 5 minutes
  ): Promise<T> {
    if (!this.cacheService) {
      return queryFn();
    }

    // Try cache first
    const cached = await this.cacheService.get<T>(`user:${cacheKey}` as `${string}:${string}`);
    if (cached !== null) {
      return cached;
    }

    // Execute query and cache result
    const result = await queryFn();
    await this.cacheService.set(`user:${cacheKey}` as `${string}:${string}`, result, ttl);

    return result;
  }

  /**
   * Handle common query execution pattern
   */
  protected async executeQuery<T>(
    query: UserQuery,
    queryFn: () => Promise<T>
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();

    try {
      // Validate query
      validateQuery(query);

      // Execute query
      const data = await queryFn();

      return {
        success: true,
        data,
        metadata: {
          executionTime: Date.now() - startTime,
          source: 'query-handler',
        },
      };
    } catch (error) {
      console.error(`Query ${query.type} failed:`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          executionTime: Date.now() - startTime,
          source: 'query-handler',
        },
      };
    }
  }
}

/**
 * Get User By ID Query Handler
 */
export class GetUserByIdQueryHandler extends BaseQueryHandler<
  GetUserByIdQuery,
  UserViewModel | null
> {
  async handle(query: GetUserByIdQuery): Promise<QueryResult<UserViewModel | null>> {
    return this.executeQuery(query, async () => {
      const cacheKey = `user:${query.payload.userId}`;

      return this.executeWithCache(cacheKey, async () => {
        const user = await this.prisma.user.findUnique({
          where: { id: query.payload.userId },
        });

        return user ? this.transformUserToViewModel(user) : null;
      });
    });
  }
}

/**
 * Get User By Username Query Handler
 */
export class GetUserByUsernameQueryHandler extends BaseQueryHandler<
  GetUserByUsernameQuery,
  UserViewModel | null
> {
  async handle(query: GetUserByUsernameQuery): Promise<QueryResult<UserViewModel | null>> {
    return this.executeQuery(query, async () => {
      const cacheKey = `user:username:${query.payload.username}`;

      return this.executeWithCache(cacheKey, async () => {
        const user = await this.prisma.user.findUnique({
          where: { username: query.payload.username },
        });

        return user ? this.transformUserToViewModel(user) : null;
      });
    });
  }
}

/**
 * Get User By Email Query Handler
 */
export class GetUserByEmailQueryHandler extends BaseQueryHandler<
  GetUserByEmailQuery,
  UserViewModel | null
> {
  async handle(query: GetUserByEmailQuery): Promise<QueryResult<UserViewModel | null>> {
    return this.executeQuery(query, async () => {
      const cacheKey = `user:email:${query.payload.email}`;

      return this.executeWithCache(cacheKey, async () => {
        const user = await this.prisma.user.findUnique({
          where: { email: query.payload.email },
        });

        return user ? this.transformUserToViewModel(user) : null;
      });
    });
  }
}

/**
 * Get All Users Query Handler
 */
export class GetAllUsersQueryHandler extends BaseQueryHandler<
  GetAllUsersQuery,
  PaginatedResult<UserViewModel>
> {
  async handle(query: GetAllUsersQuery): Promise<QueryResult<PaginatedResult<UserViewModel>>> {
    return this.executeQuery(query, async () => {
      const { filter, pagination, sorting } = query.payload;

      // Build where clause
      const where: Record<string, unknown> = {};
      if (filter?.role) {
        where.role = filter.role;
      }
      if (filter?.isActive !== undefined) {
        where.isActive = filter.isActive;
      }

      // Build order by clause
      const orderBy: Record<string, string> = {};
      if (sorting) {
        orderBy[sorting.field] = sorting.direction.toLowerCase();
      } else {
        orderBy.createdAt = 'desc'; // Default sorting
      }

      // Pagination
      const offset = pagination?.offset || 0;
      const limit = Math.min(pagination?.limit || 50, 100); // Max 100 items

      // Execute queries in parallel
      const [users, totalCount] = await Promise.all([
        this.prisma.user.findMany({
          where,
          orderBy,
          skip: offset,
          take: limit,
        }),
        this.prisma.user.count({ where }),
      ]);

      return {
        items: users.map((user) => this.transformUserToViewModel(user)),
        totalCount,
        offset,
        limit,
        hasMore: offset + limit < totalCount,
      };
    });
  }
}

/**
 * Get Users By IDs Query Handler (for batch loading)
 */
export class GetUsersByIdsQueryHandler extends BaseQueryHandler<
  GetUsersByIdsQuery,
  UserViewModel[]
> {
  async handle(query: GetUsersByIdsQuery): Promise<QueryResult<UserViewModel[]>> {
    return this.executeQuery(query, async () => {
      const users = await this.prisma.user.findMany({
        where: {
          id: { in: query.payload.userIds },
        },
      });

      // Maintain order of requested IDs
      const userMap = new Map(users.map((user) => [user.id, user]));

      return query.payload.userIds
        .map((id) => userMap.get(id))
        .filter((user) => user !== undefined)
        .map((user) => this.transformUserToViewModel(user));
    });
  }
}

/**
 * Get User Events Query Handler
 */
export class GetUserEventsQueryHandler extends BaseQueryHandler<
  GetUserEventsQuery,
  PaginatedResult<UserEventViewModel>
> {
  async handle(
    query: GetUserEventsQuery
  ): Promise<QueryResult<PaginatedResult<UserEventViewModel>>> {
    return this.executeQuery(query, async () => {
      const { userId, eventTypes, fromDate, toDate, pagination } = query.payload;

      // Build event store query
      const eventQuery: EventStoreQuery = {
        aggregateId: userId,
        aggregateType: 'User',
      };

      if (fromDate || toDate) {
        eventQuery.timeRange = {};
        if (fromDate) eventQuery.timeRange.from = fromDate;
        if (toDate) eventQuery.timeRange.to = toDate;
      }

      const limit = Math.min(pagination?.limit || 50, 100);
      const offset = pagination?.offset || 0;

      // Get events from event store
      const events = await this.eventStore.readEvents({
        ...eventQuery,
        limit: limit + offset, // Rough approximation for pagination
      });

      // Filter by event types if specified
      let filteredEvents = events;
      if (eventTypes && eventTypes.length > 0) {
        filteredEvents = events.filter((event) => eventTypes.includes(event.type));
      }

      return {
        items: filteredEvents.slice(offset, offset + limit).map((event) => ({
          ...event,
          metadata: event.metadata,
        })),
        totalCount: filteredEvents.length,
        offset,
        limit,
        hasMore: offset + limit < filteredEvents.length,
      };
    });
  }
}

/**
 * Search Users Query Handler
 */
export class SearchUsersQueryHandler extends BaseQueryHandler<
  SearchUsersQuery,
  PaginatedResult<UserViewModel>
> {
  async handle(query: SearchUsersQuery): Promise<QueryResult<PaginatedResult<UserViewModel>>> {
    return this.executeQuery(query, async () => {
      const { searchTerm, searchFields, filter, pagination } = query.payload;

      // Build search conditions
      const searchConditions: Record<string, unknown>[] = [];
      const fieldsToSearch = searchFields || ['username', 'email', 'name'];

      for (const field of fieldsToSearch) {
        searchConditions.push({
          [field]: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        });
      }

      // Build where clause
      const where: Record<string, unknown> = {
        OR: searchConditions,
      };

      if (filter?.role) {
        where.role = filter.role;
      }
      if (filter?.isActive !== undefined) {
        where.isActive = filter.isActive;
      }

      // Pagination
      const offset = pagination?.offset || 0;
      const limit = Math.min(pagination?.limit || 50, 100);

      // Execute queries in parallel
      const [users, totalCount] = await Promise.all([
        this.prisma.user.findMany({
          where,
          orderBy: { username: 'asc' },
          skip: offset,
          take: limit,
        }),
        this.prisma.user.count({ where }),
      ]);

      return {
        items: users.map((user) => this.transformUserToViewModel(user)),
        totalCount,
        offset,
        limit,
        hasMore: offset + limit < totalCount,
      };
    });
  }
}

/**
 * Query Bus - Routes queries to appropriate handlers
 */
export class UserQueryBus {
  private readonly handlers = new Map<string, QueryHandler<UserQuery, unknown>>();

  constructor(prisma: PrismaClient, eventStore: EventStore, cacheService?: CacheService) {
    // Register query handlers
    this.handlers.set('GetUserById', new GetUserByIdQueryHandler(prisma, eventStore, cacheService));
    this.handlers.set(
      'GetUserByUsername',
      new GetUserByUsernameQueryHandler(prisma, eventStore, cacheService)
    );
    this.handlers.set(
      'GetUserByEmail',
      new GetUserByEmailQueryHandler(prisma, eventStore, cacheService)
    );
    this.handlers.set('GetAllUsers', new GetAllUsersQueryHandler(prisma, eventStore, cacheService));
    this.handlers.set(
      'GetUsersByIds',
      new GetUsersByIdsQueryHandler(prisma, eventStore, cacheService)
    );
    this.handlers.set(
      'GetUserEvents',
      new GetUserEventsQueryHandler(prisma, eventStore, cacheService)
    );
    this.handlers.set('SearchUsers', new SearchUsersQueryHandler(prisma, eventStore, cacheService));
  }

  /**
   * Execute a query
   */
  async execute<T extends UserQuery, R = unknown>(query: T): Promise<QueryResult<R>> {
    const handler = this.handlers.get(query.type) as QueryHandler<T, R>;
    if (!handler) {
      throw new Error(`No handler found for query type: ${query.type}`);
    }

    try {
      return await handler.handle(query);
    } catch (error) {
      console.error(`Query execution failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Register a custom query handler
   */
  registerHandler<T extends UserQuery, R = unknown>(
    queryType: string,
    handler: QueryHandler<T, R>
  ): void {
    this.handlers.set(queryType, handler);
  }

  /**
   * Get all registered query types
   */
  getRegisteredQueries(): string[] {
    return Array.from(this.handlers.keys());
  }
}
