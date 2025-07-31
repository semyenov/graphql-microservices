/**
 * Common pagination types and utilities
 */

/**
 * Offset-based pagination
 */
export interface OffsetPagination {
  offset: number;
  limit: number;
}

/**
 * Cursor-based pagination
 */
export interface CursorPagination {
  cursor?: string;
  limit: number;
  direction?: 'forward' | 'backward';
}

/**
 * Page-based pagination
 */
export interface PagePagination {
  page: number;
  pageSize: number;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Paginated result with offset pagination
 */
export interface OffsetPaginatedResult<T> extends PaginationMeta {
  items: T[];
  pageInfo: {
    offset: number;
    limit: number;
  };
}

/**
 * Paginated result with cursor pagination
 */
export interface CursorPaginatedResult<T> extends PaginationMeta {
  items: T[];
  edges: Array<{
    cursor: string;
    node: T;
  }>;
  pageInfo: {
    startCursor?: string;
    endCursor?: string;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/**
 * Paginated result with page-based pagination
 */
export interface PagePaginatedResult<T> extends PaginationMeta {
  items: T[];
  pageInfo: {
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/**
 * Generic paginated result
 */
export type PaginatedResult<T> =
  | OffsetPaginatedResult<T>
  | CursorPaginatedResult<T>
  | PagePaginatedResult<T>;

/**
 * Pagination utilities
 */
export const PaginationUtils = {
  /**
   * Create offset paginated result
   */
  offsetResult: <T>(
    items: T[],
    totalCount: number,
    offset: number,
    limit: number
  ): OffsetPaginatedResult<T> => ({
    items,
    totalCount,
    hasNextPage: offset + items.length < totalCount,
    hasPreviousPage: offset > 0,
    pageInfo: {
      offset,
      limit,
    },
  }),

  /**
   * Create cursor paginated result
   */
  cursorResult: <T>(
    items: T[],
    totalCount: number,
    getCursor: (item: T) => string
  ): CursorPaginatedResult<T> => {
    const edges = items.map((item) => ({
      cursor: getCursor(item),
      node: item,
    }));

    return {
      items,
      edges,
      totalCount,
      hasNextPage: items.length > 0, // Should be determined by actual query
      hasPreviousPage: false, // Should be determined by actual query
      pageInfo: {
        startCursor: edges[0]?.cursor,
        endCursor: edges[edges.length - 1]?.cursor,
        hasNextPage: items.length > 0,
        hasPreviousPage: false,
      },
    };
  },

  /**
   * Create page-based paginated result
   */
  pageResult: <T>(
    items: T[],
    totalCount: number,
    page: number,
    pageSize: number
  ): PagePaginatedResult<T> => {
    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      items,
      totalCount,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      pageInfo: {
        page,
        pageSize,
        totalPages,
      },
    };
  },

  /**
   * Convert offset to page
   */
  offsetToPage: (offset: number, pageSize: number): number => Math.floor(offset / pageSize) + 1,

  /**
   * Convert page to offset
   */
  pageToOffset: (page: number, pageSize: number): number => (page - 1) * pageSize,

  /**
   * Validate pagination parameters
   */
  validate: {
    offset: (pagination: OffsetPagination): OffsetPagination => ({
      offset: Math.max(0, pagination.offset),
      limit: Math.min(Math.max(1, pagination.limit), 100),
    }),

    page: (pagination: PagePagination): PagePagination => ({
      page: Math.max(1, pagination.page),
      pageSize: Math.min(Math.max(1, pagination.pageSize), 100),
    }),

    cursor: (pagination: CursorPagination): CursorPagination => ({
      ...pagination,
      limit: Math.min(Math.max(1, pagination.limit), 100),
    }),
  },

  /**
   * Create default pagination
   */
  defaults: {
    offset: (): OffsetPagination => ({ offset: 0, limit: 20 }),
    page: (): PagePagination => ({ page: 1, pageSize: 20 }),
    cursor: (): CursorPagination => ({ limit: 20 }),
  },
};

/**
 * Type guard for pagination types
 */
export const isPagination = {
  offset: (value: unknown): value is OffsetPagination =>
    typeof value === 'object' &&
    value !== null &&
    'offset' in value &&
    'limit' in value &&
    typeof (value as any).offset === 'number' &&
    typeof (value as any).limit === 'number',

  page: (value: unknown): value is PagePagination =>
    typeof value === 'object' &&
    value !== null &&
    'page' in value &&
    'pageSize' in value &&
    typeof (value as any).page === 'number' &&
    typeof (value as any).pageSize === 'number',

  cursor: (value: unknown): value is CursorPagination =>
    typeof value === 'object' &&
    value !== null &&
    'limit' in value &&
    typeof (value as any).limit === 'number',
};
