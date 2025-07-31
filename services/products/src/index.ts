import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { parseEnv, productServiceEnvSchema } from '@graphql-microservices/config';
import {
  type AuthContext,
  AuthService,
  extractAndVerifyUser,
} from '@graphql-microservices/shared-auth';
import { CacheService } from '@graphql-microservices/shared-cache';
import { AuthenticationError, formatError } from '@graphql-microservices/shared-errors';
import { PubSubService } from '@graphql-microservices/shared-pubsub';
import { GraphQLError } from 'graphql';
import gql from 'graphql-tag';
import type {
  Product as GraphQLProduct,
  MutationActivateProductArgs,
  MutationBulkUpdateStockArgs,
  MutationCreateProductArgs,
  MutationDeactivateProductArgs,
  MutationUpdateProductArgs,
  MutationUpdateStockArgs,
  QueryProductArgs,
  QueryProductBySkuArgs,
  QueryProductsArgs,
  QuerySearchProductsArgs,
  Resolvers,
} from '../generated/graphql';
import { PrismaClient } from '../generated/prisma';
import { ProductService } from './application/product-service';
  import { isOk, isErr, wrap, type Result } from '@graphql-microservices/shared-type-utils';
import { subscriptionResolvers } from './subscriptions';

// Parse and validate environment variables
const env = parseEnv(productServiceEnvSchema);

// Initialize services
const prisma = new PrismaClient();
const cacheService = new CacheService(env.REDIS_URL || 'redis://localhost:6379');
const pubSubService = new PubSubService({ redisUrl: env.REDIS_URL });

// Initialize product service
const productService = new ProductService(prisma, cacheService, pubSubService);

// Initialize auth service with same keys as users service
const jwtKeyPair = AuthService.loadKeyPairFromEnv(
  'JWT_ACCESS_PRIVATE_KEY',
  'JWT_ACCESS_PUBLIC_KEY'
);
const refreshKeyPair = AuthService.loadKeyPairFromEnv(
  'JWT_REFRESH_PRIVATE_KEY',
  'JWT_REFRESH_PUBLIC_KEY'
);

const authService = new AuthService(jwtKeyPair, refreshKeyPair, {
  algorithm: 'RS256' as const,
});

// GraphQL schema
const typeDefs = gql`
  extend schema @link(
    url: "https://specs.apollo.dev/federation/v2.0", 
    import: ["@key", "@shareable"]
  )

  type Product @key(fields: "id") {
    id: ID!
    name: String!
    description: String!
    price: Float!
    stock: Int!
    sku: String!
    category: String!
    tags: [String!]!
    imageUrl: String
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type ProductConnection {
    products: [Product!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }

  type PageInfo @shareable {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type Query {
    product(id: ID!): Product
    productBySku(sku: String!): Product
    products(
      first: Int
      after: String
      category: String
      tags: [String!]
      isActive: Boolean
      search: String
    ): ProductConnection!
    searchProducts(query: String!, limit: Int): [Product!]!
    categories: [String!]!
  }

  type Mutation {
    createProduct(input: CreateProductInput!): Product!
    updateProduct(id: ID!, input: UpdateProductInput!): Product!
    updateStock(id: ID!, quantity: Int!): Product!
    bulkUpdateStock(updates: [StockUpdate!]!): [Product!]!
    activateProduct(id: ID!): Product!
    deactivateProduct(id: ID!, reason: String!): Product!
  }

  type Subscription {
    productCreated: Product!
    productUpdated(productId: ID): Product!
    productStockChanged(productId: ID): ProductStockChangedEvent!
    productDeactivated: ProductDeactivatedEvent!
  }

  type ProductStockChangedEvent {
    product: Product!
    previousStock: Int!
    newStock: Int!
    changeReason: String
  }

  type ProductDeactivatedEvent {
    product: Product!
    reason: String!
    deactivatedBy: String!
  }

  input CreateProductInput {
    name: String!
    description: String!
    price: Float!
    stock: Int!
    sku: String!
    category: String!
    tags: [String!]
    imageUrl: String
  }

  input UpdateProductInput {
    name: String
    description: String
    price: Float
    stock: Int
    category: String
    tags: [String!]
    imageUrl: String
  }

  input StockUpdate {
    productId: ID!
    quantity: Int!
  }
`;

// Helper function to transform view model to GraphQL format
const transformToGraphQL = (product: any): GraphQLProduct => ({
  ...product,
  createdAt:
    product.createdAt instanceof Date ? product.createdAt.toISOString() : product.createdAt,
  updatedAt:
    product.updatedAt instanceof Date ? product.updatedAt.toISOString() : product.updatedAt,
  price: Number(product.price),
});

// Context type
export interface Context extends AuthContext {
  productService: ProductService;
}

// Helper to handle service errors
function handleServiceError(result: Result<unknown, { code: string; message: string; details: unknown } >): never {
  if (!isErr(result)) {
    throw new Error('Expected error result');
  }

  const { code, message, details } = wrap(result).unwrapErr();

  switch (code) {
    case 'VALIDATION':
      throw new GraphQLError(message, {
        extensions: { code: 'BAD_USER_INPUT', details },
      });
    case 'NOT_FOUND':
      throw new GraphQLError(message, {
        extensions: { code: 'NOT_FOUND', details },
      });
    case 'CONFLICT':
      throw new GraphQLError(message, {
        extensions: { code: 'CONFLICT', details },
      });
    case 'INSUFFICIENT_STOCK':
      throw new GraphQLError(message, {
        extensions: { code: 'INSUFFICIENT_STOCK', details },
      });
    default:
      throw new GraphQLError(message || 'Internal server error', {
        extensions: { code: 'INTERNAL_SERVER_ERROR', details },
      });
  }
}

