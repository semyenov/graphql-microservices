import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { AuthService, extractAndVerifyUser, type AuthContext } from '@graphql-microservices/shared-auth';
import { CacheService, cacheKeys, cacheTTL } from '@graphql-microservices/shared-cache';
import { parseEnv, productServiceEnvSchema } from '@graphql-microservices/shared-config';
import {
  AuthenticationError,
  InternalServerError,
  createErrorLogger,
  formatError,
} from '@graphql-microservices/shared-errors';
import { PubSubService } from '@graphql-microservices/shared-pubsub';
import DataLoader from 'dataloader';
import { GraphQLError } from 'graphql';
import gql from 'graphql-tag';
import { type Prisma, PrismaClient, type Product } from '../generated/prisma';
import type {
  Resolvers,
  Product as GraphQLProduct,
  QueryProductArgs,
  QueryProductBySkuArgs,
  QueryProductsArgs,
  QuerySearchProductsArgs,
  MutationCreateProductArgs,
  MutationUpdateProductArgs,
  MutationUpdateStockArgs,
  MutationActivateProductArgs,
  MutationDeactivateProductArgs,
  MutationBulkUpdateStockArgs,
} from '../generated/graphql';
import {
  subscriptionResolvers,
  publishProductCreated,
  publishProductUpdated,
  publishProductStockChanged,
  publishProductDeactivated,
} from './subscriptions';

// Parse and validate environment variables
const env = parseEnv(productServiceEnvSchema);

// Initialize services
const prisma = new PrismaClient();
const cacheService = new CacheService(env.REDIS_URL || 'redis://localhost:6379');
const pubSubService = new PubSubService({ redisUrl: env.REDIS_URL });
const pubsub = pubSubService.getPubSub();

// Initialize auth service with same keys as users service
const jwtKeyPair = AuthService.loadKeyPairFromEnv('JWT_ACCESS_PRIVATE_KEY', 'JWT_ACCESS_PUBLIC_KEY');
const refreshKeyPair = AuthService.loadKeyPairFromEnv('JWT_REFRESH_PRIVATE_KEY', 'JWT_REFRESH_PUBLIC_KEY');

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

// Helper function to transform Prisma product to GraphQL format
const transformProduct = (product: Product): GraphQLProduct => ({
  ...product,
  createdAt:
    product.createdAt instanceof Date ? product.createdAt.toISOString() : product.createdAt,
  updatedAt:
    product.updatedAt instanceof Date ? product.updatedAt.toISOString() : product.updatedAt,
  price: Number(product.price),
});

// DataLoader for batch loading products
const createProductLoader = () =>
  new DataLoader<string, GraphQLProduct | null>(async (ids) => {
    const products = await prisma.product.findMany({
      where: { id: { in: ids as string[] } },
    });
    const productMap = new Map(products.map((product) => [product.id, transformProduct(product)]));
    return ids.map((id) => productMap.get(id) || null);
  });

// Context type
export interface Context extends AuthContext {
  prisma: PrismaClient;
  cacheService: CacheService;
  pubsub: typeof pubsub;
  productLoader: DataLoader<string, GraphQLProduct | null>;
}

// Helper function to clear product caches
async function clearProductCaches(product: Product, cacheService: CacheService) {
  await Promise.all([
    cacheService.delete(cacheKeys.product(product.id)),
    cacheService.delete(cacheKeys.productBySku(product.sku)),
    cacheService.invalidatePattern(`products:category:${product.category}:*`),
  ]);
}

