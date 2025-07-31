import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { orderServiceEnvSchema, parseEnv } from '@graphql-microservices/config';
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
  Order as GraphQLOrder,
  MutationResolvers,
  OrderItemResolvers,
  OrderResolvers,
  QueryResolvers,
  Resolvers,
  UserResolvers,
} from '../generated/graphql';
import { PrismaClient } from '../generated/prisma';
import { OrderService } from './application/order-service';
import { isOk, isErr } from '@graphql-microservices/shared-type-utils';
import { subscriptionResolvers } from './subscriptions';

// Parse and validate environment variables
const env = parseEnv(orderServiceEnvSchema);

// Initialize services
const prisma = new PrismaClient();
const cacheService = new CacheService(env.REDIS_URL || 'redis://localhost:6379');
const pubSubService = new PubSubService({ redisUrl: env.REDIS_URL });

// Initialize order service
const orderService = new OrderService(prisma, cacheService, pubSubService);

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

// Context type for orders service
export interface Context extends AuthContext {
  orderService: OrderService;
}

// GraphQL schema
const typeDefs = gql`
  extend schema @link(
    url: "https://specs.apollo.dev/federation/v2.0",
    import: ["@key", "@shareable", "@external"]
  )

  type Order @key(fields: "id") {
    id: ID!
    orderNumber: String!
    userId: ID!
    user: User
    status: OrderStatus!
    items: [OrderItem!]!
    subtotal: Float!
    tax: Float!
    shipping: Float!
    discount: Float!
    totalAmount: Float!
    shippingAddress: ShippingAddress!
    paymentInfo: PaymentInfo!
    shippingInfo: ShippingInfo
    notes: String
    createdAt: String!
    updatedAt: String!
  }

  type OrderItem {
    id: ID!
    orderId: ID!
    productId: ID!
    quantity: Int!
    unitPrice: Float!
    totalPrice: Float!
  }

  type ShippingAddress {
    street: String!
    city: String!
    state: String!
    country: String!
    postalCode: String!
  }

  type PaymentInfo {
    method: PaymentMethod!
    status: PaymentStatus!
    transactionId: String
  }

  type ShippingInfo {
    carrier: String
    trackingNumber: String
    estimatedDeliveryDate: String
    deliveredAt: String
  }

  enum OrderStatus {
    PENDING
    CONFIRMED
    PROCESSING
    SHIPPED
    DELIVERED
    CANCELLED
    REFUNDED
  }

  enum PaymentMethod {
    CARD
    PAYPAL
    STRIPE
    BANK_TRANSFER
  }

  enum PaymentStatus {
    PENDING
    COMPLETED
    FAILED
    REFUNDED
  }

  extend type User @key(fields: "id") {
    id: ID! @external
    orders(first: Int, after: String, status: OrderStatus): OrderConnection!
  }

  type OrderConnection {
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
      status: OrderStatus
      userId: ID
    ): OrderConnection!
  }

  type Mutation {
    createOrder(input: CreateOrderInput!): Order!
    updateOrderStatus(id: ID!, status: OrderStatus!, reason: String): Order!
    cancelOrder(id: ID!, reason: String!): Order!
    refundOrder(id: ID!, amount: Float!, reason: String!): Order!
    updateShippingInfo(id: ID!, input: ShippingInfoInput!): Order!
  }

  type Subscription {
    orderCreated(userId: ID): Order!
    orderStatusChanged(orderId: ID, userId: ID): OrderStatusChangedEvent!
    orderCancelled(userId: ID): OrderCancelledEvent!
    orderRefunded(userId: ID): OrderRefundedEvent!
  }

  type OrderStatusChangedEvent {
    order: Order!
    previousStatus: OrderStatus!
    newStatus: OrderStatus!
    reason: String
  }

  type OrderCancelledEvent {
    order: Order!
    reason: String!
    cancelledBy: String!
    refundAmount: Float
  }

  type OrderRefundedEvent {
    order: Order!
    refundAmount: Float!
    reason: String!
    processedBy: String!
  }

  input CreateOrderInput {
    items: [OrderItemInput!]!
    shippingAddress: ShippingAddressInput!
    paymentMethod: PaymentMethod!
    notes: String
  }

  input OrderItemInput {
    productId: ID!
    quantity: Int!
    unitPrice: Float!
  }

  input ShippingAddressInput {
    street: String!
    city: String!
    state: String!
    country: String!
    postalCode: String!
  }

  input ShippingInfoInput {
    carrier: String!
    trackingNumber: String!
    estimatedDeliveryDate: String
  }
`;

// Helper function to transform view model to GraphQL format
const transformToGraphQL = (order: any): GraphQLOrder => ({
  ...order,
  createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
  updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : order.updatedAt,
  subtotal: Number(order.subtotal),
  tax: Number(order.tax),
  shipping: Number(order.shipping),
  discount: Number(order.discount),
  totalAmount: Number(order.totalAmount),
});

