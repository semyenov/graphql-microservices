import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { createGraphQLLoggingPlugin, createLogger } from '@graphql-microservices/logger';
import {
  type AuthContext,
  AuthService,
  extractAndVerifyUser,
} from '@graphql-microservices/shared-auth';
import { CacheService, cacheTTL } from '@graphql-microservices/shared-cache';
import { OrderServiceConfig } from '@graphql-microservices/shared-config';
import {
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError,
  createErrorLogger,
  formatError,
  generateId,
  InternalServerError,
  NotFoundError,
  toGraphQLError,
  ValidationError,
} from '@graphql-microservices/shared-errors';
import { PubSubService } from '@graphql-microservices/shared-pubsub';
import { Result } from '@graphql-microservices/shared-result';
import {
  createOrderInputSchema,
  orderStatusSchema,
  validateInput,
  validateOrderStatusTransition,
} from '@graphql-microservices/validation';
import cors from 'cors';
import DataLoader from 'dataloader';
import express from 'express';
import { GraphQLError } from 'graphql';
import gql from 'graphql-tag';
import type {
  Order as GraphQLOrder,
  OrderStatus as GraphQLOrderStatus,
  MutationResolvers,
  OrderItem,
  OrderItemResolvers,
  OrderResolvers,
  QueryResolvers,
  Resolvers,
  User,
  UserResolvers,
} from '../generated/graphql';
import type {
  OrderStatus,
  Prisma,
  PrismaClient,
  Order as PrismaOrder,
  OrderItem as PrismaOrderItem,
} from '../generated/prisma';
import { createOrderCommand } from './domain/commands/index';
import {
  initializeOrdersCQRS,
  type OrdersCQRSIntegration,
} from './infrastructure/cqrs-integration';
import { createMockExternalServices } from './infrastructure/mock-external-services';
import { OrdersMonitoringService } from './infrastructure/monitoring-endpoints';
import {
  defaultPerformanceConfig,
  OrdersPerformanceService,
} from './infrastructure/performance-optimizations';
import {
  publishOrderCancelled,
  publishOrderCreated,
  publishOrderRefunded,
  publishOrderStatusChanged,
  subscriptionResolvers,
} from './subscriptions';

// Initialize logger first
const logger = createLogger({ service: 'orders' });

// Initialize configuration
const configResult = await OrderServiceConfig.initialize();
if (Result.isErr(configResult)) {
  logger.error('Failed to initialize configuration:', configResult.error);
  process.exit(1);
}
const env = configResult.value;

// Initialize services
const cacheService = new CacheService(env.REDIS_URL || 'redis://localhost:6379');
const pubSubService = new PubSubService({ redisUrl: env.REDIS_URL });
const pubsub = pubSubService.getPubSub();

// Initialize CQRS
let cqrsIntegration: OrdersCQRSIntegration;
let monitoringService: OrdersMonitoringService;
let performanceService: OrdersPerformanceService;
let prisma: PrismaClient;

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
  cqrs: OrdersCQRSIntegration;
  logger: ReturnType<typeof createLogger>;
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
    customerId: ID!
    customerName: String!
    customerEmail: String!
    items: [OrderItem!]!
    subtotal: Float!
    tax: Float!
    shipping: Float!
    total: Float!
    currency: String!
    status: OrderStatus!
    
    # Shipping Address
    shippingStreet: String!
    shippingCity: String!
    shippingState: String!
    shippingPostalCode: String!
    shippingCountry: String!
    
    # Billing Address (optional)
    billingStreet: String
    billingCity: String
    billingState: String
    billingPostalCode: String
    billingCountry: String
    
    # Payment
    paymentMethod: String!
    paymentTransactionId: String
    paymentProcessedAt: String
    
    # Shipping Info
    trackingNumber: String
    carrier: String
    shippedDate: String
    estimatedDeliveryDate: String
    deliveredAt: String
    
    # Refund Info
    refundAmount: Float
    refundReason: String
    refundTransactionId: String
    refundedAt: String
    
    # Metadata
    notes: String
    createdAt: String!
    updatedAt: String!
    cancelledAt: String
  }

  type OrderItem {
    id: ID!
    productId: ID!
    product: Product
    productName: String!
    quantity: Int!
    unitPrice: Float!
    total: Float!
  }

  # Removed ShippingInfo and PaymentInfo types as they are now part of Order

  enum OrderStatus {
    PENDING
    CONFIRMED
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
    updateShippingAddress(
      id: ID!
      street: String!
      city: String!
      state: String!
      postalCode: String!
      country: String!
    ): Order!
  }

  type Subscription {
    orderCreated(customerId: ID): Order!
    orderStatusChanged(customerId: ID): Order!
    orderCancelled: Order!
    orderRefunded: Order!
  }

  input CreateOrderInput {
    customerId: ID!
    customerName: String!
    customerEmail: String!
    shippingStreet: String!
    shippingCity: String!
    shippingState: String!
    shippingPostalCode: String!
    shippingCountry: String!
    billingStreet: String
    billingCity: String
    billingState: String
    billingPostalCode: String
    billingCountry: String
    paymentMethod: String!
    items: [OrderItemInput!]!
    notes: String
  }

  input OrderItemInput {
    productId: ID!
    productName: String!
    quantity: Int!
    unitPrice: Float!
  }

  # Removed ShippingInfoInput as fields are now part of CreateOrderInput
