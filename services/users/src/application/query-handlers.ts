import type { EventStoreQuery } from "@graphql-microservices/event-sourcing";
import type { PostgreSQLEventStore } from "@graphql-microservices/event-sourcing";
import type { CacheService } from "@graphql-microservices/shared-cache";
import type { PrismaClient } from "../../generated/prisma";
import {
  createPaginatedResult,
  type GetAllUsersQuery,
  type GetUserByEmailQuery,
  type GetUserByIdQuery,
  type GetUserByUsernameQuery,
  type GetUserEventsQuery,
  type GetUsersByIdsQuery,
  type PaginatedResult,
  type QueryResult,
  QueryType,
  type SearchUsersQuery,
  type UserEventViewModel,
  type UserQuery,
  type UserViewModel,
  validateQuery,
} from "./queries";
import {
  type CacheKeyTemplate,
  cacheKey,
  type Email,
  type UserId,
  type Username,
  type UserRole,
  type EventId,
  err,
  ok,
} from "./types";

export { type Result } from "@graphql-microservices/shared-type-utils";

/**
 * Query handler interface with improved typing
 */
export interface QueryHandler<T extends UserQuery, R = unknown> {
  readonly queryType: T["type"];
  handle(query: T): Promise<QueryResult<R>>;
  canHandle(query: UserQuery): query is T;
}

/**
 * Base query handler with common functionality
 */