// Resolvers
const resolvers: Resolvers<Context> = {
  Query: {
    product: async (_, { id }: QueryProductArgs, context: Context) => {
      const result = await context.productService.getProductById(id);

      if (isErr(result)) {
        handleServiceError(result);
      }

      return result.value ? transformToGraphQL(result.value) : null;
    },

    productBySku: async (_, { sku }: QueryProductBySkuArgs, context: Context) => {
      const result = await context.productService.getProductBySku(sku);

      if (isErr(result)) {
        handleServiceError(result);
      }

      return result.value ? transformToGraphQL(result.value) : null;
    },

    products: async (_, args: QueryProductsArgs, context: Context) => {
      const { first = 20, after, category, tags, isActive, search } = args;

      const filter = {
        category,
        tags,
        isActive,
      };

      const pagination = {
        limit: first,
        offset: after ? parseInt(Buffer.from(after, 'base64').toString()) : 0,
      };

      const result = search
        ? await context.productService.searchProducts(search, filter, pagination)
        : await context.productService.getAllProducts(filter, pagination);

      if (isErr(result)) {
        handleServiceError(result);
      }

      const { items, totalCount, hasNextPage, hasPreviousPage } = result.value;
      const nodes = items.map(transformToGraphQL);

      return {
        products: nodes,
        totalCount,
        pageInfo: {
          hasNextPage,
          hasPreviousPage,
          startCursor: nodes[0]?.id,
          endCursor: nodes[nodes.length - 1]?.id,
        },
      };
    },

    categories: async (_, __, _context: Context) => {
      // For now, return a static list. Could enhance ProductService to support this.
      const categories = ['Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports'];
      return categories;
    },

    searchProducts: async (_, { query, limit = 10 }: QuerySearchProductsArgs, context: Context) => {
      const result = await context.productService.searchProducts(
        query,
        { isActive: true },
        { limit, offset: 0 }
      );

      if (isErr(result)) {
        handleServiceError(result);
      }

      return result.value.items.map(transformToGraphQL);
    },
  },

  Mutation: {
    createProduct: async (_, { input }: MutationCreateProductArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      const result = await context.productService.createProduct(input, {
        userId: context.user.id,
        timestamp: new Date(),
      });

      if (isErr(result)) {
        handleServiceError(result);
      }

      return transformToGraphQL(result.value);
    },

    updateProduct: async (_, { id, input }: MutationUpdateProductArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      const result = await context.productService.updateProduct(id, input, {
        userId: context.user.id,
        timestamp: new Date(),
      });

      if (isErr(result)) {
        handleServiceError(result);
      }

      return transformToGraphQL(result.value);
    },

    updateStock: async (_, { id, quantity }: MutationUpdateStockArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      const result = await context.productService.updateProductStock(
        id,
        quantity,
        `Stock updated by ${context.user.username}`,
        {
          userId: context.user.id,
          timestamp: new Date(),
        }
      );

      if (isErr(result)) {
        handleServiceError(result);
      }

      return transformToGraphQL(result.value);
    },

    bulkUpdateStock: async (_, { updates }: MutationBulkUpdateStockArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      const updateData = updates.map((u) => ({
        productId: u.productId,
        stock: u.quantity,
      }));

      const result = await context.productService.bulkUpdateStock(
        updateData,
        `Bulk update by ${context.user.username}`,
        {
          userId: context.user.id,
          timestamp: new Date(),
        }
      );

      if (isErr(result)) {
        handleServiceError(result);
      }

      // Get updated products
      const productIds = result.value.filter((r) => r.success).map((r) => r.productId);

      const products = [];
      for (const productId of productIds) {
        const productResult = await context.productService.getProductById(productId);
        if (isOk(productResult) && productResult.value) {
          products.push(transformToGraphQL(productResult.value));
        }
      }

      return products;
    },

    activateProduct: async (_, { id }: MutationActivateProductArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      const result = await context.productService.activateProduct(
        id,
        context.user.username,
        undefined,
        {
          userId: context.user.id,
          timestamp: new Date(),
        }
      );

      if (isErr(result)) {
        handleServiceError(result);
      }

      return transformToGraphQL(result.value);
    },

    deactivateProduct: async (
      _,
      { id, reason }: MutationDeactivateProductArgs,
      context: Context
    ) => {
      if (!context.user) throw new AuthenticationError();

      const result = await context.productService.deactivateProduct(
        id,
        context.user.username,
        reason,
        {
          userId: context.user.id,
          timestamp: new Date(),
        }
      );

      if (isErr(result)) {
        handleServiceError(result);
      }

      return transformToGraphQL(result.value);
    },
  },

  Subscription: subscriptionResolvers,

  Product: {
    __resolveReference: async (reference: { id: string }, context: Context) => {
      const result = await context.productService.getProductById(reference.id);

      if (isErr(result) || !result.value) {
        return null;
      }

      return transformToGraphQL(result.value);
    },
  },
};

// Create Apollo Server
const server = new ApolloServer<Context>({
  schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
  formatError,
  introspection: env.NODE_ENV !== 'production',
});

// Start server
(async () => {
  const { url } = await startStandaloneServer(server, {
    listen: { port: env.PORT || 4002 },
    context: async ({ req }): Promise<Context> => {
      const authService = new AuthService(env.JWT_KEYS, env.REFRESH_JWT_KEYS);
      const user = await extractAndVerifyUser(authService, req.headers.authorization);
      return {
        user,
        productService,
      };
    },
  });

  console.log(`🚀 Products service ready at ${url}`);
})();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await server.stop();
  await prisma.$disconnect();
  await cacheService.disconnect();
  await pubSubService.close();
  process.exit(0);
});
