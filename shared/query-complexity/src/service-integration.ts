/**
 * Example integration of query complexity analysis into GraphQL services
 */

import { ApolloServer } from '@apollo/server';
import { buildSubgraphSchema } from '@apollo/subgraph';
import type { GraphQLResolverMap } from '@apollo/subgraph/dist/schema-helper';
import { gql } from 'graphql-tag';
import {
  addComplexityToSchema,
  createComplexityValidationRules,
  createQueryComplexityPlugin,
  fieldComplexityConfig,
  type QueryComplexityConfig,
} from './index';

// Type definitions for GraphQL resolvers with complexity configuration
interface ResolverWithComplexity {
  [key: string]: unknown;
  complexity?:
    | number
    | (({
        args,
        childComplexity,
      }: {
        args: Record<string, unknown>;
        childComplexity: number;
      }) => number);
  multipliers?: string[];
}

interface ResolversMap {
  Query?: Record<string, ResolverWithComplexity>;
  Mutation?: Record<string, ResolverWithComplexity>;
  Subscription?: Record<string, ResolverWithComplexity>;
  [typeName: string]: Record<string, ResolverWithComplexity> | undefined;
}

/**
 * Example type definitions with complexity directives
 */
export const exampleTypeDefs = `
  ${addComplexityToSchema('')}
  
  type User @key(fields: "id") {
    id: ID! @complexity(value: 1)
    username: String! @complexity(value: 1)
    email: String! @complexity(value: 1)
    name: String! @complexity(value: 1)
    
    # List fields have higher complexity
    orders(first: Int = 20): [Order!]! @complexity(value: 1, multipliers: ["first"])
    posts(limit: Int = 10): [Post!]! @complexity(value: 2, multipliers: ["limit"])
    
    # Computed fields are expensive
    statistics: UserStatistics! @complexity(value: 50)
    recommendations: [Product!]! @complexity(value: 100)
  }
  
  type Product @key(fields: "id") {
    id: ID! @complexity(value: 1)
    name: String! @complexity(value: 1)
    price: Float! @complexity(value: 1)
    
    # Related data
    reviews(first: Int = 10): [Review!]! @complexity(value: 2, multipliers: ["first"])
    relatedProducts(limit: Int = 5): [Product!]! @complexity(value: 5, multipliers: ["limit"])
  }
  
  type Query {
    # Simple lookups
    user(id: ID!): User @complexity(value: 1)
    product(id: ID!): Product @complexity(value: 1)
    
    # Paginated lists
    users(first: Int = 20, after: String): UsersConnection! @complexity(value: 1, multipliers: ["first"])
    products(first: Int = 20, category: String): ProductsPage! @complexity(value: 2, multipliers: ["first"])
    
    # Search operations are expensive
    searchUsers(query: String!, limit: Int = 10): [User!]! @complexity(value: 10, multipliers: ["limit"])
    searchProducts(query: String!, filters: SearchFilters): [Product!]! @complexity(value: 20)
    
    # Analytics queries are very expensive
    analytics(dateRange: DateRange!): AnalyticsData! @complexity(value: 200)
  }
  
  type Mutation {
    # Simple mutations
    createUser(input: CreateUserInput!): User! @complexity(value: 10)
    updateUser(id: ID!, input: UpdateUserInput!): User! @complexity(value: 10)
    
    # Bulk operations multiply complexity
    bulkCreateUsers(users: [CreateUserInput!]!): [User!]! @complexity(value: 10, multipliers: ["users"])
    bulkUpdateStock(updates: [StockUpdate!]!): [Product!]! @complexity(value: 5, multipliers: ["updates"])
    
    # Complex operations
    processOrder(input: ProcessOrderInput!): Order! @complexity(value: 50)
    generateReport(type: ReportType!): Report! @complexity(value: 500)
  }
`;

/**
 * Example of adding field complexity programmatically
 */
export const addFieldComplexityToResolvers = (resolvers: ResolversMap): ResolversMap => {
  // Add complexity to Query fields
  if (resolvers.Query) {
    // Users query with pagination
    if (resolvers.Query.users) {
      resolvers.Query.users = {
        ...resolvers.Query.users,
        ...fieldComplexityConfig.connection(20),
      };
    }

    // Search operation
    if (resolvers.Query.searchProducts) {
      resolvers.Query.searchProducts = {
        ...resolvers.Query.searchProducts,
        ...fieldComplexityConfig.search(20),
      };
    }
  }

  // Add complexity to Mutation fields
  if (resolvers.Mutation) {
    // Bulk operations
    if (resolvers.Mutation.bulkUpdateStock) {
      resolvers.Mutation.bulkUpdateStock = {
        ...resolvers.Mutation.bulkUpdateStock,
        ...fieldComplexityConfig.mutation(5),
      };
    }
  }

  // Add complexity to type fields
  if (resolvers.User) {
    // Orders field with pagination
    if (resolvers.User.orders) {
      resolvers.User.orders = {
        ...resolvers.User.orders,
        ...fieldComplexityConfig.list(20),
      };
    }
  }

  return resolvers;
};

