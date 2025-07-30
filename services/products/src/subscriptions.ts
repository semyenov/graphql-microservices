import { SUBSCRIPTION_EVENTS } from '@graphql-microservices/shared-pubsub';
import type { Product } from '../generated/graphql';
import type { Context } from './index';

export const subscriptionResolvers = {
  Subscription: {
    productCreated: {
      subscribe: (_: unknown, __: unknown, context: Context) => {
        return context.pubsub.asyncIterator([SUBSCRIPTION_EVENTS.PRODUCT_CREATED]);
      },
    },
    productUpdated: {
      subscribe: (_: unknown, __: unknown, context: Context) => {
        return context.pubsub.asyncIterator([SUBSCRIPTION_EVENTS.PRODUCT_UPDATED]);
      },
      resolve: (payload: { productUpdated: Product }, { productId }: { productId?: string }) => {
        // Filter by productId if provided
        if (productId && payload.productUpdated.id !== productId) {
          return null;
        }
        return payload.productUpdated;
      },
    },
    productStockChanged: {
      subscribe: (_: unknown, __: unknown, context: Context) => {
        return context.pubsub.asyncIterator([SUBSCRIPTION_EVENTS.PRODUCT_STOCK_CHANGED]);
      },
      resolve: (
        payload: { productStockChanged: Product },
        { productId }: { productId?: string }
      ) => {
        // Filter by productId if provided
        if (productId && payload.productStockChanged.id !== productId) {
          return null;
        }
        return payload.productStockChanged;
      },
    },
    productDeactivated: {
      subscribe: (_: unknown, __: unknown, context: Context) => {
        return context.pubsub.asyncIterator([SUBSCRIPTION_EVENTS.PRODUCT_DEACTIVATED]);
      },
    },
  },
};

// Helper functions to publish events
export const publishProductCreated = async (context: Context, product: Product) => {
  await context.pubsub.publish(SUBSCRIPTION_EVENTS.PRODUCT_CREATED, {
    productCreated: product,
  });
};

export const publishProductUpdated = async (context: Context, product: Product) => {
  await context.pubsub.publish(SUBSCRIPTION_EVENTS.PRODUCT_UPDATED, {
    productUpdated: product,
  });
};

export const publishProductStockChanged = async (context: Context, product: Product) => {
  await context.pubsub.publish(SUBSCRIPTION_EVENTS.PRODUCT_STOCK_CHANGED, {
    productStockChanged: product,
  });
};

export const publishProductDeactivated = async (context: Context, product: Product) => {
  await context.pubsub.publish(SUBSCRIPTION_EVENTS.PRODUCT_DEACTIVATED, {
    productDeactivated: product,
  });
};
