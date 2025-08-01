import { SUBSCRIPTION_EVENTS } from '@graphql-microservices/shared-pubsub';
import type { Order as GraphQLOrder, SubscriptionResolvers } from '../generated/graphql';
import type { Context } from './index';

export const subscriptionResolvers: { Subscription: SubscriptionResolvers<Context> } = {
  Subscription: {
    orderCreated: {
      subscribe: (_, { customerId }, context) => {
        return context.pubsub.asyncIterator([SUBSCRIPTION_EVENTS.ORDER_CREATED]);
      },
      resolve: (payload: { orderCreated: GraphQLOrder }, { customerId }) => {
        // Filter by customerId if provided
        if (customerId && payload.orderCreated.customerId !== customerId) {
          return null;
        }
        return payload.orderCreated;
      },
    },
    orderStatusChanged: {
      subscribe: (_, { customerId }, context) => {
        return context.pubsub.asyncIterator([SUBSCRIPTION_EVENTS.ORDER_STATUS_CHANGED]);
      },
      resolve: (payload: { orderStatusChanged: GraphQLOrder }, { customerId }) => {
        // Filter by customerId if provided
        if (customerId && payload.orderStatusChanged.customerId !== customerId) {
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
