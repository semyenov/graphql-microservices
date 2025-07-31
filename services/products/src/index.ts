import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  type AuthContext,
  AuthService,
  extractAndVerifyUser,
} from '@graphql-microservices/shared-auth';
import { CacheService, cacheKeys, cacheTTL } from '@graphql-microservices/shared-cache';
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
import { type Prisma, PrismaClient, type Product } from '../generated/prisma';
import {
  publishProductCreated,
  publishProductDeactivated,
  publishProductStockChanged,
  publishProductUpdated,
  subscriptionResolvers,
} from './subscriptions';

// Parse and validate environment variables
const env = parseEnv(productServiceEnvSchema);

// Initialize services
const prisma = new PrismaClient();
const cacheService = new CacheService(env.REDIS_URL || 'redis://localhost:6379');
const pubSubService = new PubSubService({ redisUrl: env.REDIS_URL });
const pubsub = pubSubService.getPubSub();

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
      try {
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
      } catch (error) {
        logError(error, { operation: 'product', productId: id });
        throw toGraphQLError(error, 'Failed to fetch product');
      }
    },

    productBySku: async (_, { sku }: QueryProductBySkuArgs, context: Context) => {
      try {
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

        // Check if SKU already exists
        const existingProduct = await context.prisma.product.findUnique({
          where: { sku: validatedInput.sku },
        });

        if (existingProduct) {
          throw new ValidationError('Product with this SKU already exists', [
            { field: 'sku', message: `SKU '${validatedInput.sku}' is already in use` },
          ]);
        }

        const createData: Prisma.ProductCreateInput = {
          name: validatedInput.name,
          description: validatedInput.description,
          price: validatedInput.price,
          stock: validatedInput.stock,
          sku: validatedInput.sku,
          category: validatedInput.category,
          tags: validatedInput.tags || [],
          imageUrl: validatedInput.imageUrl,
          isActive: true,
        };

        const product = await context.prisma.product.create({
          data: createData,
        });

        const transformedProduct = transformProduct(product);

        // Publish event
        await publishProductCreated(context, transformedProduct);

        return transformedProduct;
      } catch (error) {
        if (error instanceof GraphQLError) throw error;

        // Handle Prisma unique constraint errors
        if (error instanceof Error && error.message.includes('Unique constraint failed')) {
          if (error.message.includes('sku')) {
            throw new ValidationError('Product SKU must be unique', [
              { field: 'sku', message: 'This SKU is already in use' },
            ]);
          }
        }

        logError(error, { operation: 'createProduct', input });
        throw new InternalServerError('Failed to create product');
      }
    },

    updateProduct: async (_, { id, input }: MutationUpdateProductArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      try {
        // Validate input
        const validatedInput = validateInput(updateProductInputSchema, input);

        // Check if product exists
        const existingProduct = await context.prisma.product.findUnique({
          where: { id },
        });

        if (!existingProduct) {
          throw new NotFoundError('Product', id);
        }

        // Handle InputMaybe fields properly
        const updateData: Prisma.ProductUpdateInput = {};
        if (validatedInput.name !== undefined) updateData.name = validatedInput.name;
        if (validatedInput.description !== undefined)
          updateData.description = validatedInput.description;
        if (validatedInput.price !== undefined) updateData.price = validatedInput.price;
        if (validatedInput.stock !== undefined) updateData.stock = validatedInput.stock;
        if (validatedInput.category !== undefined) updateData.category = validatedInput.category;
        if (validatedInput.tags !== undefined) updateData.tags = validatedInput.tags;
        if (validatedInput.imageUrl !== undefined) updateData.imageUrl = validatedInput.imageUrl;

        const product = await context.prisma.product.update({
          where: { id },
          data: updateData,
        });

        await clearProductCaches(product, context.cacheService);

        const transformedProduct = transformProduct(product);

        // Publish event
        await publishProductUpdated(context, transformedProduct);

        return transformedProduct;
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

        // Check if product exists
        const existingProduct = await context.prisma.product.findUnique({
          where: { id },
        });

        if (!existingProduct) {
          throw new NotFoundError('Product', id);
        }

        const product = await context.prisma.product.update({
          where: { id },
          data: { stock: quantity },
        });

        await clearProductCaches(product, context.cacheService);

        const transformedProduct = transformProduct(product);

        // Publish event
        await publishProductStockChanged(context, transformedProduct);

        return transformedProduct;
      } catch (error) {
        if (error instanceof GraphQLError) throw error;

        logError(error, { operation: 'updateStock', productId: id, quantity });
        throw new InternalServerError('Failed to update product stock');
      }
    },

    deactivateProduct: async (_, { id }: MutationDeactivateProductArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      try {
        // Check if product exists
        const existingProduct = await context.prisma.product.findUnique({
          where: { id },
        });

        if (!existingProduct) {
          throw new NotFoundError('Product', id);
        }

        if (!existingProduct.isActive) {
          throw new BusinessRuleError('Product is already deactivated');
        }

        const product = await context.prisma.product.update({
          where: { id },
          data: { isActive: false },
        });

        await clearProductCaches(product, context.cacheService);

        const transformedProduct = transformProduct(product);

        // Publish event
        await publishProductDeactivated(context, transformedProduct);

        return transformedProduct;
      } catch (error) {
        if (error instanceof GraphQLError) throw error;

        logError(error, { operation: 'deactivateProduct', productId: id });
        throw new InternalServerError('Failed to deactivate product');
      }
    },

    activateProduct: async (_, { id }: MutationActivateProductArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      try {
        // Check if product exists
        const existingProduct = await context.prisma.product.findUnique({
          where: { id },
        });

        if (!existingProduct) {
          throw new NotFoundError('Product', id);
        }

        if (existingProduct.isActive) {
          throw new BusinessRuleError('Product is already active');
        }

        const product = await context.prisma.product.update({
          where: { id },
          data: { isActive: true },
        });

        await clearProductCaches(product, context.cacheService);

        const transformedProduct = transformProduct(product);

        // Publish event
        await publishProductUpdated(context, transformedProduct);

        return transformedProduct;
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

        // Validate all products exist before updating
        const productIds = validatedInput.updates.map((u) => u.productId);
        const existingProducts = await context.prisma.product.findMany({
          where: { id: { in: productIds } },
        });

        const existingIds = new Set(existingProducts.map((p) => p.id));
        const missingIds = productIds.filter((id) => !existingIds.has(id));

        if (missingIds.length > 0) {
          throw new ValidationError('Some products not found', [
            { field: 'updates', message: `Products not found: ${missingIds.join(', ')}` },
          ]);
        }

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

        // Perform updates
        const results = await Promise.all(
          validatedInput.updates.map(({ productId, quantity }) =>
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

        // Publish events for all updated products
        const transformedProducts = results.map(transformProduct);
        await Promise.all(
          transformedProducts.map((product) => publishProductStockChanged(context, product))
        );

        return transformedProducts;
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
