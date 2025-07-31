import {
  type ConfigFunctionContext,
  type ConfigLayerMeta,
  type LoadConfigOptions,
  loadConfig,
  type UserInputConfig,
} from 'c12';
import { z } from 'zod';
import * as schemas from './schemas.js';

export type ConfigContext = ConfigFunctionContext & {
  type: 'gateway' | 'users' | 'products' | 'orders';
  name: string;
};

export interface ConfigOptions<
  T extends UserInputConfig = UserInputConfig,
  MT extends ConfigLayerMeta = ConfigLayerMeta,
> extends LoadConfigOptions<T, MT> {
  context?: ConfigContext;
  schema?: z.ZodSchema<T>;
}

async function loadServiceConfig<
  T extends UserInputConfig,
  MT extends ConfigLayerMeta = ConfigLayerMeta,
>(options: ConfigOptions<T, MT> & { schema: z.ZodSchema<T> }): Promise<T> {
  const { config } = await loadConfig<T>({
    name: 'graphql-microservices',
    configFile: options.configFile ?? `${options.context}.config`,
    rcFile: '.graphqlmsrc',
    globalRc: true,
    defaultConfig: options.defaultConfig,
    overrides: options.overrides,
    envName: options.envName,

    extend: {
      extendKey: '$extends',
    },

    giget: {
      auth: process.env.GIGET_AUTH,
    },
  });

  // Merge environment variables into the config
  const envConfig = parseEnvForSchema(options.schema);
  const mergedConfig = { ...config, ...envConfig };

  // Validate with Zod schema
  const result = options.schema.safeParse(mergedConfig);

  if (!result.success) {
    console.error('❌ Invalid configuration:');
    console.error(z.treeifyError(result.error));
    throw new Error('Configuration validation failed');
  }

  return result.data;
}

function parseEnvForSchema<T>(schema: z.ZodSchema<T>): Partial<T> {
  const envConfig: Record<string, unknown> = {};

  // Extract keys from the schema shape
  if ('shape' in schema && typeof schema.shape === 'object') {
    for (const [key, _] of Object.entries(schema.shape as Record<string, unknown>)) {
      const envKey = key.toUpperCase();
      if (process.env[envKey] !== undefined) {
        envConfig[key] = process.env[envKey];
      }
    }
  }

  return envConfig as Partial<T>;
}

// Service-specific config loaders
export async function loadGatewayConfig(
  options?: Omit<ConfigOptions<schemas.GatewayEnv>, 'schema' | 'context'>
): Promise<schemas.GatewayEnv> {
  return loadServiceConfig({
    ...options,
    context: {
      type: 'gateway',
      name: 'gateway',
    },
    schema: schemas.gatewayEnvSchema,
  });
}

export async function loadUserServiceConfig(
  options?: Omit<ConfigOptions<schemas.UserServiceEnv>, 'schema' | 'context'>
): Promise<schemas.UserServiceEnv> {
  return loadServiceConfig({
    ...options,
    context: {
      type: 'users',
      name: 'users',
    },
    schema: schemas.userServiceEnvSchema,
  });
}

export async function loadProductServiceConfig(
  options?: Omit<ConfigOptions<schemas.ProductServiceEnv>, 'schema' | 'context'>
): Promise<schemas.ProductServiceEnv> {
  return loadServiceConfig({
    ...options,
    context: {
      type: 'products',
      name: 'products',
    },
    schema: schemas.productServiceEnvSchema,
  });
}

export async function loadOrderServiceConfig(
  options?: Omit<ConfigOptions<schemas.OrderServiceEnv>, 'schema' | 'context'>
): Promise<schemas.OrderServiceEnv> {
  return loadServiceConfig({
    ...options,
    context: {
      type: 'orders',
      name: 'orders',
    },
    schema: schemas.orderServiceEnvSchema,
  });
}

// With observability variants
export async function loadGatewayConfigWithObservability(
  options?: Omit<ConfigOptions<schemas.GatewayEnvWithObservability>, 'schema' | 'context'>
): Promise<schemas.GatewayEnvWithObservability> {
  return loadServiceConfig({
    ...options,
    context: {
      type: 'gateway',
      name: 'gateway',
    },
    schema: schemas.gatewayEnvSchemaWithObservability,
  });
}

export async function loadUserServiceConfigWithObservability(
  options?: Omit<ConfigOptions<schemas.UserServiceEnvWithObservability>, 'schema' | 'context'>
): Promise<schemas.UserServiceEnvWithObservability> {
  return loadServiceConfig({
    ...options,
    context: {
      type: 'users',
      name: 'users',
    },
    schema: schemas.userServiceEnvSchemaWithObservability,
  });
}

export async function loadProductServiceConfigWithObservability(
  options?: Omit<ConfigOptions<schemas.ProductServiceEnvWithObservability>, 'schema' | 'context'>
): Promise<schemas.ProductServiceEnvWithObservability> {
  return loadServiceConfig({
    ...options,
    context: {
      type: 'products',
      name: 'products',
    },
    schema: schemas.productServiceEnvSchemaWithObservability,
  });
}

export async function loadOrderServiceConfigWithObservability(
  options?: Omit<ConfigOptions<schemas.OrderServiceEnvWithObservability>, 'schema' | 'context'>
): Promise<schemas.OrderServiceEnvWithObservability> {
  return loadServiceConfig({
    ...options,
    context: {
      type: 'orders',
      name: 'orders',
    },
    schema: schemas.orderServiceEnvSchemaWithObservability,
  });
}

// Re-export schemas and types for convenience
export * from './schemas.js';
