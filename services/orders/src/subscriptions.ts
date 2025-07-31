import { SUBSCRIPTION_EVENTS } from '@graphql-microservices/shared-pubsub';
import type {
  Order as GraphQLOrder,
  SubscriptionOrderCreatedArgs,
  SubscriptionOrderStatusChangedArgs,
  SubscriptionResolvers,
} from '../generated/graphql';
import type { Context } from './index';

export const subscriptionResolvers: { Subscription: SubscriptionResolvers<Context> } = {
  Subscription: {
    orderCreated: {
      subscribe: (_: any, _args: Partial<SubscriptionOrderCreatedArgs>, context: Context) => {
        return context.pubsub.asyncIterator([SUBSCRIPTION_EVENTS.ORDER_CREATED]);
      },
      resolve: (payload: { orderCreated: GraphQLOrder }) => {
        return payload.orderCreated;
      },
    },
    orderStatusChanged: {
      subscribe: (_: any, _args: Partial<SubscriptionOrderStatusChangedArgs>, context: Context) => {
        return context.pubsub.asyncIterator([SUBSCRIPTION_EVENTS.ORDER_STATUS_CHANGED]);
      },
      resolve: (payload: { orderStatusChanged: GraphQLOrder }) => {
        return payload.orderStatusChanged;
      },
    },
    orderCancelled: {
      subscribe: (_: any, __: any, context: Context) => {
        return context.pubsub.asyncIterator([SUBSCRIPTION_EVENTS.ORDER_CANCELLED]);
      },
    },
    orderRefunded: {
      subscribe: (_: any, __: any, context: Context) => {
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