// Resolvers
const resolvers: Resolvers<Context> = {
  Query: {
    product: async (_, { id }: QueryProductArgs, context: Context) => {
      // Check cache first
      const cached = await context.cacheService.get<GraphQLProduct>(cacheKeys.product(id));
      if (cached) return cached;

      // Load from database
      const product = await context.productLoader.load(id);

      // Cache the result
      if (product) {
        await context.cacheService.set(cacheKeys.product(id), product, cacheTTL.product);
      }

      return product;
    },

    productBySku: async (_, { sku }: QueryProductBySkuArgs, context: Context) => {
      const cached = await context.cacheService.get<GraphQLProduct>(cacheKeys.productBySku(sku));
      if (cached) return cached;

      const product = await context.prisma.product.findUnique({ where: { sku } });

      if (product) {
        const transformedProduct = transformProduct(product);
        await context.cacheService.set(
          cacheKeys.productBySku(sku),
          transformedProduct,
          cacheTTL.product
        );
        return transformedProduct;
      }

      return null;
    },

    products: async (_, args: QueryProductsArgs, context: Context) => {
      const { first = 20, after, category, tags, isActive, search } = args;

      // Build where clause
      const where: Prisma.ProductWhereInput = {};
      if (isActive !== null && isActive !== undefined) where.isActive = isActive;
      if (category) where.category = category;
      if (tags && tags.length > 0) where.tags = { hasSome: tags };
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Parse cursor
      const cursor = after ? { id: after } : undefined;
      const take = first || 20;

      // Fetch products
      const products = await context.prisma.product.findMany({
        where,
        take: take + 1,
        cursor,
        orderBy: { createdAt: 'desc' },
      });

      const hasNextPage = products.length > take;
      const nodes = hasNextPage ? products.slice(0, -1) : products;

      const totalCount = await context.prisma.product.count({ where });

      return {
        products: nodes.map(transformProduct),
        totalCount,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!after,
          startCursor: nodes[0]?.id,
          endCursor: nodes[nodes.length - 1]?.id,
        },
      };
    },

    categories: async (_, __, context: Context) => {
      const result = await context.prisma.product.findMany({
        select: { category: true },
        distinct: ['category'],
        orderBy: { category: 'asc' },
      });
      return result.map((r) => r.category);
    },

    searchProducts: async (_, { query, limit = 10 }: QuerySearchProductsArgs, context: Context) => {
      const results = await context.prisma.product.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { sku: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: limit || 10,
        orderBy: { name: 'asc' },
      });
      return results.map(transformProduct);
    },
  },

  Mutation: {
    createProduct: async (_, { input }: MutationCreateProductArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      const createData: Prisma.ProductCreateInput = {
        name: input.name,
        description: input.description,
        price: input.price,
        stock: input.stock,
        sku: input.sku,
        category: input.category,
        tags: input.tags || [],
        imageUrl: input.imageUrl,
        isActive: true,
      };

      const product = await context.prisma.product.create({
        data: createData,
      });

      const transformedProduct = transformProduct(product);

      // Publish event
      await publishProductCreated(context, transformedProduct);

      return transformedProduct;
    },

    updateProduct: async (_, { id, input }: MutationUpdateProductArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      // Handle InputMaybe fields properly
      const updateData: Prisma.ProductUpdateInput = {};
      if (input.name !== undefined && input.name !== null) updateData.name = input.name;
      if (input.description !== undefined && input.description !== null)
        updateData.description = input.description;
      if (input.price !== undefined && input.price !== null) updateData.price = input.price;
      if (input.stock !== undefined && input.stock !== null) updateData.stock = input.stock;
      if (input.category !== undefined && input.category !== null)
        updateData.category = input.category;
      if (input.tags !== undefined && input.tags !== null) updateData.tags = input.tags;
      if (input.imageUrl !== undefined) updateData.imageUrl = input.imageUrl;

      const product = await context.prisma.product.update({
        where: { id },
        data: updateData,
      });

      await clearProductCaches(product, context.cacheService);

      const transformedProduct = transformProduct(product);

      // Publish event
      await publishProductUpdated(context, transformedProduct);

      return transformedProduct;
    },

    updateStock: async (_, { id, quantity }: MutationUpdateStockArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      const product = await context.prisma.product.update({
        where: { id },
        data: { stock: quantity },
      });

      await clearProductCaches(product, context.cacheService);

      const transformedProduct = transformProduct(product);

      // Publish event
      await publishProductStockChanged(context, transformedProduct);

      return transformedProduct;
    },

    deactivateProduct: async (_, { id }: MutationDeactivateProductArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      const product = await context.prisma.product.update({
        where: { id },
        data: { isActive: false },
      });

      await clearProductCaches(product, context.cacheService);

      const transformedProduct = transformProduct(product);

      // Publish event
      await publishProductDeactivated(context, transformedProduct);

      return transformedProduct;
    },

    activateProduct: async (_, { id }: MutationActivateProductArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      const product = await context.prisma.product.update({
        where: { id },
        data: { isActive: true },
      });

      await clearProductCaches(product, context.cacheService);

      const transformedProduct = transformProduct(product);

      // Publish event
      await publishProductUpdated(context, transformedProduct);

      return transformedProduct;
    },

    bulkUpdateStock: async (_, { updates }: MutationBulkUpdateStockArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      const results = await Promise.all(
        updates.map(({ productId, quantity }) =>
          context.prisma.product.update({
            where: { id: productId },
            data: { stock: quantity },
          })
        )
      );

      // Clear caches for all updated products
      await Promise.all(
        results.map((product) => clearProductCaches(product, context.cacheService))
      );

      return results.map(transformProduct);
    },
  },

  Product: {
    __resolveReference: async (product: { id: string }, context: Context) => {
      return context.productLoader.load(product.id);
    },
  } as Resolvers<Context>['Product'],

  ...subscriptionResolvers.Subscription,
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
    };
  },
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down Products service...');
  await prisma.$disconnect();
  await cacheService.disconnect();
  process.exit(0);
});

console.log(`🚀 Products service ready at ${url}`);
