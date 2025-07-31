/**
 * Shared type utilities for converting between Prisma and GraphQL types
 */

import { createErrorLogger } from '@graphql-microservices/shared-errors';
import { GraphQLError } from 'graphql';

const logError = createErrorLogger('type-utils');

/**
 * Common type conversion utilities
 */

/**
 * Convert Prisma Decimal to GraphQL Float
 * Handles BigInt, Decimal, and string representations
 */
export const toGraphQLFloat = (value: unknown): number => {
  if (value === null || value === undefined) {
    return 0;
  }

  // Handle Prisma Decimal type
  if (typeof value === 'object' && value.toString) {
    return Number(value.toString());
  }

  // Handle BigInt
  if (typeof value === 'bigint') {
    return Number(value);
  }

  // Handle string
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      logError(new Error(`Invalid numeric value: ${value}`), { value });
      return 0;
    }
    return parsed;
  }

  return Number(value);
};

/**
 * Convert Prisma DateTime to GraphQL String (ISO format)
 */
export const toGraphQLDateTime = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;

  if (typeof value === 'string') {
    // Validate it's a valid date string
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      logError(new Error(`Invalid date value: ${value}`), { value });
      return null;
    }
    return date.toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return null;
};

/**
 * Convert Prisma JSON to GraphQL-safe object
 * Ensures proper serialization and removes undefined values
 */
export const toGraphQLJSON = <T = unknown>(value: unknown): T | null => {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    // If it's already an object, clean it
    if (typeof value === 'object') {
      return cleanObject(value) as T;
    }

    // If it's a string, try to parse it
    if (typeof value === 'string') {
      const parsed = JSON.parse(value);
      return cleanObject(parsed) as T;
    }

    return value as T;
  } catch (error) {
    logError(error as Error, { operation: 'toGraphQLJSON', value });
    return null;
  }
};

/**
 * Clean object by removing undefined values and converting dates
 */
const cleanObject = (obj: unknown): unknown => {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map(cleanObject).filter((item) => item !== undefined);
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanObject(value);
      }
    }
    return cleaned;
  }

  return obj;
};

/**
 * Convert Prisma array fields to GraphQL arrays
 * Handles null/undefined and ensures proper typing
 */
export const toGraphQLArray = <T>(value: T[] | null | undefined): T[] => {
  if (!value || !Array.isArray(value)) {
    return [];
  }
  return value;
};

/**
 * Convert nullable Prisma field to GraphQL nullable field
 * Useful for optional fields
 */
export const toGraphQLNullable = <T>(value: T | null | undefined): T | null => {
  return value ?? null;
};

/**
 * Batch convert Prisma model to GraphQL type
 * Generic transformer that applies conversion functions to specified fields
 */
export type FieldTransformer<T = unknown> = (
  value: unknown,
  fieldName: string,
  model: T
) => unknown;

export interface TransformConfig<T> {
  fields?: Record<string, FieldTransformer<T>>;
  exclude?: string[];
  dateFields?: string[];
  decimalFields?: string[];
  jsonFields?: string[];
  arrayFields?: string[];
}

export const transformPrismaToGraphQL = <TPrisma, TGraphQL>(
  model: TPrisma,
  config: TransformConfig<TPrisma> = {}
): TGraphQL => {
  if (!model || typeof model !== 'object') {
    throw new GraphQLError('Invalid model provided for transformation');
  }

  const {
    fields = {},
    exclude = [],
    dateFields = [],
    decimalFields = [],
    jsonFields = [],
    arrayFields = [],
  } = config;

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(model as Record<string, unknown>)) {
    // Skip excluded fields
    if (exclude.includes(key)) {
      continue;
    }

    // Apply custom transformer if available
    if (fields[key]) {
      result[key] = fields[key](value, key, model);
      continue;
    }

    // Apply type-specific transformations
    if (dateFields.includes(key)) {
      result[key] = toGraphQLDateTime(value as string | Date | null | undefined);
    } else if (decimalFields.includes(key)) {
      result[key] = toGraphQLFloat(value);
    } else if (jsonFields.includes(key)) {
      result[key] = toGraphQLJSON(value);
    } else if (arrayFields.includes(key)) {
      result[key] = toGraphQLArray(value as unknown[] | null | undefined);
    } else {
      // Default: copy as-is
      result[key] = value;
    }
  }

  return result as TGraphQL;
};

/**
 * Create a reusable transformer for a specific model type
 */
export const createModelTransformer = <TPrisma, TGraphQL>(
  config: TransformConfig<TPrisma>
): ((model: TPrisma) => TGraphQL) => {
  return (model: TPrisma) => transformPrismaToGraphQL<TPrisma, TGraphQL>(model, config);
};

/**
 * Common transformers for typical patterns
 */

// User model transformer
export const createUserTransformer = <TPrismaUser, TGraphQLUser>() =>
  createModelTransformer<TPrismaUser, TGraphQLUser>({
    dateFields: ['createdAt', 'updatedAt', 'lastLoginAt'],
    exclude: ['password', 'refreshToken'],
  });

