import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { AuthService, extractAndVerifyUser, type AuthContext } from '@graphql-microservices/shared-auth';
import { CacheService, cacheKeys, cacheTTL } from '@graphql-microservices/shared-cache';
import { orderServiceEnvSchema, parseEnv } from '@graphql-microservices/shared-config';
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
import type {
  Order as GraphQLOrder,
  OrderStatus as GraphQLOrderStatus,
  PaymentInfo as GraphQLPaymentInfo,
  Resolvers as GraphQLResolvers,
  ShippingInfo as GraphQLShippingInfo,
  MutationCancelOrderArgs,
  MutationCreateOrderArgs,
  MutationRefundOrderArgs,
  MutationUpdateOrderNotesArgs,
  MutationUpdateOrderStatusArgs,
  MutationUpdateShippingInfoArgs,
  QueryMyOrdersArgs,
  QueryOrderArgs,
  QueryOrderByNumberArgs,
  QueryOrdersArgs,
} from '../generated/graphql';
import {
  type OrderStatus,
  type Prisma,
  PrismaClient,
  type Order as PrismaOrder,
  type OrderItem as PrismaOrderItem,
} from '../generated/prisma';
import {
  publishOrderCancelled,
  publishOrderCreated,
  publishOrderRefunded,
  publishOrderStatusChanged,
  subscriptionResolvers,
} from './subscriptions';

// Parse and validate environment variables
const env = parseEnv(orderServiceEnvSchema);

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
const logError = createErrorLogger('orders-service');

// Context type for orders service
export interface Context extends AuthContext {
  prisma: PrismaClient;
  cacheService: CacheService;
  pubsub: typeof pubsub;
  orderLoader: DataLoader<string, GraphQLOrder | null>;
}

// GraphQL schema
const typeDefs = gql`
  extend schema @link(
    url: "https://specs.apollo.dev/federation/v2.0", 
    import: ["@key", "@shareable", "@external"]
  )

  type Order @key(fields: "id") {
    id: ID!
    userId: ID!
    user: User
    orderNumber: String!
    items: [OrderItem!]!
    subtotal: Float!
    tax: Float!
    shipping: Float!
    total: Float!
    status: OrderStatus!
    shippingInfo: ShippingInfo
    paymentInfo: PaymentInfo
    notes: String
    createdAt: String!
    updatedAt: String!
  }

  type OrderItem {
    id: ID!
    productId: ID!
    product: Product
    quantity: Int!
    price: Float!
    total: Float!
  }

  type ShippingInfo {
    address: String!
    city: String!
    state: String!
    zipCode: String!
    country: String!
    phone: String
  }

  type PaymentInfo {
    method: String!
    transactionId: String
    paidAt: String
  }

  enum OrderStatus {
    PENDING
    PROCESSING
    SHIPPED
    DELIVERED
    CANCELLED
    REFUNDED
  }

  extend type User @key(fields: "id") {
    id: ID! @external
    orders: [Order!]!
  }

  extend type Product @key(fields: "id") {
    id: ID! @external
  }

  type OrdersPage {
    orders: [Order!]!
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
    order(id: ID!): Order
    orderByNumber(orderNumber: String!): Order
    orders(
      first: Int
      after: String
      userId: ID
      status: OrderStatus
      dateFrom: String
      dateTo: String
    ): OrdersPage!
    myOrders(
      first: Int
      after: String
      status: OrderStatus
    ): OrdersPage!
  }

  type Mutation {
    createOrder(input: CreateOrderInput!): Order!
    updateOrderStatus(id: ID!, status: OrderStatus!): Order!
    updateOrderNotes(id: ID!, notes: String!): Order!
    cancelOrder(id: ID!, reason: String): Order!
    refundOrder(id: ID!, reason: String!): Order!
    updateShippingInfo(id: ID!, shippingInfo: ShippingInfoInput!): Order!
  }

  type Subscription {
    orderCreated(userId: ID): Order!
    orderStatusChanged(userId: ID): Order!
    orderCancelled: Order!
    orderRefunded: Order!
  }

  input CreateOrderInput {
    items: [OrderItemInput!]!
    shippingInfo: ShippingInfoInput!
    notes: String
  }

  input OrderItemInput {
    productId: ID!
    quantity: Int!
    price: Float!
  }

  input ShippingInfoInput {
    address: String!
    city: String!
    state: String!
    zipCode: String!
    country: String!
    phone: String
  }
`;