// Helper to handle service errors
function handleServiceError(result: any): never {
  if (!isErr(result)) {
    throw new Error('Expected error result');
  }

  const { code, message, details } = result.error;

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
    case 'INVALID_STATUS_TRANSITION':
      throw new GraphQLError(message, {
        extensions: { code: 'INVALID_STATUS_TRANSITION', details },
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
    order: async (_, { id }, context) => {
      const result = await context.orderService.getOrderById(id);

      if (isErr(result)) {
        handleServiceError(result);
      }

      return result.value ? transformToGraphQL(result.value) : null;
    },

    orderByNumber: async (_, { orderNumber }, context) => {
      const result = await context.orderService.getOrderByNumber(orderNumber);

      if (isErr(result)) {
        handleServiceError(result);
      }

      return result.value ? transformToGraphQL(result.value) : null;
    },

    orders: async (_, args, context) => {
      const { first = 20, after, status, userId } = args;

      const filter = {
        status: status as any,
        userId,
      };

      const pagination = {
        limit: first,
        offset: after ? parseInt(Buffer.from(after, 'base64').toString()) : 0,
      };

      const result = await context.orderService.getAllOrders(filter, pagination);

      if (isErr(result)) {
        handleServiceError(result);
      }

      const { items, totalCount, hasNextPage, hasPreviousPage } = result.value;
      const nodes = items.map(transformToGraphQL);

      return {
        orders: nodes,
        totalCount,
        pageInfo: {
          hasNextPage,
          hasPreviousPage,
          startCursor: nodes[0]?.id,
          endCursor: nodes[nodes.length - 1]?.id,
        },
      };
    },
  } as QueryResolvers<Context>,

  Mutation: {
    createOrder: async (_, { input }, context) => {
      if (!context.user) throw new AuthenticationError();

      const result = await context.orderService.createOrder(
        {
          userId: context.user.id,
          items: input.items,
          shippingAddress: input.shippingAddress,
          paymentMethod: input.paymentMethod,
          notes: input.notes,
        },
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

    updateOrderStatus: async (_, { id, status, reason }, context) => {
      if (!context.user) throw new AuthenticationError();

      const result = await context.orderService.updateOrderStatus(
        id,
        status as any,
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

    cancelOrder: async (_, { id, reason }, context) => {
      if (!context.user) throw new AuthenticationError();

      const result = await context.orderService.cancelOrder(
        id,
        context.user.username,
        reason,
        undefined, // Let the service calculate refund amount
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

    refundOrder: async (_, { id, amount, reason }, context) => {
      if (!context.user) throw new AuthenticationError();

      const result = await context.orderService.processRefund(
        id,
        {
          refundAmount: amount,
          reason,
          processedBy: context.user.username,
        },
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

    updateShippingInfo: async (_, { id, input }, context) => {
      if (!context.user) throw new AuthenticationError();

      const result = await context.orderService.markAsShipped(
        id,
        {
          carrier: input.carrier,
          trackingNumber: input.trackingNumber,
          shippedBy: context.user.username,
          estimatedDeliveryDate: input.estimatedDeliveryDate
            ? new Date(input.estimatedDeliveryDate)
            : undefined,
        },
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
  } as MutationResolvers<Context>,

  Subscription: subscriptionResolvers,

  Order: {
    user: (order) => ({ __typename: 'User', id: order.userId }),
    items: (order) => order.items || [],
  } as OrderResolvers<Context>,

  OrderItem: {
    id: (item: any) => `${item.orderId}-${item.productId}`,
  } as OrderItemResolvers<Context>,

  User: {
    orders: async (user, args, context) => {
      const { first = 20, after, status } = args;

      const filter = {
        status: status as any,
      };

      const pagination = {
        limit: first,
        offset: after ? parseInt(Buffer.from(after, 'base64').toString()) : 0,
      };

      const result = await context.orderService.getOrdersByUser(user.id, filter, pagination);

      if (isErr(result)) {
        handleServiceError(result);
      }

      const { items, totalCount, hasNextPage, hasPreviousPage } = result.value;
      const nodes = items.map(transformToGraphQL);

      return {
        orders: nodes,
        totalCount,
        pageInfo: {
          hasNextPage,
          hasPreviousPage,
          startCursor: nodes[0]?.id,
          endCursor: nodes[nodes.length - 1]?.id,
        },
      };
    },
  } as UserResolvers<Context>,
};

// Create Apollo Server
const server = new ApolloServer<Context>({
  schema: buildSubgraphSchema({ typeDefs, resolvers }),
  formatError,
  introspection: env.NODE_ENV !== 'production',
});

// Start server
(async () => {
  const { url } = await startStandaloneServer(server, {
    listen: { port: env.PORT || 4003 },
    context: async ({ req }): Promise<Context> => {
      const authService = new AuthService(env.JWT_KEYS, env.REFRESH_JWT_KEYS);
      const user = await extractAndVerifyUser(authService, req.headers.authorization);
      return {
        user,
        orderService,
      };
    },
  });

  console.log(`🚀 Orders service ready at ${url}`);
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
