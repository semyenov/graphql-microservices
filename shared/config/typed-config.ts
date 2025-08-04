/**
 * Typed configuration accessors for each service
 */

import { type DomainError, Result } from '@graphql-microservices/shared-result';
import type { z } from 'zod';
import { type ConfigService, configBuilder } from './config-service';
import {
  type GatewayEnv,
  gatewayEnvSchema,
  type ObservabilityEnv,
  type OrderServiceEnv,
  observabilityEnvSchema,
  orderServiceEnvSchema,
  type ProductServiceEnv,
  productServiceEnvSchema,
  queryComplexityEnvSchema,
  type UserServiceEnv,
  userServiceEnvSchema,
} from './index';

/**
 * Service configuration instances
 */
const gatewayConfig: ConfigService<typeof gatewayEnvSchema> | null = null;
const userServiceConfig: ConfigService<typeof userServiceEnvSchema> | null = null;
const productServiceConfig: ConfigService<typeof productServiceEnvSchema> | null = null;
const orderServiceConfig: ConfigService<typeof orderServiceEnvSchema> | null = null;

/**
 * Gateway configuration
 */
export class GatewayConfig {
  private static instance: ConfigService<typeof gatewayEnvSchema>;

  static async initialize(
    sources?: Array<{ type: 'env' } | { type: 'file'; path: string }>
  ): Promise<Result<GatewayEnv, DomainError>> {
    if (!GatewayConfig.instance) {
      GatewayConfig.instance = configBuilder(gatewayEnvSchema)
        .withEnv()
        .onValidationError((errors) => {
          console.error('❌ Invalid gateway configuration:', errors.format());
        })
        .build();

      if (sources) {
        for (const source of sources) {
          if (source.type === 'file') {
            GatewayConfig.instance = configBuilder(gatewayEnvSchema)
              .withEnv()
              .withFile(source.path)
              .build();
          }
        }
      }
    }

    return GatewayConfig.instance.initialize();
  }

  static get(): Result<GatewayEnv, DomainError> {
    if (!GatewayConfig.instance) {
      throw new Error('Gateway configuration not initialized. Call initialize() first.');
    }
    return GatewayConfig.instance.get();
  }

  static getValue<K extends keyof GatewayEnv>(key: K): Result<GatewayEnv[K], DomainError> {
    if (!GatewayConfig.instance) {
      throw new Error('Gateway configuration not initialized. Call initialize() first.');
    }
    return GatewayConfig.instance.getValue(key);
  }

  static onChange(
    listener: (event: { previous: GatewayEnv; current: GatewayEnv; changedKeys: string[] }) => void
  ): void {
    if (!GatewayConfig.instance) {
      throw new Error('Gateway configuration not initialized. Call initialize() first.');
    }
    GatewayConfig.instance.on('change', listener);
  }
}

/**
 * User service configuration
 */
export class UserServiceConfig {
  private static instance: ConfigService<typeof userServiceEnvSchema>;

  static async initialize(
    sources?: Array<{ type: 'env' } | { type: 'file'; path: string }>
  ): Promise<Result<UserServiceEnv, DomainError>> {
    if (!UserServiceConfig.instance) {
      UserServiceConfig.instance = configBuilder(userServiceEnvSchema)
        .withEnv()
        .onValidationError((errors) => {
          console.error('❌ Invalid user service configuration:', errors.format());
        })
        .build();

      if (sources) {
        for (const source of sources) {
          if (source.type === 'file') {
            UserServiceConfig.instance = configBuilder(userServiceEnvSchema)
              .withEnv()
              .withFile(source.path)
              .build();
          }
        }
      }
    }

    return UserServiceConfig.instance.initialize();
  }

  static get(): Result<UserServiceEnv, DomainError> {
    if (!UserServiceConfig.instance) {
      throw new Error('User service configuration not initialized. Call initialize() first.');
    }
    return UserServiceConfig.instance.get();
  }

  static getValue<K extends keyof UserServiceEnv>(key: K): Result<UserServiceEnv[K], DomainError> {
    if (!UserServiceConfig.instance) {
      throw new Error('User service configuration not initialized. Call initialize() first.');
    }
    return UserServiceConfig.instance.getValue(key);
  }