/**
 * Create Apollo Server with query complexity analysis
 */
export const createServerWithComplexityAnalysis = (
  typeDefs: string,
  resolvers: ResolversMap,
  complexityConfig?: QueryComplexityConfig
): ApolloServer => {
  // Build schema
  const schema = buildSubgraphSchema([
    {
      typeDefs: gql(addComplexityToSchema(typeDefs)),
      resolvers: addFieldComplexityToResolvers(resolvers) as GraphQLResolverMap<unknown>,
    },
  ]);

  // Create server with complexity plugin
  return new ApolloServer({
    schema,
    plugins: [createQueryComplexityPlugin(schema, complexityConfig)],
    validationRules: [...createComplexityValidationRules(schema, complexityConfig)],
  });
};

/**
 * Example configuration for different service types
 */
export const complexityConfigs = {
  // Gateway configuration - higher limits
  gateway: {
    maximumComplexity: 2000,
    maximumDepth: 15,
    logRejectedQueries: true,
    onQueryRejected: (complexity: number, query: string) => {
      console.error(`Gateway rejected query with complexity ${complexity}`, {
        query: query.substring(0, 200), // Log first 200 chars
      });
    },
  },

  // Service configuration - moderate limits
  service: {
    maximumComplexity: 1000,
    maximumDepth: 10,
    includeIntrospection: false,
  },

  // Public API configuration - strict limits
  publicApi: {
    maximumComplexity: 500,
    maximumDepth: 7,
    customErrorMessage: (complexity: number, maximum: number) =>
      `Query complexity ${complexity} exceeds maximum allowed complexity ${maximum}. ` +
      `Please simplify your query by requesting fewer fields or reducing nesting.`,
  },
};

/**
 * Example of complexity calculation for common patterns
 */
export const complexityExamples = {
  // Simple query - complexity: 3
  simple: `
    query GetUser {
      user(id: "123") {     # 1
        id                  # 1
        username            # 1
      }
    }
  `,

  // Paginated query - complexity: 1 + (20 * 3) = 61
  paginated: `
    query GetUsers {
      users(first: 20) {    # 1 * 20
        id                  # 1
        username            # 1
        email               # 1
      }
    }
  `,

  // Nested query - complexity: 1 + 2 + (10 * 3) = 33
  nested: `
    query GetUserWithOrders {
      user(id: "123") {     # 1
        id                  # 1
        orders(first: 10) { # 1 * 10
          id                # 1
          total             # 1
          status            # 1
        }
      }
    }
  `,

  // Complex query - complexity: very high
  complex: `
    query ComplexQuery {
      users(first: 50) {          # 1 * 50
        id                        # 1
        orders(first: 20) {       # 1 * 20
          id                      # 1
          items {                 # 1 * 10 (assumed)
            product {             # 1
              id                  # 1
              reviews(first: 5) { # 2 * 5
                id                # 1
                rating            # 1
              }
            }
          }
        }
      }
    }
  `,
};

/**
 * Type for Apollo Server request context with query complexity
 */
interface GraphQLRequestContextWithComplexity {
  queryComplexity?: number;
  response: {
    extensions?: Record<string, unknown>;
    [key: string]: unknown;
  };
  request: {
    operationName?: string | null;
    query?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Middleware to add complexity info to response
 */
export const complexityLoggingPlugin = () => ({
  async requestDidStart() {
    return {
      async willSendResponse(requestContext: GraphQLRequestContextWithComplexity) {
        const complexity = requestContext.queryComplexity;
        if (complexity) {
          // Add to response extensions
          if (!requestContext.response.extensions) {
            requestContext.response.extensions = {};
          }
          requestContext.response.extensions.queryComplexity = {
            score: complexity,
            timestamp: new Date().toISOString(),
          };

          // Log high complexity queries
          if (complexity > 500) {
            console.warn('High complexity query executed', {
              complexity,
              operationName: requestContext.request.operationName,
              query: requestContext.request.query?.substring(0, 200),
            });
          }
        }
      },
    };
  },
});

/**
 * Example usage in a service:
 *
 * ```typescript
 * import { createServerWithComplexityAnalysis, complexityConfigs } from '@graphql-microservices/shared-query-complexity/service-integration';
 *
 * const server = createServerWithComplexityAnalysis(
 *   typeDefs,
 *   resolvers,
 *   complexityConfigs.service
 * );
 *
 * // Or manually:
 * const server = new ApolloServer({
 *   schema,
 *   plugins: [
 *     createQueryComplexityPlugin(schema, {
 *       maximumComplexity: 1000,
 *       maximumDepth: 10,
 *       onQueryRejected: (complexity, query) => {
 *         metrics.recordCounter('graphql.query.rejected', 1, { complexity });
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
