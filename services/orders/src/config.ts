import { parseEnv } from '@graphql-microservices/shared-config';
import { z } from 'zod';

// Environment schema for Orders Service
export const ordersServiceEnvSchema = z.object({
  // Server
  PORT: z.number().default(4003),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database
  DATABASE_URL: z.string().url('Invalid database URL'),

  // Redis
  REDIS_URL: z.string().url('Invalid Redis URL').optional(),

  // JWT Keys (shared with other services)
  JWT_ACCESS_PRIVATE_KEY: z.string().optional(),
  JWT_ACCESS_PUBLIC_KEY: z.string().optional(),
  JWT_REFRESH_PRIVATE_KEY: z.string().optional(),
  JWT_REFRESH_PUBLIC_KEY: z.string().optional(),

  // Service Configuration
  ENABLE_PROJECTIONS: z.boolean().default(true),
  ENABLE_OUTBOX_PROCESSOR: z.boolean().default(true),
  OUTBOX_POLL_INTERVAL: z.number().default(5000),

  // GraphQL
  INTROSPECTION_ENABLED: z.boolean().default(true),
  PLAYGROUND_ENABLED: z.boolean().default(true),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Feature flags
  ENABLE_CROSS_SERVICE_EVENTS: z.boolean().default(true),
  ENABLE_REAL_TIME_UPDATES: z.boolean().default(true),
});

export type OrdersServiceEnv = z.infer<typeof ordersServiceEnvSchema>;

// Parse and validate environment variables
export const env = parseEnv(ordersServiceEnvSchema);

// Service-specific configuration
export const config = {
  service: {
    name: 'orders-service',
    version: '1.0.0',
    port: env.PORT,
  },

  database: {
    url: env.DATABASE_URL,
    maxConnections: 10,
    idleTimeout: 30000,
  },

  redis: {
    url: env.REDIS_URL || 'redis://localhost:6379',
    keyPrefix: 'orders:',
    ttl: {
      order: 3600, // 1 hour
      statistics: 300, // 5 minutes
      search: 600, // 10 minutes
    },
  },

  cqrs: {
    enableProjections: env.ENABLE_PROJECTIONS,
    enableOutboxProcessor: env.ENABLE_OUTBOX_PROCESSOR,
    outboxPollInterval: env.OUTBOX_POLL_INTERVAL,
  },

  graphql: {
    introspection: env.INTROSPECTION_ENABLED,
    playground: env.PLAYGROUND_ENABLED,
  },

  features: {
    crossServiceEvents: env.ENABLE_CROSS_SERVICE_EVENTS,
    realTimeUpdates: env.ENABLE_REAL_TIME_UPDATES,
  },

  // Order-specific business rules
  businessRules: {
    maxItemsPerOrder: 100,
    maxOrderTotal: 1000000, // $1,000,000
    orderNumberPrefix: 'ORD',
    defaultCurrency: 'USD',
    taxRate: 0.08, // 8%
    flatShippingRate: 10, // $10
    freeShippingThreshold: 100, // $100
  },

  // Event channels for cross-service communication
  eventChannels: {
    publish: {
      orderCreated: 'order.created',
      orderCancelled: 'order.cancelled',
      orderShipped: 'order.shipped',
      orderDelivered: 'order.delivered',
      orderRefunded: 'order.refunded',
      orderStatusChanged: 'order.status.changed',
    },
    subscribe: {
      productEvents: 'cross-service.product.events',
      userEvents: 'cross-service.user.events',
      paymentEvents: 'cross-service.payment.events',
      inventoryResponses: 'inventory.responses',
    },
  },
};