`;

// Helper function to transform Prisma order to GraphQL format
const transformOrder = (order: PrismaOrder & { items?: PrismaOrderItem[] }): GraphQLOrder => {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    items:
      order.items?.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
      })) || [],
    subtotal: Number(order.subtotal),
    tax: Number(order.tax),
    shipping: Number(order.shipping),
    total: Number(order.total),
    currency: order.currency,
    status: order.status as GraphQLOrderStatus,
    // Shipping Address
    shippingStreet: order.shippingStreet,
    shippingCity: order.shippingCity,
    shippingState: order.shippingState,
    shippingPostalCode: order.shippingPostalCode,
    shippingCountry: order.shippingCountry,
    // Billing Address
    billingStreet: order.billingStreet,
    billingCity: order.billingCity,
    billingState: order.billingState,
    billingPostalCode: order.billingPostalCode,
    billingCountry: order.billingCountry,
    // Payment
    paymentMethod: order.paymentMethod,
    paymentTransactionId: order.paymentTransactionId,
    paymentProcessedAt: order.paymentProcessedAt?.toISOString() || null,
    // Shipping Info
    trackingNumber: order.trackingNumber,
    carrier: order.carrier,
    shippedDate: order.shippedDate?.toISOString() || null,
    estimatedDeliveryDate: order.estimatedDeliveryDate?.toISOString() || null,
    deliveredAt: order.deliveredAt?.toISOString() || null,
    // Refund Info
    refundAmount: order.refundAmount ? Number(order.refundAmount) : null,
    refundReason: order.refundReason,
    refundTransactionId: order.refundTransactionId,
    refundedAt: order.refundedAt?.toISOString() || null,
    // Metadata
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    cancelledAt: order.cancelledAt?.toISOString() || null,
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
    cacheService.invalidatePattern(`orders:customer:${order.customerId}:*`),
  ]);
}

// Resolvers
const queryResolvers: QueryResolvers<Context> = {
  order: async (_, { id }, context) => {
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

  orderByNumber: async (_, { orderNumber }, context) => {
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

  orders: async (_, args, context) => {
    try {
      const { first = 20, after, customerId, status, dateFrom, dateTo } = args;

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
      if (customerId) where.customerId = customerId;
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

  myOrders: async (_, args, context) => {
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
        customerId: context.user.userId,
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
      logError(error, { operation: 'myOrders', customerId: context.user.userId });
      throw toGraphQLError(error, 'Failed to fetch your orders');
    }
  },
};

const mutationResolvers: MutationResolvers<Context> = {
  createOrder: async (_, { input }, context) => {
    if (!context.user) throw new AuthenticationError();

    try {
      // Validate input
      const validatedInput = validateInput(createOrderInputSchema, input);

      // Generate order number
      const orderNumber = `ORD-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

      // Create command for CQRS
      const command = createOrderCommand(
        {
          orderNumber,
          customerId: context.user.userId,
          items: validatedInput.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            productSku: item.productId, // Using productId as SKU for now
            quantity: item.quantity,
            unitPrice: {
              amount: item.unitPrice,
              currency: 'USD',
            },
          })),
          shippingAddress: {
            street: validatedInput.shippingStreet,
            city: validatedInput.shippingCity,
            state: validatedInput.shippingState,
            postalCode: validatedInput.shippingPostalCode,
            country: validatedInput.shippingCountry,
          },
          billingAddress: validatedInput.billingStreet
            ? {
                street: validatedInput.billingStreet,
                city: validatedInput.billingCity || '',
                state: validatedInput.billingState || '',
                postalCode: validatedInput.billingPostalCode || '',
                country: validatedInput.billingCountry || 'US',
              }
            : undefined,
          paymentInfo: {
            method: validatedInput.paymentMethod as
              | 'CREDIT_CARD'
              | 'DEBIT_CARD'
              | 'PAYPAL'
              | 'BANK_TRANSFER',
            status: 'pending' as const,
          },
          shippingInfo: {
            method: 'standard',
            cost: {
              amount: 9.99,
              currency: 'USD',
            },
          },
          notes: validatedInput.notes,
        },
        {
          userId: context.user.userId,
          correlationId: generateId(),
          source: 'orders-service',
        }
      );

      // Execute command using modern Result type
      const commandBus = context.cqrs.getCommandBus();
      const result = await commandBus.execute('CreateOrder', command);

      if (Result.isErr(result)) {
        logger.error('Failed to execute create order command', result.error);
        throw new InternalServerError(result.error.message || 'Failed to create order');
      }

      // Load the created order
      const order = await context.prisma.order.findUnique({
        where: { orderNumber },
        include: { items: true },
      });

      if (!order) {
        throw new InternalServerError('Order created but not found');
      }

      const transformedOrder = transformOrder(order);

      // Publish event
      await publishOrderCreated(context, transformedOrder);

      return transformedOrder;
    } catch (error) {
      if (error instanceof GraphQLError) throw error;

      logError(error, { operation: 'createOrder', customerId: context.user?.userId });
      throw new InternalServerError('Failed to create order');
    }
  },

  updateOrderStatus: async (_, { id, status }, context) => {
    if (!context.user) throw new AuthenticationError();

    try {
      // Validate status
      const validatedStatus = validateInput(orderStatusSchema, status);

      // Check if order exists and get current status
      const existingOrder = await context.prisma.order.findUnique({
        where: { id },
        select: { id: true, status: true, customerId: true },
      });

      if (!existingOrder) {
        throw new NotFoundError('Order', id);
      }

      // Check authorization - only order owner or admin can update status
      if (context.user.userId !== existingOrder.customerId && context.user.role !== 'ADMIN') {
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

  updateOrderNotes: async (_, { id, notes }, context) => {
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
        select: { id: true, customerId: true },
      });

      if (!existingOrder) {
        throw new NotFoundError('Order', id);
      }

      // Check authorization
      if (context.user.userId !== existingOrder.customerId && context.user.role !== 'ADMIN') {
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

  cancelOrder: async (_, { id, reason }, context) => {
    if (!context.user) throw new AuthenticationError();

    try {
      // Check if order exists and get current status
      const existingOrder = await context.prisma.order.findUnique({
        where: { id },
        select: { id: true, status: true, customerId: true, createdAt: true },
      });

      if (!existingOrder) {
        throw new NotFoundError('Order', id);
      }

      // Check authorization
      if (context.user.userId !== existingOrder.customerId && context.user.role !== 'ADMIN') {
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

  refundOrder: async (_, { id, reason }, context) => {
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
        select: { id: true, status: true, customerId: true },
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

  updateShippingAddress: async (_, { id, street, city, state, postalCode, country }, context) => {
    if (!context.user) throw new AuthenticationError();

    try {
      // Check if order exists and get current details
      const existingOrder = await context.prisma.order.findUnique({
        where: { id },
        select: { id: true, customerId: true, status: true },
      });

      if (!existingOrder) {
        throw new NotFoundError('Order', id);
      }

      // Check authorization - only order owner or admin can update shipping info
      if (context.user.userId !== existingOrder.customerId && context.user.role !== 'ADMIN') {
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
        data: {
          shippingStreet: street,
          shippingCity: city,
          shippingState: state,
          shippingPostalCode: postalCode,
          shippingCountry: country,
        },
        include: { items: true },
      });

      await clearOrderCaches(order, context.cacheService);

      return transformOrder(order);
    } catch (error) {
      if (error instanceof GraphQLError) throw error;

      logError(error, { operation: 'updateShippingAddress', orderId: id });
      throw new InternalServerError('Failed to update shipping address');
    }
  },
};

const orderResolvers: OrderResolvers<Context> & {
  __resolveReference: (order: { id: string }, context: Context) => Promise<GraphQLOrder | null>;
} = {
  __resolveReference: async (order, context) => {
    return context.orderLoader.load(order.id);
  },
  user: (order) => ({
    __typename: 'User' as const,
    id: order.customerId,
    orders: [],
  }),
  items: async (order, _, context) => {
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
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
    }));
  },
};

const orderItemResolvers: OrderItemResolvers<Context> = {
  product: (item: OrderItem) => ({
    __typename: 'Product' as const,
    id: item.productId,
  }),
};

const userResolvers: UserResolvers<Context> = {
  orders: async (user: User, _: unknown, context: Context) => {
    const orders = await context.prisma.order.findMany({
      where: { customerId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
    return orders.map(transformOrder);
  },
};

// Combine all resolvers
const resolvers: Resolvers<Context> = {
  Query: queryResolvers,
  Mutation: mutationResolvers,
  Order: orderResolvers as OrderResolvers<Context>,
  OrderItem: orderItemResolvers,
  User: userResolvers,
  ...subscriptionResolvers,
};

// Initialize CQRS before starting server
async function initializeServices() {
  // Create external services (using mock services for development)
  const externalServices = createMockExternalServices();

  cqrsIntegration = await initializeOrdersCQRS({
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    enableProjections: true,
    enableModernProjections: true,
    enableSagas: true,
    enableOutboxProcessor: true,
    externalServices,
  });

  prisma = cqrsIntegration.getPrisma();

  // Initialize monitoring service
  monitoringService = new OrdersMonitoringService(cqrsIntegration);

  // Initialize performance service
  performanceService = new OrdersPerformanceService(prisma, defaultPerformanceConfig);

  logger.info('CQRS infrastructure initialized with modern projections and sagas');
}

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
  plugins: [createGraphQLLoggingPlugin(logger)],
});

// Initialize services before starting
await initializeServices();

// Create Express app
const app = express();

// Add health and monitoring endpoints
app.get('/health', async (req, res) => {
  try {
    const healthResult = await monitoringService.getHealthStatus();
    if (healthResult.isOk) {
      res.status(200).json(healthResult.value);
    } else {
      res.status(503).json({ status: 'unhealthy', error: healthResult.error.message });
    }
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: 'Health check failed' });
  }
});

app.get('/metrics', async (req, res) => {
  try {
    const metricsResult = await monitoringService.getSystemMetrics();
    if (metricsResult.isOk) {
      res.status(200).json(metricsResult.value);
    } else {
      res.status(500).json({ error: metricsResult.error.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Metrics collection failed' });
  }
});

app.get('/projections/status', async (req, res) => {
  try {
    const statusResult = await monitoringService.getProjectionStatus();
    if (statusResult.isOk) {
      res.status(200).json(statusResult.value);
    } else {
      res.status(500).json({ error: statusResult.error.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Projection status check failed' });
  }
});

app.get('/sagas/active', async (req, res) => {
  try {
    const sagasResult = await monitoringService.getActiveSagas();
    if (sagasResult.isOk) {
      res.status(200).json(sagasResult.value);
    } else {
      res.status(500).json({ error: sagasResult.error.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Active sagas check failed' });
  }
});

app.get('/performance/stats', (req, res) => {
  try {
    const stats = performanceService.getPerformanceStats();
    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Performance stats collection failed' });
  }
});

// Start Apollo Server
await server.start();

// Apply middleware
app.use(
  '/graphql',
  cors<cors.CorsRequest>(),
  express.json(),
  expressMiddleware(server, {
    context: async ({ req }) => {
      const orderLoader = createOrderLoader();

      // Extract and verify user from authorization header
      const user = await extractAndVerifyUser(authService, req.headers.authorization);

      return {
        prisma,
        cacheService,
        pubsub,
        cqrs: cqrsIntegration,
        orderLoader,
        user,
        isAuthenticated: !!user,
        logger,
      };
    },
  })
);

// Start HTTP server
const httpServer = app.listen(env.PORT, () => {
  logger.info('Orders service ready', {
    port: env.PORT,
    graphqlUrl: `http://localhost:${env.PORT}/graphql`,
    healthUrl: `http://localhost:${env.PORT}/health`,
    metricsUrl: `http://localhost:${env.PORT}/metrics`,
  });
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down Orders service...');

  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  await server.stop();
  logger.info('Apollo server stopped');

  await prisma.$disconnect();
  await cacheService.disconnect();

  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