// Helper function to transform Prisma order to GraphQL format
const transformOrder = (order: PrismaOrder & { items?: PrismaOrderItem[] }): GraphQLOrder => {
  const shippingInfo = order.shippingInfo as GraphQLShippingInfo | null;
  const paymentInfo = order.paymentInfo as GraphQLPaymentInfo | null;

  return {
    id: order.id,
    userId: order.userId,
    orderNumber: order.orderNumber,
    items:
      order.items?.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        price: Number(item.price),
        total: Number(item.total),
      })) || [],
    subtotal: Number(order.subtotal),
    tax: Number(order.tax),
    shipping: Number(order.shipping),
    total: Number(order.total),
    status: order.status as GraphQLOrderStatus,
    shippingInfo,
    paymentInfo,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
};

// DataLoader for batch loading orders
const createOrderLoader = () =>
  new DataLoader<string, GraphQLOrder | null>(async (ids) => {
    const orders = await prisma.order.findMany({
      where: { id: { in: ids as string[] } },
      include: { items: true },
    });
    const orderMap = new Map(orders.map((order) => [order.id, transformOrder(order)]));
    return ids.map((id) => orderMap.get(id) || null);
  });

// Helper function to clear order caches
async function clearOrderCaches(order: PrismaOrder, cacheService: CacheService) {
  await Promise.all([
    cacheService.delete(`order:${order.id}`),
    cacheService.delete(`order:number:${order.orderNumber}`),
    cacheService.invalidatePattern(`orders:user:${order.userId}:*`),
  ]);
}

