import { parseEnv, queryComplexityEnvSchema } from '@graphql-microservices/shared-config';
import { createErrorLogger, QueryComplexityError } from '@graphql-microservices/shared-errors';
import type {
  ApolloServerPlugin,
  BaseContext,
  GraphQLRequestContext,
  GraphQLRequestListener,
} from 'apollo-server-plugin-base';
import type { GraphQLSchema } from 'graphql';
import { parse as parseQuery } from 'graphql';
import type { ValidationRule } from 'graphql/validation/ValidationContext';
import depthLimit from 'graphql-depth-limit';
import {
  directiveEstimator,
  fieldExtensionsEstimator,
  getComplexity,
  simpleEstimator,
} from 'graphql-query-complexity';

const logError = createErrorLogger('query-complexity');

// Parse environment configuration
const env = parseEnv(queryComplexityEnvSchema);

/**
 * Configuration for query complexity analysis
 */
export interface QueryComplexityConfig {
  /**
   * Maximum allowed query complexity score
   * @default 1000
   */
  maximumComplexity?: number;

  /**
   * Maximum allowed query depth
   * @default 10
   */
  maximumDepth?: number;

  /**
   * Custom scalar complexity values
   * @default {}
   */
  scalarCost?: Record<string, number>;

  /**
   * Whether to include introspection in complexity calculation
   * @default false
   */
  includeIntrospection?: boolean;

  /**
   * Whether to log rejected queries
   * @default true
   */
  logRejectedQueries?: boolean;

  /**
   * Custom error message
   */
  customErrorMessage?: (complexity: number, maximum: number) => string;

  /**
   * Callback when query is rejected
   */
  onQueryRejected?: (complexity: number, query: string) => void;
}

/**
 * Default complexity configuration
 */
const defaultConfig: Required<QueryComplexityConfig> = {
  maximumComplexity: env.QUERY_MAX_COMPLEXITY || 1000,
  maximumDepth: env.QUERY_MAX_DEPTH || 10,
  scalarCost: {
    // Default costs for common operations
    ID: 1,
    String: 1,
    Int: 1,
    Float: 1,
    Boolean: 1,
    DateTime: 1,
  },
  includeIntrospection: false,
  logRejectedQueries: true,
  customErrorMessage: (complexity, maximum) =>
    `Query is too complex: ${complexity}. Maximum allowed complexity: ${maximum}`,
  onQueryRejected: () => {},
};

/**
 * Field complexity configuration for common patterns
 */
export const fieldComplexityConfig = {
  // List fields have higher complexity
  list: (_multiplier = 10) => ({
    complexity: ({
      args,
      childComplexity,
    }: {
      args: Record<string, unknown>;
      childComplexity: number;
    }) => {
      const limit = (args.first as number) || (args.limit as number) || 20;
      return childComplexity * Math.min(limit, 100);
    },
  }),

  // Paginated fields
  connection: (defaultLimit = 20) => ({
    complexity: ({
      args,
      childComplexity,
    }: {
      args: Record<string, unknown>;
      childComplexity: number;
    }) => {
      const limit = (args.first as number) || (args.last as number) || defaultLimit;
      return childComplexity * Math.min(limit, 100) + 1; // +1 for pageInfo
    },
  }),

  // Simple field
  scalar: (cost = 1) => ({
    complexity: cost,
  }),

  // Search operations are more expensive
  search: (baseCost = 5) => ({
    complexity: ({ args }: { args: Record<string, unknown> }) => {
      const limit = (args.limit as number) || 10;
      return baseCost * Math.min(limit, 50);
    },
  }),

  // Aggregation operations
  aggregate: (baseCost = 10) => ({
    complexity: baseCost,
  }),

  // Mutation operations
  mutation: (baseCost = 10) => ({
    complexity: ({ args }: { args: Record<string, unknown> }) => {
      // Bulk operations are more expensive
      if (args.items || args.updates) {
        const items = args.items as unknown[];
        const updates = args.updates as unknown[];
        const count = items?.length || updates?.length || 1;
        return baseCost * Math.min(count, 100);
      }
      return baseCost;
    },
  }),
};

/**
 * Create validation rules for query complexity
 */
export const createComplexityValidationRules = (
  _schema: GraphQLSchema,
  config: QueryComplexityConfig = {}
): ValidationRule[] => {
  const finalConfig = { ...defaultConfig, ...config };
  const rules: ValidationRule[] = [];

  // Add depth limit rule
  rules.push(
    depthLimit(finalConfig.maximumDepth, {
      ignore: finalConfig.includeIntrospection ? [] : ['__schema', '__type'],
    })
  );

  // Complexity validation is handled in the Apollo plugin instead
  // The getComplexity function is not compatible with ValidationRule interface

  return rules;
};

/**
 * Apollo Server plugin for query complexity analysis
 */