  static getJwtConfig(): Result<
    Pick<
      UserServiceEnv,
      | 'JWT_EXPIRES_IN'
      | 'JWT_REFRESH_EXPIRES_IN'
      | 'JWT_ACCESS_PRIVATE_KEY'
      | 'JWT_ACCESS_PUBLIC_KEY'
      | 'JWT_REFRESH_PRIVATE_KEY'
      | 'JWT_REFRESH_PUBLIC_KEY'
    >,
    DomainError
  > {
    return Result.map(UserServiceConfig.get(), (config) => ({
      JWT_EXPIRES_IN: config.JWT_EXPIRES_IN,
      JWT_REFRESH_EXPIRES_IN: config.JWT_REFRESH_EXPIRES_IN,
      JWT_ACCESS_PRIVATE_KEY: config.JWT_ACCESS_PRIVATE_KEY,
      JWT_ACCESS_PUBLIC_KEY: config.JWT_ACCESS_PUBLIC_KEY,
      JWT_REFRESH_PRIVATE_KEY: config.JWT_REFRESH_PRIVATE_KEY,
      JWT_REFRESH_PUBLIC_KEY: config.JWT_REFRESH_PUBLIC_KEY,
    }));
  }

  static onChange(
    listener: (event: {
      previous: UserServiceEnv;
      current: UserServiceEnv;
      changedKeys: string[];
    }) => void
  ): void {
    if (!UserServiceConfig.instance) {
      throw new Error('User service configuration not initialized. Call initialize() first.');
    }
    UserServiceConfig.instance.on('change', listener);
  }
}

/**
 * Product service configuration
 */
export class ProductServiceConfig {
  private static instance: ConfigService<typeof productServiceEnvSchema>;

  static async initialize(
    sources?: Array<{ type: 'env' } | { type: 'file'; path: string }>
  ): Promise<Result<ProductServiceEnv, DomainError>> {
    if (!ProductServiceConfig.instance) {
      ProductServiceConfig.instance = configBuilder(productServiceEnvSchema)
        .withEnv()
        .onValidationError((errors) => {
          console.error('❌ Invalid product service configuration:', errors.format());
        })
        .build();

      if (sources) {
        for (const source of sources) {
          if (source.type === 'file') {
            ProductServiceConfig.instance = configBuilder(productServiceEnvSchema)
              .withEnv()
              .withFile(source.path)
              .build();
          }
        }
      }
    }

    return ProductServiceConfig.instance.initialize();
  }

  static get(): Result<ProductServiceEnv, DomainError> {
    if (!ProductServiceConfig.instance) {
      throw new Error('Product service configuration not initialized. Call initialize() first.');
    }
    return ProductServiceConfig.instance.get();
  }

  static getValue<K extends keyof ProductServiceEnv>(
    key: K
  ): Result<ProductServiceEnv[K], DomainError> {
    if (!ProductServiceConfig.instance) {
      throw new Error('Product service configuration not initialized. Call initialize() first.');
    }
    return ProductServiceConfig.instance.getValue(key);
  }

  static onChange(
    listener: (event: {
      previous: ProductServiceEnv;
      current: ProductServiceEnv;
      changedKeys: string[];
    }) => void
  ): void {
    if (!ProductServiceConfig.instance) {
      throw new Error('Product service configuration not initialized. Call initialize() first.');
    }
    ProductServiceConfig.instance.on('change', listener);
  }
}

/**
 * Order service configuration
 */
export class OrderServiceConfig {
  private static instance: ConfigService<typeof orderServiceEnvSchema>;

  static async initialize(
    sources?: Array<{ type: 'env' } | { type: 'file'; path: string }>
  ): Promise<Result<OrderServiceEnv, DomainError>> {
    if (!OrderServiceConfig.instance) {
      OrderServiceConfig.instance = configBuilder(orderServiceEnvSchema)
        .withEnv()
        .onValidationError((errors) => {
          console.error('❌ Invalid order service configuration:', errors.format());
        })
        .build();

      if (sources) {
        for (const source of sources) {
          if (source.type === 'file') {
            OrderServiceConfig.instance = configBuilder(orderServiceEnvSchema)
              .withEnv()
              .withFile(source.path)
              .build();
          }
        }
      }
    }

    return OrderServiceConfig.instance.initialize();
  }

