import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  type AuthContext,
  AuthService,
  extractAndVerifyUser,
} from '@graphql-microservices/shared-auth';
import { CacheService } from '@graphql-microservices/shared-cache';
import { parseEnv, productServiceEnvSchema } from '@graphql-microservices/shared-config';
import {
  AuthenticationError,
  BusinessRuleError,
  createErrorLogger,
  formatError,
  InternalServerError,
  NotFoundError,
  toGraphQLError,
  ValidationError,
} from '@graphql-microservices/shared-errors';
import { PubSubService } from '@graphql-microservices/shared-pubsub';
import {
  bulkUpdateStockInputSchema,
  createProductInputSchema,
  updateProductInputSchema,
  validateInput,
} from '@graphql-microservices/validation';
import DataLoader from 'dataloader';
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
import {
  createProductCommand,
  deactivateProductCommand,
  reactivateProductCommand,
  updateProductCommand,
  updateProductStockCommand,
} from './application/commands';
import { ProductEventDispatcher } from './application/event-handlers';
import {
  getAllProductsQuery,
  getProductByIdQuery,
  getProductBySkuQuery,
  getProductsByIdsQuery,
  searchProductsQuery,
} from './application/queries';
import {
  type GetAllProductsResult,
  type GetProductByIdResult,
  type GetProductBySkuResult,
  type GetProductsByIdsResult,
  type SearchProductsResult,
  extractQueryData,
  isSuccessResult,
} from './application/query-result-types';
import {
  extractAggregateId,
} from './application/command-result-types';
import { CQRSInfrastructure } from './infrastructure/cqrs-integration';
import { RedisEventSubscriber } from './infrastructure/redis-event-subscriber';
import { subscriptionResolvers } from './subscriptions';

// Parse and validate environment variables
const env = parseEnv(productServiceEnvSchema);

// Initialize services
const prisma = new PrismaClient();
const cacheService = new CacheService(env.REDIS_URL || 'redis://localhost:6379');
const pubSubService = new PubSubService({ redisUrl: env.REDIS_URL });
const pubsub = pubSubService.getPubSub();

// Initialize CQRS infrastructure
const cqrsInfrastructure = new CQRSInfrastructure(
  {
    databaseUrl: env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/products_db',
    redisUrl: env.REDIS_URL || 'redis://localhost:6379',
    enableSnapshots: true,
    snapshotFrequency: 50,
  },
  prisma,
  cacheService
);

// Initialize event handling
const eventDispatcher = new ProductEventDispatcher(prisma, cacheService, pubSubService);
const eventSubscriber = new RedisEventSubscriber(env.REDIS_URL || 'redis://localhost:6379', eventDispatcher);

// Get command and query buses
const commandBus = cqrsInfrastructure.getCommandBus();
const queryBus = cqrsInfrastructure.getQueryBus();

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