abstract class BaseQueryHandler<T extends UserQuery, R = unknown>
  implements QueryHandler<T, R>
{
  abstract readonly queryType: T["type"];

  constructor(
    protected readonly prisma: PrismaClient,
    protected readonly eventStore: PostgreSQLEventStore,
    protected readonly cacheService?: CacheService
  ) {}

  abstract handle(query: T): Promise<QueryResult<R>>;

  canHandle(query: UserQuery): query is T {
    return query.type === this.queryType;
  }

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
      id: user.id as UserId,
      username: user.username as Username,
      email: user.email as Email,
      name: user.name,
      phoneNumber: user.phoneNumber ?? undefined,
      role: user.role as UserRole,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Execute query with caching support
   */
  protected async executeWithCache<T>(
    key: CacheKeyTemplate,
    queryFn: () => Promise<T>,
    ttl: number = 300 // 5 minutes
  ): Promise<T> {
    if (!this.cacheService) {
      return queryFn();
    }

    // Try cache first
    const cached = await this.cacheService.get<T>(key as `${string}:${string}`);
    if (cached !== null) {
      return cached;
    }

    // Execute query and cache result
    const result = await queryFn();
    await this.cacheService.set(key as `${string}:${string}`, result, ttl);

    return result;
  }

  /**
   * Handle common query execution pattern
   */
  protected async executeQuery<T extends UserQuery, R = unknown>(
    query: T,
    queryFn: () => Promise<R>
  ): Promise<QueryResult<R>> {
    try {
      // Validate query
      validateQuery(query);

      // Execute query
      const data = await queryFn();
      if (data === null || data === undefined) {
        return err(new Error("Query returned null or undefined"));
      }
      return ok(data);
    } catch (error) {
      console.error(`Query ${query.type} failed:`, error);

      let errorCode:
        | "NOT_FOUND"
        | "VALIDATION_ERROR"
        | "PERMISSION_DENIED"
        | "INTERNAL_ERROR";

      if (error instanceof Error && error.message.includes("not found")) {
        errorCode = "NOT_FOUND";
      } else {
        errorCode = "INTERNAL_ERROR";
      }

      return err(
        new Error(error instanceof Error ? error.message : "Unknown error")
      );
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
  readonly queryType = QueryType.GET_USER_BY_ID;
  async handle(
    query: GetUserByIdQuery
  ): Promise<QueryResult<UserViewModel | null>> {
    return this.executeQuery(query, async () => {
      const key = cacheKey.user(query.payload.userId as UserId);

      return this.executeWithCache(key, async () => {
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
  readonly queryType = QueryType.GET_USER_BY_USERNAME;
  async handle(
    query: GetUserByUsernameQuery
  ): Promise<QueryResult<UserViewModel | null>> {
    return this.executeQuery(query, async () => {
      const key = cacheKey.userByUsername(query.payload.username as Username);

      return this.executeWithCache(key, async () => {
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
  readonly queryType = QueryType.GET_USER_BY_EMAIL;
  async handle(
    query: GetUserByEmailQuery
  ): Promise<QueryResult<UserViewModel | null>> {
    return this.executeQuery(query, async () => {
      const key = cacheKey.userByEmail(query.payload.email as Email);

      return this.executeWithCache(key, async () => {
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
  readonly queryType = QueryType.GET_ALL_USERS;
  async handle(
    query: GetAllUsersQuery
  ): Promise<QueryResult<PaginatedResult<UserViewModel>>> {
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
        orderBy.createdAt = "desc"; // Default sorting
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

      return createPaginatedResult(
        users.map((user) => this.transformUserToViewModel(user)),
        totalCount,
        offset,
        limit
      );
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
  readonly queryType = QueryType.GET_USERS_BY_IDS;
  async handle(
    query: GetUsersByIdsQuery
  ): Promise<QueryResult<UserViewModel[]>> {
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
  readonly queryType = QueryType.GET_USER_EVENTS;
  async handle(
    query: GetUserEventsQuery
  ): Promise<QueryResult<PaginatedResult<UserEventViewModel>>> {
    return this.executeQuery(query, async () => {
      const { userId, eventTypes, fromDate, toDate, pagination } =
        query.payload;

      // Build event store query
      const eventQuery: EventStoreQuery = {
        aggregateId: userId,
        aggregateType: "User",
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
        filteredEvents = events.filter((event) =>
          eventTypes.includes(event.type)
        );
      }

      const items = filteredEvents
        .slice(offset, offset + limit)
        .map((event) => ({
          id: event.id as EventId,
          type: event.type,
          aggregateId: event.aggregateId as UserId,
          data: event.data,
          metadata: event.metadata,
          occurredAt: event.occurredAt,
          version: event.version,
        }));

      return createPaginatedResult(items, filteredEvents.length, offset, limit);
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
  readonly queryType = QueryType.SEARCH_USERS;
  async handle(
    query: SearchUsersQuery
  ): Promise<QueryResult<PaginatedResult<UserViewModel>>> {
    return this.executeQuery(query, async () => {
      const { searchTerm, searchFields, filter, pagination } = query.payload;

      // Build search conditions
      const searchConditions: Record<string, unknown>[] = [];
      const fieldsToSearch = searchFields || ["username", "email", "name"];

      for (const field of fieldsToSearch) {
        searchConditions.push({
          [field]: {
            contains: searchTerm,
            mode: "insensitive",
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
          orderBy: { username: "asc" },
          skip: offset,
          take: limit,
        }),
        this.prisma.user.count({ where }),
      ]);

      return createPaginatedResult(
        users.map((user) => this.transformUserToViewModel(user)),
        totalCount,
        offset,
        limit
      );
    });
  }
}

/**
 * Query Bus - Routes queries to appropriate handlers
 */
export class UserQueryBus {
  private readonly handlers: Map<QueryType, QueryHandler<UserQuery, any>> =
    new Map();

  constructor(
    prisma: PrismaClient,
    eventStore: PostgreSQLEventStore,
    cacheService?: CacheService
  ) {
    // Register query handlers with type safety
    const handlers: QueryHandler<UserQuery, unknown>[] = [
      new GetUserByIdQueryHandler(prisma, eventStore, cacheService),
      new GetUserByUsernameQueryHandler(prisma, eventStore, cacheService),
      new GetUserByEmailQueryHandler(prisma, eventStore, cacheService),
      new GetAllUsersQueryHandler(prisma, eventStore, cacheService),
      new GetUsersByIdsQueryHandler(prisma, eventStore, cacheService),
      new GetUserEventsQueryHandler(prisma, eventStore, cacheService),
      new SearchUsersQueryHandler(prisma, eventStore, cacheService),
    ];

    handlers.forEach((handler) => {
      this.handlers.set(handler.queryType, handler);
    });
  }

  /**
   * Execute a query
   */
  async execute<T extends UserQuery, R = unknown>(
    query: T
  ): Promise<QueryResult<R>> {
    const handler = this.handlers.get(query.type) as QueryHandler<T, R>;
    if (!handler) {
      throw new Error(`No handler found for query type: ${query.type}`);
    }

    try {
      return await handler.handle(query);
    } catch (error) {
      console.error(`Query execution failed:`, error);
      return err(new Error(error instanceof Error ? error.message : "Unknown error"));
    }
  }

  /**
   * Register a custom query handler
   */
  registerHandler<T extends UserQuery, R = unknown>(
    queryType: QueryType,
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