// Resolvers
const resolvers: GraphQLResolvers<Context> = {
  Query: {
    order: async (_, { id }: QueryOrderArgs, context) => {
      // Check cache first
      const cached = await context.cacheService.get<GraphQLOrder>(`order:${id}`);
      if (cached) return cached;

      // Load from database
      const order = await context.orderLoader.load(id);

      // Cache the result
      if (order) {
        await context.cacheService.set(`order:${id}`, order, cacheTTL.product);
      }

      return order;
    },

    orderByNumber: async (_, { orderNumber }: QueryOrderByNumberArgs, context) => {
      const cached = await context.cacheService.get<GraphQLOrder>(`order:number:${orderNumber}`);
      if (cached) return cached;

      const order = await context.prisma.order.findUnique({
        where: { orderNumber },
        include: { items: true },
      });

      if (order) {
        const transformedOrder = transformOrder(order);
        await context.cacheService.set(
          `order:number:${orderNumber}`,
          transformedOrder,
          cacheTTL.product
        );
        return transformedOrder;
      }

      return null;
    },

    orders: async (_, args: QueryOrdersArgs, context) => {
      const { first = 20, after, userId, status, dateFrom, dateTo } = args;

      // Build where clause
      const where: Prisma.OrderWhereInput = {};
      if (userId) where.userId = userId;
      if (status) where.status = status as OrderStatus;
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom);
        if (dateTo) where.createdAt.lte = new Date(dateTo);
      }

      // Parse cursor
      const cursor = after ? { id: after } : undefined;
      const take = first || 20;

      // Fetch orders
      const orders = await context.prisma.order.findMany({
        where,
        take: take + 1,
        cursor,
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      });

      const hasNextPage = orders.length > take;
      const nodes = hasNextPage ? orders.slice(0, -1) : orders;

      const totalCount = await context.prisma.order.count({ where });

      return {
        orders: nodes.map(transformOrder),
        totalCount,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!after,
          startCursor: nodes[0]?.id,
          endCursor: nodes[nodes.length - 1]?.id,
        },
      };
    },

    myOrders: async (_, args: QueryMyOrdersArgs, context) => {
      if (!context.user) throw new AuthenticationError();

      const { first = 20, after, status } = args;

      // Build where clause
      const where: Prisma.OrderWhereInput = {
        userId: context.user.userId,
      };
      if (status) where.status = status as OrderStatus;

      // Parse cursor
      const cursor = after ? { id: after } : undefined;
      const take = first || 20;

      // Fetch orders
      const orders = await context.prisma.order.findMany({
        where,
        take: take + 1,
        cursor,
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      });

      const hasNextPage = orders.length > take;
      const nodes = hasNextPage ? orders.slice(0, -1) : orders;

      const totalCount = await context.prisma.order.count({ where });

      return {
        orders: nodes.map(transformOrder),
        totalCount,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!after,
          startCursor: nodes[0]?.id,
          endCursor: nodes[nodes.length - 1]?.id,
        },
      };
    },
  },
  Mutation: {
    createOrder: async (_, { input }: MutationCreateOrderArgs, context) => {
      if (!context.user) throw new AuthenticationError();

      // Calculate totals
      let subtotal = 0;
      const orderItems: Prisma.OrderItemCreateManyOrderInput[] = [];

      for (const item of input.items) {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        orderItems.push({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          total: itemTotal,
        });
      }

      const tax = subtotal * 0.1; // 10% tax
      const shipping = subtotal > 50 ? 0 : 9.99; // Free shipping over $50
      const total = subtotal + tax + shipping;

      const order = await context.prisma.order.create({
        data: {
          userId: context.user.userId,
          subtotal,
          tax,
          shipping,
          total,
          shippingInfo: input.shippingInfo,
          notes: input.notes,
          items: {
            createMany: {
              data: orderItems,
            },
          },
        },
        include: { items: true },
      });

      const transformedOrder = transformOrder(order);

      // Publish event
      await publishOrderCreated(context, transformedOrder);

      return transformedOrder;
    },

    updateOrderStatus: async (_, { id, status }: MutationUpdateOrderStatusArgs, context) => {
      if (!context.user) throw new AuthenticationError();

      const order = await context.prisma.order.update({
        where: { id },
        data: { status: status as OrderStatus },
        include: { items: true },
      });

      await clearOrderCaches(order, context.cacheService);

      const transformedOrder = transformOrder(order);

      // Publish event
      await publishOrderStatusChanged(context, transformedOrder);

      return transformedOrder;
    },

    updateOrderNotes: async (_, { id, notes }: MutationUpdateOrderNotesArgs, context) => {
      if (!context.user) throw new AuthenticationError();

      const order = await context.prisma.order.update({
        where: { id },
        data: { notes },
        include: { items: true },
      });

      await clearOrderCaches(order, context.cacheService);

      return transformOrder(order);
    },

    cancelOrder: async (_, { id, reason }: MutationCancelOrderArgs, context) => {
      if (!context.user) throw new AuthenticationError();

      const order = await context.prisma.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          notes: reason ? `Cancelled: ${reason}` : 'Order cancelled',
        },
        include: { items: true },
      });

      await clearOrderCaches(order, context.cacheService);

      const transformedOrder = transformOrder(order);

      // Publish event
      await publishOrderCancelled(context, transformedOrder);

      return transformedOrder;
    },

    refundOrder: async (_, { id, reason }: MutationRefundOrderArgs, context) => {
      if (!context.user) throw new AuthenticationError();

      const order = await context.prisma.order.update({
        where: { id },
        data: {
          status: 'REFUNDED',
          notes: `Refunded: ${reason}`,
        },
        include: { items: true },
      });

      await clearOrderCaches(order, context.cacheService);

      const transformedOrder = transformOrder(order);

      // Publish event
      await publishOrderRefunded(context, transformedOrder);

      return transformedOrder;
    },

    updateShippingInfo: async (
      _,
      { id, shippingInfo }: MutationUpdateShippingInfoArgs,
      context
    ) => {
      if (!context.user) throw new AuthenticationError();

      const order = await context.prisma.order.update({
        where: { id },
        data: { shippingInfo },
        include: { items: true },
      });

      await clearOrderCaches(order, context.cacheService);

      return transformOrder(order);
    },
  },

  Order: {
    __resolveReference: async (order: { id: string }, context) => {
      return context.orderLoader.load(order.id);
    },
    user: (order) => ({
      __typename: 'User' as const,
      id: order.userId,
      orders: [],
    }),
    items: async (order, _, context: Context) => {
      // If items are already loaded, return them
      if (order.items && order.items.length > 0) {
        return order.items;
      }

      // Otherwise, fetch from database
      const items = await context.prisma.orderItem.findMany({
        where: { orderId: order.id },
      });

      return items.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        price: Number(item.price),
        total: Number(item.total),
      }));
    },
  },

  OrderItem: {
    product: (item) => ({
      __typename: 'Product' as const,
      id: item.productId,
    }),
  },

  User: {
    orders: async (user, _, context) => {
      const orders = await context.prisma.order.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      });
      return orders.map(transformOrder);
    },
  },

  ...subscriptionResolvers.Subscription,
};

// Create Apollo Server with error formatting
const server = new ApolloServer({
  schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
  formatError: (formattedError) => {
    return formatError(
      formattedError as GraphQLError,
      env.NODE_ENV === 'development',
      'orders-service'
    );
  },
});

// Start server
const { url } = await startStandaloneServer(server, {
  listen: { port: env.PORT },
  context: async ({ req }) => {
    const orderLoader = createOrderLoader();

    // Extract and verify user from authorization header
    const user = await extractAndVerifyUser(authService, req.headers.authorization);

    return {
      prisma,
      cacheService,
      pubsub,
      orderLoader,
      user,
      isAuthenticated: !!user,
    };
  },
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down Orders service...');
  await prisma.$disconnect();
  await cacheService.disconnect();
  process.exit(0);
});

console.log(`🚀 Orders service ready at ${url}`);