// Create error logger for this service
const logError = createErrorLogger('products-service');

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

  type ProductsPage {
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
    ): ProductsPage!
    categories: [String!]!
    searchProducts(query: String!, limit: Int = 10): [Product!]!
  }

  type Mutation {
    createProduct(input: CreateProductInput!): Product!
    updateProduct(id: ID!, input: UpdateProductInput!): Product!
    updateStock(id: ID!, quantity: Int!): Product!
    deactivateProduct(id: ID!): Product!
    activateProduct(id: ID!): Product!
    bulkUpdateStock(updates: [StockUpdate!]!): [Product!]!
  }

  type Subscription {
    productCreated: Product!
    productUpdated(productId: ID): Product!
    productStockChanged(productId: ID): Product!
    productDeactivated: Product!
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

// Helper to transform product view model to GraphQL format
function transformToGraphQLProduct(product: { 
  id: string;
  name: string;
  description: string;
  price: { amount: number; currency: string };
  stock: number;
  sku: string;
  category: string;
  tags: string[];
  imageUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): GraphQLProduct {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price.amount,
    stock: product.stock,
    sku: product.sku,
    category: product.category,
    tags: product.tags,
    imageUrl: product.imageUrl,
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

// DataLoader for batch loading products
const createProductLoader = () =>
  new DataLoader<string, GraphQLProduct | null>(async (ids) => {
    // Use query bus to fetch products
    const query = getProductsByIdsQuery(ids as string[]);
    const result = await queryBus.execute(query) as GetProductsByIdsResult;

    if (!isSuccessResult(result)) {
      return ids.map(() => null);
    }

    const productMap = new Map(
      result.data.map((item) => [
        item.id,
        transformToGraphQLProduct(item),
      ])
    );

    return ids.map((id) => productMap.get(id) || null);
  });

// Context type
export interface Context extends AuthContext {
  prisma: PrismaClient;
  cacheService: CacheService;
  pubsub: typeof pubsub;
  productLoader: DataLoader<string, GraphQLProduct | null>;
  commandBus: typeof commandBus;
  queryBus: typeof queryBus;
}

// Resolvers
const resolvers: Resolvers<Context> = {
  Query: {
    product: async (_, { id }: QueryProductArgs, context: Context) => {
      try {
        // Use query bus to fetch product
        const query = getProductByIdQuery(id);
        const result = await context.queryBus.execute(query) as GetProductByIdResult;

        if (!isSuccessResult(result) || !result.data) {
          return null;
        }

        return transformToGraphQLProduct(result.data);
      } catch (error) {
        logError(error, { operation: 'product', productId: id });
        throw toGraphQLError(error, 'Failed to fetch product');
      }
    },

    productBySku: async (_, { sku }: QueryProductBySkuArgs, context: Context) => {
      try {
        // Use query bus to fetch product by SKU
        const query = getProductBySkuQuery(sku);
        const result = await context.queryBus.execute(query) as GetProductBySkuResult;

        if (!isSuccessResult(result) || !result.data) {
          return null;
        }

        return transformToGraphQLProduct(result.data);
      } catch (error) {
        logError(error, { operation: 'productBySku', sku });
        throw toGraphQLError(error, 'Failed to fetch product by SKU');
      }
    },

    products: async (_, args: QueryProductsArgs, context: Context) => {
      try {
        const { first = 20, after, category, tags, isActive, search } = args;

        // Validate pagination
        if (first && first > 100) {
          throw new ValidationError('Cannot request more than 100 products at once', [
            { field: 'first', message: 'Maximum value is 100' },
          ]);
        }

        // Build filter
        const filter: {
          category?: string;
          tags?: string[];
          isActive?: boolean;
          inStock?: boolean;
          priceMin?: number;
          priceMax?: number;
        } = {};

        if (category) filter.category = category;
        if (tags && tags.length > 0) filter.tags = tags;
        if (isActive !== null && isActive !== undefined) filter.isActive = isActive;

        // Build pagination
        const pagination = {
          offset: after ? 1 : 0, // Simple cursor implementation - would need to be improved
          limit: first || 20,
        };

        // Handle search separately
        let result: GetAllProductsResult | SearchProductsResult;
        if (search) {
          // Use search query
          const searchQuery = searchProductsQuery(
            search,
            ['name', 'description'],
            filter,
            pagination
          );
          result = await context.queryBus.execute(searchQuery) as SearchProductsResult;
        } else {
          // Use get all products query
          const query = getAllProductsQuery(
            filter,
            pagination,
            { field: 'createdAt', direction: 'DESC' }
          );
          result = await context.queryBus.execute(query) as GetAllProductsResult;
        }

        const data = extractQueryData(result, 'Failed to fetch products');

        // Transform to GraphQL format
        const products = data.items.map(transformToGraphQLProduct);

        return {
          products,
          totalCount: data.totalCount,
          pageInfo: {
            hasNextPage: data.hasMore,
            hasPreviousPage: pagination.offset > 0,
            startCursor: products[0]?.id,
            endCursor: products[products.length - 1]?.id,
          },
        };
      } catch (error) {
        logError(error, { operation: 'products', args });
        throw toGraphQLError(error, 'Failed to fetch products');
      }
    },

    categories: async (_, __, context: Context) => {
      try {
        const result = await context.prisma.product.findMany({
          select: { category: true },
          distinct: ['category'],
          orderBy: { category: 'asc' },
        });
        return result.map((r) => r.category);
      } catch (error) {
        logError(error, { operation: 'categories' });
        throw toGraphQLError(error, 'Failed to fetch categories');
      }
    },

    searchProducts: async (_, { query, limit = 10 }: QuerySearchProductsArgs, context: Context) => {
      try {
        // Validate search query
        if (!query || query.trim().length === 0) {
          throw new ValidationError('Search query is required', [
            { field: 'query', message: 'Query cannot be empty' },
          ]);
        }

        if (limit && limit > 50) {
          throw new ValidationError('Search limit too high', [
            { field: 'limit', message: 'Maximum limit is 50' },
          ]);
        }

        // Use search query
        const searchQuery = searchProductsQuery(
          query,
          ['name', 'description', 'sku'],
          { isActive: true },
          { offset: 0, limit: limit || 10 }
        );

        const result = await context.queryBus.execute(searchQuery) as SearchProductsResult;
        const data = extractQueryData(result, 'Failed to search products');

        // Transform to GraphQL format
        return data.items.map(transformToGraphQLProduct);
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logError(error, { operation: 'searchProducts', query, limit });
        throw toGraphQLError(error, 'Failed to search products');
      }
    },
  },

  Mutation: {
    createProduct: async (_, { input }: MutationCreateProductArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      try {
        // Validate input
        const validatedInput = validateInput(createProductInputSchema, input);

        // Create command with new product ID
        const productId = `product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const command = createProductCommand(productId, {
          name: validatedInput.name,
          description: validatedInput.description,
          price: { amount: validatedInput.price, currency: 'USD' },
          initialStock: validatedInput.stock,
          sku: validatedInput.sku,
          category: validatedInput.category,
          tags: validatedInput.tags || [],
          imageUrl: validatedInput.imageUrl || undefined,
        });

        // Execute command
        const result = await context.commandBus.execute(command);

        if (!result.success) {
          // Handle specific errors
          if (result.error?.includes('SKU already exists')) {
            throw new ValidationError('Product with this SKU already exists', [
              { field: 'sku', message: `SKU '${validatedInput.sku}' is already in use` },
            ]);
          }
          throw new Error(result.error || 'Failed to create product');
        }

        const aggregateId = extractAggregateId(result, 'Product created but no ID returned');

        // Get the created product
        const getQuery = getProductByIdQuery(aggregateId);
        const queryResult = await context.queryBus.execute(getQuery) as GetProductByIdResult;
        const productData = extractQueryData(queryResult, 'Product created but could not be retrieved');

        if (!productData) {
          throw new InternalServerError('Product created but data is null');
        }

        return transformToGraphQLProduct(productData);
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logError(error, { operation: 'createProduct', input });
        throw new InternalServerError('Failed to create product');
      }
    },

    updateProduct: async (_, { id, input }: MutationUpdateProductArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      try {
        // Validate input
        const validatedInput = validateInput(updateProductInputSchema, input);

        // Create command
        const command = updateProductCommand(id, {
          name: validatedInput.name,
          description: validatedInput.description,
          imageUrl: validatedInput.imageUrl || undefined,
          tags: validatedInput.tags,
        });

        // Execute command
        const result = await context.commandBus.execute(command);

        if (!result.success) {
          if (result.error?.includes('Product not found')) {
            throw new NotFoundError('Product', id);
          }
          throw new Error(result.error || 'Failed to update product');
        }

        // Get the updated product
        const getQuery = getProductByIdQuery(id);
        const queryResult = await context.queryBus.execute(getQuery) as GetProductByIdResult;
        const productData = extractQueryData(queryResult, 'Product updated but could not be retrieved');

        if (!productData) {
          throw new InternalServerError('Product updated but data is null');
        }

        return transformToGraphQLProduct(productData);
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logError(error, { operation: 'updateProduct', productId: id, input });
        throw new InternalServerError('Failed to update product');
      }
    },

    updateStock: async (_, { id, quantity }: MutationUpdateStockArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      try {
        // Validate quantity
        if (quantity < 0) {
          throw new ValidationError('Stock quantity cannot be negative', [
            { field: 'quantity', message: 'Quantity must be 0 or greater' },
          ]);
        }

        // Create command
        const command = updateProductStockCommand(id, {
          newStock: quantity,
          changeType: 'adjustment',
          reason: 'Manual stock update',
          changedBy: context.user.userId,
        });

        // Execute command
        const result = await context.commandBus.execute(command);

        if (!result.success) {
          if (result.error?.includes('Product not found')) {
            throw new NotFoundError('Product', id);
          }
          throw new Error(result.error || 'Failed to update product stock');
        }

        // Get the updated product
        const getQuery = getProductByIdQuery(id);
        const queryResult = await context.queryBus.execute(getQuery) as GetProductByIdResult;
        const productData = extractQueryData(queryResult, 'Product stock updated but could not be retrieved');

        if (!productData) {
          throw new InternalServerError('Product stock updated but data is null');
        }

        return transformToGraphQLProduct(productData);
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logError(error, { operation: 'updateStock', productId: id, quantity });
        throw new InternalServerError('Failed to update product stock');
      }
    },

    deactivateProduct: async (_, { id }: MutationDeactivateProductArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      try {
        // Create command
        const command = deactivateProductCommand(id, {
          reason: 'Manual deactivation',
          deactivatedBy: context.user.userId,
        });

        // Execute command
        const result = await context.commandBus.execute(command);

        if (!result.success) {
          if (result.error?.includes('Product not found')) {
            throw new NotFoundError('Product', id);
          }
          if (result.error?.includes('already deactivated')) {
            throw new BusinessRuleError('Product is already deactivated');
          }
          throw new Error(result.error || 'Failed to deactivate product');
        }

        // Get the updated product
        const getQuery = getProductByIdQuery(id);
        const queryResult = await context.queryBus.execute(getQuery) as GetProductByIdResult;
        const productData = extractQueryData(queryResult, 'Product deactivated but could not be retrieved');

        if (!productData) {
          throw new InternalServerError('Product deactivated but data is null');
        }

        return transformToGraphQLProduct(productData);
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logError(error, { operation: 'deactivateProduct', productId: id });
        throw new InternalServerError('Failed to deactivate product');
      }
    },

    activateProduct: async (_, { id }: MutationActivateProductArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      try {
        // Create command
        const command = reactivateProductCommand(id, {
          reason: 'Manual reactivation',
          reactivatedBy: context.user.userId,
        });

        // Execute command
        const result = await context.commandBus.execute(command);

        if (!result.success) {
          if (result.error?.includes('Product not found')) {
            throw new NotFoundError('Product', id);
          }
          if (result.error?.includes('already active')) {
            throw new BusinessRuleError('Product is already active');
          }
          throw new Error(result.error || 'Failed to activate product');
        }

        // Get the updated product
        const getQuery = getProductByIdQuery(id);
        const queryResult = await context.queryBus.execute(getQuery) as GetProductByIdResult;
        const productData = extractQueryData(queryResult, 'Product activated but could not be retrieved');

        if (!productData) {
          throw new InternalServerError('Product activated but data is null');
        }

        return transformToGraphQLProduct(productData);
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logError(error, { operation: 'activateProduct', productId: id });
        throw new InternalServerError('Failed to activate product');
      }
    },

    bulkUpdateStock: async (_, { updates }: MutationBulkUpdateStockArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      try {
        // Validate input
        const validatedInput = validateInput(bulkUpdateStockInputSchema, { updates });

        // Validate quantities
        const invalidUpdates = validatedInput.updates.filter((u) => u.quantity < 0);
        if (invalidUpdates.length > 0) {
          throw new ValidationError(
            'Invalid stock quantities',
            invalidUpdates.map((u) => ({
              field: 'quantity',
              message: `Product ${u.productId} cannot have negative stock`,
              value: u.quantity,
            }))
          );
        }

        // Execute stock update commands in parallel
        const commandResults = await Promise.all(
          validatedInput.updates.map(({ productId, quantity }) => {
            const command = updateProductStockCommand(productId, {
              newStock: quantity,
              changeType: 'adjustment',
              reason: 'Bulk stock update',
              changedBy: context.user?.userId || 'system',
            });
            return context.commandBus.execute(command).then((result) => ({
              productId,
              result,
            }));
          })
        );

        // Check for failures
        const failures = commandResults.filter(({ result }) => !result.success);
        if (failures.length > 0) {
          const missingIds = failures
            .filter(({ result }) => result.error?.includes('Product not found'))
            .map(({ productId }) => productId);

          if (missingIds.length > 0) {
            throw new ValidationError('Some products not found', [
              { field: 'updates', message: `Products not found: ${missingIds.join(', ')}` },
            ]);
          }

          throw new Error(
            `Failed to update some products: ${failures.map(({ result }) => result.error).join(', ')}`
          );
        }

        // Fetch all updated products
        const productIds = validatedInput.updates.map((u) => u.productId);
        const getQuery = getProductsByIdsQuery(productIds);
        const queryResult = await context.queryBus.execute(getQuery) as GetProductsByIdsResult;
        const productsData = extractQueryData(queryResult, 'Products updated but could not be retrieved');

        // Transform to GraphQL format
        return productsData.map(transformToGraphQLProduct);
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logError(error, { operation: 'bulkUpdateStock', updates });
        throw new InternalServerError('Failed to bulk update product stock');
      }
    },
  },

  Product: {
    __resolveReference: async (product: { id: string }, context: Context) => {
      try {
        return await context.productLoader.load(product.id);
      } catch (error) {
        logError(error, { operation: '__resolveReference', productId: product.id });
        throw toGraphQLError(error, 'Failed to resolve product reference');
      }
    },
  } as Resolvers<Context>['Product'],

  ...subscriptionResolvers,
};

// Create Apollo Server with error formatting
const server = new ApolloServer({
  schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
  formatError: (formattedError) => {
    return formatError(
      formattedError as GraphQLError,
      env.NODE_ENV === 'development',
      'products-service'
    );
  },
});

// Initialize CQRS infrastructure
await cqrsInfrastructure.initialize();

// Initialize event subscriber
await eventSubscriber.start();

// Start server
const { url } = await startStandaloneServer(server, {
  listen: { port: env.PORT },
  context: async ({ req }) => {
    const productLoader = createProductLoader();

    // Extract and verify user from authorization header
    const user = await extractAndVerifyUser(authService, req.headers.authorization);

    return {
      prisma,
      cacheService,
      pubsub,
      productLoader,
      user,
      isAuthenticated: !!user,
      commandBus,
      queryBus,
    };
  },
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down Products service...');

  // Stop event subscriber
  await eventSubscriber.stop();

  // Shutdown CQRS infrastructure
  await cqrsInfrastructure.shutdown();

  // Disconnect services
  await prisma.$disconnect();
  await cacheService.disconnect();
  await pubSubService.disconnect();

  process.exit(0);
});

console.log(`🚀 Products service ready at ${url}`);
