import { SUBSCRIPTION_EVENTS } from '@graphql-microservices/shared-pubsub';
import type { Order as GraphQLOrder, SubscriptionResolvers } from '../generated/graphql';
import type { Context } from './index';

export const subscriptionResolvers: { Subscription: SubscriptionResolvers<Context> } = {
  Subscription: {
    orderCreated: {
      subscribe: (_, __, context) => {
        return context.pubsub.asyncIterator([SUBSCRIPTION_EVENTS.ORDER_CREATED]);
      },
      resolve: (payload: { orderCreated: GraphQLOrder }, args) => {
        // Filter by userId if provided
        if (args.userId && payload.orderCreated.userId !== args.userId) {
          return null;
        }
        return payload.orderCreated;
      },
    },
    orderStatusChanged: {
      subscribe: (_, __, context) => {
        return context.pubsub.asyncIterator([SUBSCRIPTION_EVENTS.ORDER_STATUS_CHANGED]);
      },
      resolve: (payload: { orderStatusChanged: GraphQLOrder }, args) => {
        // Filter by userId if provided
        if (args.userId && payload.orderStatusChanged.userId !== args.userId) {
          return null;
        }
        return payload.orderStatusChanged;
      },
    },
    orderCancelled: {
      subscribe: (_, __, context) => {
        return context.pubsub.asyncIterator([SUBSCRIPTION_EVENTS.ORDER_CANCELLED]);
      },
    },
    orderRefunded: {
      subscribe: (_, __, context) => {
        return context.pubsub.asyncIterator([SUBSCRIPTION_EVENTS.ORDER_REFUNDED]);
      },
    },
  },
};

// Helper functions to publish events
export const publishOrderCreated = async (context: Context, order: GraphQLOrder): Promise<void> => {
  await context.pubsub.publish(SUBSCRIPTION_EVENTS.ORDER_CREATED, {
    orderCreated: order,
  });
};

export const publishOrderStatusChanged = async (
  context: Context,
  order: GraphQLOrder
): Promise<void> => {
  await context.pubsub.publish(SUBSCRIPTION_EVENTS.ORDER_STATUS_CHANGED, {
    orderStatusChanged: order,
  });
};

export const publishOrderCancelled = async (
  context: Context,
  order: GraphQLOrder
): Promise<void> => {
  await context.pubsub.publish(SUBSCRIPTION_EVENTS.ORDER_CANCELLED, {
    orderCancelled: order,
  });
};

export const publishOrderRefunded = async (
  context: Context,
  order: GraphQLOrder
): Promise<void> => {
  await context.pubsub.publish(SUBSCRIPTION_EVENTS.ORDER_REFUNDED, {
    orderRefunded: order,
  });
};
