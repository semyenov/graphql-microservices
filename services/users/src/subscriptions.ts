import { SUBSCRIPTION_EVENTS } from '@graphql-microservices/shared-pubsub';
import type { User as GraphQLUser, SubscriptionResolvers } from '../generated/graphql';
import type { Context } from './index';

export const subscriptionResolvers: { Subscription: SubscriptionResolvers<Context> } = {
  Subscription: {
    userCreated: {
      subscribe: (_, __, context) => {
        return context.pubsub.asyncIterator([SUBSCRIPTION_EVENTS.USER_CREATED]);
      },
    },
    userUpdated: {
      subscribe: (_, __, context) => {
        return context.pubsub.asyncIterator([SUBSCRIPTION_EVENTS.USER_UPDATED]);
      },
      resolve: (payload: { userUpdated: GraphQLUser }) => {
        return payload.userUpdated;
      },
    },
    userDeactivated: {
      subscribe: (_, __, context) => {
        return context.pubsub.asyncIterator([SUBSCRIPTION_EVENTS.USER_DEACTIVATED]);
      },
    },
  },
};

// Helper functions to publish events
export const publishUserCreated = async (context: Context, user: GraphQLUser): Promise<void> => {
  await context.pubsub.publish(SUBSCRIPTION_EVENTS.USER_CREATED, {
    userCreated: user,
  });
};

export const publishUserUpdated = async (context: Context, user: GraphQLUser): Promise<void> => {
  await context.pubsub.publish(SUBSCRIPTION_EVENTS.USER_UPDATED, {
    userUpdated: user,
  });
};

export const publishUserDeactivated = async (
  context: Context,
  user: GraphQLUser
): Promise<void> => {
  await context.pubsub.publish(SUBSCRIPTION_EVENTS.USER_DEACTIVATED, {
    userDeactivated: user,
  });
};
