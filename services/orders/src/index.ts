import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  type AuthContext,
  AuthService,
  extractAndVerifyUser,
} from '@graphql-microservices/shared-auth';
import { CacheService, cacheTTL } from '@graphql-microservices/shared-cache';
import { orderServiceEnvSchema, parseEnv } from '@graphql-microservices/shared-config';
import {
  AuthenticationError,
  AuthorizationError,
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
  createOrderInputSchema,
  orderStatusSchema,
  shippingInfoSchema,
  validateInput,
  validateOrderStatusTransition,
  validateProductAvailability,
} from '@graphql-microservices/shared-validation';
import DataLoader from 'dataloader';
import { GraphQLError } from 'graphql';
import gql from 'graphql-tag';
import type {
  Order as GraphQLOrder,
  OrderStatus as GraphQLOrderStatus,
  PaymentInfo as GraphQLPaymentInfo,
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
const resolvers = {
  Query: {
    order: async (_: any, { id }: QueryOrderArgs, context: Context) => {
      try {
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
      } catch (error) {
        logError(error, { operation: 'order', orderId: id });
        throw toGraphQLError(error, 'Failed to fetch order');
      }
    },

    orderByNumber: async (_: any, { orderNumber }: QueryOrderByNumberArgs, context: Context) => {
      try {
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
      } catch (error) {
        logError(error, { operation: 'orderByNumber', orderNumber });
        throw toGraphQLError(error, 'Failed to fetch order by number');
      }
    },

    orders: async (_: any, args: QueryOrdersArgs, context: Context) => {
      try {
        const { first = 20, after, userId, status, dateFrom, dateTo } = args;

        // Validate pagination
        if (first && first > 100) {
          throw new ValidationError('Cannot request more than 100 orders at once', [
            { field: 'first', message: 'Maximum value is 100' },
          ]);
        }

        // Validate date range
        if (dateFrom && dateTo) {
          const fromDate = new Date(dateFrom);
          const toDate = new Date(dateTo);
          if (fromDate > toDate) {
            throw new ValidationError('Invalid date range', [
              { field: 'dateFrom', message: 'Start date must be before end date' },
            ]);
          }
        }

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
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logError(error, { operation: 'orders', args });
        throw toGraphQLError(error, 'Failed to fetch orders');
      }
    },

    myOrders: async (_: any, args: QueryMyOrdersArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      try {
        const { first = 20, after, status } = args;

        // Validate pagination
        if (first && first > 100) {
          throw new ValidationError('Cannot request more than 100 orders at once', [
            { field: 'first', message: 'Maximum value is 100' },
          ]);
        }

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
      } catch (error) {
        logError(error, { operation: 'myOrders', userId: context.user.userId });
        throw toGraphQLError(error, 'Failed to fetch your orders');
      }
    },
  },
  Mutation: {
    createOrder: async (_: any, { input }: MutationCreateOrderArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      try {
        // Validate input
        const validatedInput = validateInput(createOrderInputSchema, input);

        // Validate items array
        if (validatedInput.items.length === 0) {
          throw new ValidationError('Order must contain at least one item', [
            { field: 'items', message: 'No items provided' },
          ]);
        }

        // Fetch all products to validate availability
        const productIds = validatedInput.items.map((item) => item.productId);
        const products = await context.prisma.$queryRaw<
          Array<{ id: string; isActive: boolean; stock: number }>
        >`
          SELECT id, "isActive", stock FROM products WHERE id = ANY(${productIds})
        `;

        const productMap = new Map(
          products.map((p: { id: string; isActive: boolean; stock: number }) => [p.id, p])
        );

        // Validate each item
        for (const item of validatedInput.items) {
          const product = productMap.get(item.productId);

          if (!product) {
            throw new NotFoundError('Product', item.productId);
          }

          // Validate product availability
          validateProductAvailability(product as any, item.quantity);

          // Validate price (prevent negative prices)
          if (item.price <= 0) {
            throw new ValidationError('Invalid item price', [
              {
                field: 'price',
                message: `Price must be greater than 0 for product ${item.productId}`,
              },
            ]);
          }
        }

        // Calculate totals
        let subtotal = 0;
        const orderItems: Prisma.OrderItemCreateManyOrderInput[] = [];

        for (const item of validatedInput.items) {
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
            shippingInfo: validatedInput.shippingInfo,
            notes: validatedInput.notes,
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
      } catch (error) {
        if (error instanceof GraphQLError) throw error;

        logError(error, { operation: 'createOrder', userId: context.user?.userId });
        throw new InternalServerError('Failed to create order');
      }
    },

    updateOrderStatus: async (
      _: any,
      { id, status }: MutationUpdateOrderStatusArgs,
      context: Context
    ) => {
      if (!context.user) throw new AuthenticationError();

      try {
        // Validate status
        const validatedStatus = validateInput(orderStatusSchema, status);

        // Check if order exists and get current status
        const existingOrder = await context.prisma.order.findUnique({
          where: { id },
          select: { id: true, status: true, userId: true },
        });

        if (!existingOrder) {
          throw new NotFoundError('Order', id);
        }

        // Check authorization - only order owner or admin can update status
        if (context.user.userId !== existingOrder.userId && context.user.role !== 'ADMIN') {
          throw new AuthorizationError('You can only update your own orders');
        }

        // Validate status transition
        validateOrderStatusTransition(existingOrder.status, validatedStatus);

        const order = await context.prisma.order.update({
          where: { id },
          data: { status: validatedStatus as OrderStatus },
          include: { items: true },
        });

        await clearOrderCaches(order, context.cacheService);

        const transformedOrder = transformOrder(order);

        // Publish event
        await publishOrderStatusChanged(context, transformedOrder);

        return transformedOrder;
      } catch (error) {
        if (error instanceof GraphQLError) throw error;

        logError(error, { operation: 'updateOrderStatus', orderId: id, status });
        throw new InternalServerError('Failed to update order status');
      }
    },

    updateOrderNotes: async (
      _: any,
      { id, notes }: MutationUpdateOrderNotesArgs,
      context: Context
    ) => {
      if (!context.user) throw new AuthenticationError();

      try {
        // Validate notes length
        if (notes && notes.length > 500) {
          throw new ValidationError('Notes too long', [
            { field: 'notes', message: 'Notes must not exceed 500 characters' },
          ]);
        }

        // Check if order exists
        const existingOrder = await context.prisma.order.findUnique({
          where: { id },
          select: { id: true, userId: true },
        });

        if (!existingOrder) {
          throw new NotFoundError('Order', id);
        }

        // Check authorization
        if (context.user.userId !== existingOrder.userId && context.user.role !== 'ADMIN') {
          throw new AuthorizationError('You can only update your own orders');
        }

        const order = await context.prisma.order.update({
          where: { id },
          data: { notes },
          include: { items: true },
        });

        await clearOrderCaches(order, context.cacheService);

        return transformOrder(order);
      } catch (error) {
        if (error instanceof GraphQLError) throw error;

        logError(error, { operation: 'updateOrderNotes', orderId: id });
        throw new InternalServerError('Failed to update order notes');
      }
    },

    cancelOrder: async (_: any, { id, reason }: MutationCancelOrderArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      try {
        // Check if order exists and get current status
        const existingOrder = await context.prisma.order.findUnique({
          where: { id },
          select: { id: true, status: true, userId: true, createdAt: true },
        });

        if (!existingOrder) {
          throw new NotFoundError('Order', id);
        }

        // Check authorization
        if (context.user.userId !== existingOrder.userId && context.user.role !== 'ADMIN') {
          throw new AuthorizationError('You can only cancel your own orders');
        }

        // Validate status transition
        validateOrderStatusTransition(existingOrder.status, 'CANCELLED');

        // Additional business rule: Cannot cancel orders older than 30 days
        const orderAge = Date.now() - existingOrder.createdAt.getTime();
        const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
        if (orderAge > thirtyDaysInMs) {
          throw new BusinessRuleError('Cannot cancel orders older than 30 days');
        }

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
      } catch (error) {
        if (error instanceof GraphQLError) throw error;

        logError(error, { operation: 'cancelOrder', orderId: id });
        throw new InternalServerError('Failed to cancel order');
      }
    },

    refundOrder: async (_: any, { id, reason }: MutationRefundOrderArgs, context: Context) => {
      if (!context.user) throw new AuthenticationError();

      try {
        // Validate reason is provided
        if (!reason || reason.trim().length === 0) {
          throw new ValidationError('Refund reason is required', [
            { field: 'reason', message: 'Please provide a reason for the refund' },
          ]);
        }

        // Check if order exists and get current status
        const existingOrder = await context.prisma.order.findUnique({
          where: { id },
          select: { id: true, status: true, userId: true },
        });

        if (!existingOrder) {
          throw new NotFoundError('Order', id);
        }

        // Check authorization - only admins can process refunds
        if (context.user.role !== 'ADMIN') {
          throw new AuthorizationError('Only administrators can process refunds');
        }

        // Validate status transition
        validateOrderStatusTransition(existingOrder.status, 'REFUNDED');

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
      } catch (error) {
        if (error instanceof GraphQLError) throw error;

        logError(error, { operation: 'refundOrder', orderId: id });
        throw new InternalServerError('Failed to process refund');
      }
    },

    updateShippingInfo: async (
      _: any,
      { id, shippingInfo }: MutationUpdateShippingInfoArgs,
      context: Context
    ) => {
      if (!context.user) throw new AuthenticationError();

      try {
        // Validate shipping info
        const validatedShippingInfo = validateInput(shippingInfoSchema, shippingInfo);

        // Check if order exists and get current details
        const existingOrder = await context.prisma.order.findUnique({
          where: { id },
          select: { id: true, userId: true, status: true },
        });

        if (!existingOrder) {
          throw new NotFoundError('Order', id);
        }

        // Check authorization - only order owner or admin can update shipping info
        if (context.user.userId !== existingOrder.userId && context.user.role !== 'ADMIN') {
          throw new AuthorizationError('You can only update shipping info for your own orders');
        }

        // Business rule: Cannot update shipping info for delivered or cancelled orders
        if (existingOrder.status === 'DELIVERED' || existingOrder.status === 'CANCELLED') {
          throw new BusinessRuleError(
            `Cannot update shipping info for ${existingOrder.status.toLowerCase()} orders`
          );
        }

        const order = await context.prisma.order.update({
          where: { id },
          data: { shippingInfo: validatedShippingInfo },
          include: { items: true },
        });

        await clearOrderCaches(order, context.cacheService);

        return transformOrder(order);
      } catch (error) {
        if (error instanceof GraphQLError) throw error;

        logError(error, { operation: 'updateShippingInfo', orderId: id });
        throw new InternalServerError('Failed to update shipping information');
      }
    },
  },

  Order: {
    __resolveReference: async (order: { id: string }, context: Context) => {
      return context.orderLoader.load(order.id);
    },
    user: (order: any) => ({
      __typename: 'User' as const,
      id: order.userId,
      orders: [],
    }),
    items: async (order: any, _: any, context: Context) => {
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
    product: (item: any) => ({
      __typename: 'Product' as const,
      id: item.productId,
    }),
  },

  User: {
    orders: async (user: any, _: any, context: Context) => {
      const orders = await context.prisma.order.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      });
      return orders.map(transformOrder);
    },
  },

  ...subscriptionResolvers,
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