  static get(): Result<OrderServiceEnv, DomainError> {
    if (!OrderServiceConfig.instance) {
      throw new Error('Order service configuration not initialized. Call initialize() first.');
    }
    return OrderServiceConfig.instance.get();
  }

  static getValue<K extends keyof OrderServiceEnv>(
    key: K
  ): Result<OrderServiceEnv[K], DomainError> {
    if (!OrderServiceConfig.instance) {
      throw new Error('Order service configuration not initialized. Call initialize() first.');
    }
    return OrderServiceConfig.instance.getValue(key);
  }

  static onChange(
    listener: (event: {
      previous: OrderServiceEnv;
      current: OrderServiceEnv;
      changedKeys: string[];
    }) => void
  ): void {
    if (!OrderServiceConfig.instance) {
      throw new Error('Order service configuration not initialized. Call initialize() first.');
    }
    OrderServiceConfig.instance.on('change', listener);
  }
}

/**
 * Observability configuration helper
 */
export class ObservabilityConfig {
  static create(
    overrides?: Partial<ObservabilityEnv>
  ): ConfigService<typeof observabilityEnvSchema> {
    return configBuilder(observabilityEnvSchema)
      .withEnv()
      .withMemory(overrides || {})
      .build();
  }

  static async initialize(
    overrides?: Partial<ObservabilityEnv>
  ): Promise<Result<ObservabilityEnv, DomainError>> {
    const config = ObservabilityConfig.create(overrides);
    return config.initialize();
  }
}

/**
 * Query complexity configuration helper
 */
export class QueryComplexityConfig {
  static create(
    overrides?: Partial<z.infer<typeof queryComplexityEnvSchema>>
  ): ConfigService<typeof queryComplexityEnvSchema> {
    return configBuilder(queryComplexityEnvSchema)
      .withEnv()
      .withMemory(overrides || {})
      .build();
  }

  static async initialize(
    overrides?: Partial<z.infer<typeof queryComplexityEnvSchema>>
  ): Promise<Result<z.infer<typeof queryComplexityEnvSchema>, DomainError>> {
    const config = QueryComplexityConfig.create(overrides);
    return config.initialize();
  }
}

/**
 * Configuration factory for dynamic service configuration
 */
export class ConfigFactory {
  static createForService(serviceName: string): ConfigService<z.ZodSchema> | null {
    switch (serviceName) {
      case 'gateway':
        return configBuilder(gatewayEnvSchema).withEnv().build();
      case 'users':
        return configBuilder(userServiceEnvSchema).withEnv().build();
      case 'products':
        return configBuilder(productServiceEnvSchema).withEnv().build();
      case 'orders':
        return configBuilder(orderServiceEnvSchema).withEnv().build();
      default:
        return null;
    }
  }

  static async initializeForService(
    serviceName: string
  ): Promise<Result<unknown, DomainError> | null> {
    const config = ConfigFactory.createForService(serviceName);
    if (!config) {
      return null;
    }
    return config.initialize();
  }
}

/**
 * Helper to get typed configuration in services
 */
export async function getServiceConfig<T extends 'gateway' | 'users' | 'products' | 'orders'>(
  service: T
): Promise<
  Result<
    T extends 'gateway'
      ? GatewayEnv
      : T extends 'users'
        ? UserServiceEnv
        : T extends 'products'
          ? ProductServiceEnv
          : T extends 'orders'
            ? OrderServiceEnv
            : never,
    DomainError
  >
> {
  switch (service) {
    case 'gateway':
      return GatewayConfig.initialize() as any;
    case 'users':
      return UserServiceConfig.initialize() as any;
    case 'products':
      return ProductServiceConfig.initialize() as any;
    case 'orders':
      return OrderServiceConfig.initialize() as any;
    default:
      throw new Error(`Unknown service: ${service}`);
  }
}