// Product model transformer
export const createProductTransformer = <TPrismaProduct, TGraphQLProduct>() =>
  createModelTransformer<TPrismaProduct, TGraphQLProduct>({
    dateFields: ['createdAt', 'updatedAt'],
    decimalFields: ['price', 'cost', 'discount'],
    arrayFields: ['tags', 'categories'],
    jsonFields: ['metadata', 'specifications'],
  });

// Order model transformer
export const createOrderTransformer = <TPrismaOrder, TGraphQLOrder>() =>
  createModelTransformer<TPrismaOrder, TGraphQLOrder>({
    dateFields: ['createdAt', 'updatedAt', 'shippedAt', 'deliveredAt'],
    decimalFields: ['subtotal', 'tax', 'shipping', 'total', 'discount'],
    jsonFields: ['shippingInfo', 'paymentInfo', 'metadata'],
  });

/**
 * Pagination helpers
 */

export interface PrismaPage<T> {
  data: T[];
  total: number;
  hasMore?: boolean;
}

export interface GraphQLConnection<T> {
  nodes: T[];
  edges: Array<{
    node: T;
    cursor: string;
  }>;
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
    totalCount?: number;
  };
  totalCount?: number;
}

/**
 * Convert Prisma pagination result to GraphQL connection
 */
export const toGraphQLConnection = <TPrisma, TGraphQL>(
  page: PrismaPage<TPrisma>,
  transformer: (item: TPrisma) => TGraphQL,
  args: {
    first?: number | null;
    after?: string | null;
    last?: number | null;
    before?: string | null;
  }
): GraphQLConnection<TGraphQL> => {
  const nodes = page.data.map(transformer);
  const edges = nodes.map((node, index) => ({
    node,
    cursor: encodeCursor(page.data[index]!),
  }));

  return {
    nodes,
    edges,
    pageInfo: {
      hasNextPage: page.hasMore ?? false,
      hasPreviousPage: !!args.after || !!args.before,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
      totalCount: page.total,
    },
    totalCount: page.total,
  };
};

/**
 * Simple cursor encoding/decoding
 */
export const encodeCursor = (item: { id?: string; _id?: string }): string => {
  const id = item.id || item._id || '';
  return Buffer.from(`cursor:${id}`).toString('base64');
};

export const decodeCursor = (cursor: string): string => {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    return decoded.replace('cursor:', '');
  } catch (error) {
    logError(error as Error, { operation: 'decodeCursor', cursor });
    return '';
  }
};

/**
 * Error transformation utilities
 */

/**
 * Convert Prisma errors to GraphQL errors
 */
export const handlePrismaError = (error: {
  code?: string;
  message?: string;
  meta?: { target?: string[] };
}): GraphQLError => {
  // Unique constraint violation
  if (error.code === 'P2002') {
    const field = error.meta?.target?.[0] || 'field';
    return new GraphQLError(`A record with this ${field} already exists`, {
      extensions: {
        code: 'UNIQUE_CONSTRAINT_VIOLATION',
        field,
      },
    });
  }

  // Record not found
  if (error.code === 'P2025') {
    return new GraphQLError('Record not found', {
      extensions: {
        code: 'NOT_FOUND',
      },
    });
  }

  // Foreign key constraint
  if (error.code === 'P2003') {
    return new GraphQLError('Invalid reference: related record does not exist', {
      extensions: {
        code: 'FOREIGN_KEY_VIOLATION',
      },
    });
  }

  // Default error
  return new GraphQLError('Database operation failed', {
    extensions: {
      code: 'DATABASE_ERROR',
      originalError: error.message,
    },
  });
};

/**
 * Type guards
 */

export const isValidId = (id: unknown): id is string => {
  return typeof id === 'string' && id.length > 0;
};

export const isValidDate = (date: unknown): date is Date => {
  return date instanceof Date && !Number.isNaN(date.getTime());
};

export const isValidEmail = (email: unknown): email is string => {
  if (typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Batch operations helpers
 */

export const batchTransform = <TPrisma, TGraphQL>(
  items: TPrisma[],
  transformer: (item: TPrisma) => TGraphQL
): TGraphQL[] => {
  return items.map(transformer);
};

export const groupBy = <T, K extends keyof T>(items: T[], key: K): Map<T[K], T[]> => {
  const grouped = new Map<T[K], T[]>();

  for (const item of items) {
    const groupKey = item[key];
    const group = grouped.get(groupKey) || [];
    group.push(item);
    grouped.set(groupKey, group);
  }

  return grouped;
};

/**
 * Export all utilities
 */
export default {
  toGraphQLFloat,
  toGraphQLDateTime,
  toGraphQLJSON,
  toGraphQLArray,
  toGraphQLNullable,
  transformPrismaToGraphQL,
  createModelTransformer,
  createUserTransformer,
  createProductTransformer,
  createOrderTransformer,
  toGraphQLConnection,
  encodeCursor,
  decodeCursor,
  handlePrismaError,
  isValidId,
  isValidDate,
  isValidEmail,
  batchTransform,
  groupBy,
};