export const createQueryComplexityPlugin = <TContext extends BaseContext>(
  schema: GraphQLSchema,
  config: QueryComplexityConfig = {}
): ApolloServerPlugin<TContext> => {
  const finalConfig = { ...defaultConfig, ...config };

  return {
    async requestDidStart(
      _requestContext: GraphQLRequestContext<TContext>
    ): Promise<GraphQLRequestListener<TContext>> {
      return {
        async didResolveOperation(requestContext) {
          // Skip introspection queries if configured
          if (
            !finalConfig.includeIntrospection &&
            requestContext.request.operationName === 'IntrospectionQuery'
          ) {
            return;
          }

          try {
            // Calculate query complexity
            const complexity = getComplexity({
              schema,
              query: requestContext.document,
              variables: requestContext.request.variables || {},
              estimators: [
                directiveEstimator({ name: 'complexity' }),
                fieldExtensionsEstimator(),
                simpleEstimator({
                  defaultComplexity: 1,
                }),
              ],
            });

            // Check if complexity exceeds maximum
            if (complexity > finalConfig.maximumComplexity) {
              if (finalConfig.logRejectedQueries) {
                logError(new Error('Query rejected due to complexity'), {
                  complexity,
                  maximum: finalConfig.maximumComplexity,
                  query: requestContext.request.query,
                  operationName: requestContext.request.operationName,
                });
              }

              // Call rejection callback
              finalConfig.onQueryRejected(complexity, requestContext.request.query || '');

              // Throw error to reject query
              throw new QueryComplexityError(
                finalConfig.customErrorMessage(complexity, finalConfig.maximumComplexity),
                complexity,
                finalConfig.maximumComplexity
              );
            }

            // Add complexity to context for logging/monitoring
            (requestContext as { queryComplexity?: number }).queryComplexity = complexity;
          } catch (error) {
            // Re-throw QueryComplexityError
            if (error instanceof QueryComplexityError) {
              throw error;
            }

            // Log other errors but don't reject query
            logError(error as Error, {
              operation: 'complexity-calculation',
              query: requestContext.request.query,
            });
          }
        },

        async willSendResponse(requestContext) {
          // Add complexity to response extensions if available
          const complexity = (requestContext as { queryComplexity?: number }).queryComplexity;
          if (complexity && requestContext.response.extensions) {
            requestContext.response.extensions.complexity = complexity;
          }
        },
      };
    },
  };
};

/**
 * Helper to add complexity to schema type definitions
 */
export const addComplexityToSchema = (typeDefs: string): string => {
  // Add complexity directive definition if not present
  const directiveDefinition = `
directive @complexity(
  value: Int
  multipliers: [String!]
) on FIELD_DEFINITION
`;

  // Check if directive already exists
  if (!typeDefs.includes('@complexity')) {
    return directiveDefinition + typeDefs;
  }

  return typeDefs;
};

/**
 * Example type definitions with complexity directives
 */
export const exampleComplexitySchema = `
  # Simple field with fixed complexity
  type User {
    id: ID! @complexity(value: 1)
    username: String! @complexity(value: 1)
    email: String! @complexity(value: 1)

    # List field with multiplier
    posts(first: Int = 10): [Post!]! @complexity(value: 1, multipliers: ["first"])

    # Expensive computed field
    statistics: UserStatistics! @complexity(value: 50)
  }

  type Query {
    # Simple lookup
    user(id: ID!): User @complexity(value: 1)

    # List with pagination
    users(first: Int = 20): [User!]! @complexity(value: 1, multipliers: ["first"])

    # Search is more expensive
    searchUsers(query: String!, limit: Int = 10): [User!]! @complexity(value: 5, multipliers: ["limit"])
  }

  type Mutation {
    # Mutations have higher base cost
    createUser(input: CreateUserInput!): User! @complexity(value: 10)

    # Bulk operations multiply by array size
    bulkCreateUsers(users: [CreateUserInput!]!): [User!]! @complexity(value: 10, multipliers: ["users"])
  }
`;

/**
 * Calculate estimated complexity for a query string
 */
export const estimateQueryComplexity = (
  schema: GraphQLSchema,
  query: string,
  variables: Record<string, unknown> = {},
  _config: QueryComplexityConfig = {}
): number => {
  // const _finalConfig = { ...defaultConfig, ...config };

  try {
    const parsedQuery = typeof query === 'string' ? parseQuery(query) : query;
    return getComplexity({
      schema,
      query: parsedQuery,
      variables,
      estimators: [
        directiveEstimator({ name: 'complexity' }),
        fieldExtensionsEstimator(),
        simpleEstimator({
          defaultComplexity: 1,
        }),
      ],
    });
  } catch (error) {
    logError(error as Error, {
      operation: 'estimate-complexity',
      query,
    });
    throw error;
  }
};

/**
 * Export everything
 */
export { depthLimit, QueryComplexityError };
export type { ValidationRule };
