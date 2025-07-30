import ms, { type StringValue } from 'ms';
import { z } from 'zod';

// Base environment schema shared by all services
const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default(4000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// Database configuration schema
const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
});

// Redis configuration schema
const redisEnvSchema = z.object({
  REDIS_URL: z.url().optional(),
});

// JWT configuration schema
const jwtEnvSchema = z.object({
  JWT_SECRET: z.string().min(32).default('your-super-secret-jwt-key-change-this-in-production'),
  JWT_EXPIRES_IN: z
    .string()
    .default('7d')
    .transform((val) => ms(val as StringValue)),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32)
    .default('your-super-secret-refresh-key-change-this-in-production'),
  JWT_REFRESH_EXPIRES_IN: z
    .string()
    .default('30d')
    .transform((val) => ms(val as StringValue)),
});

// Service-specific schemas
export const gatewayEnvSchema = z.object({
  ...baseEnvSchema.shape,
  ...redisEnvSchema.shape,
  SUBGRAPH_URLS: z.string().optional(),
  INTROSPECTION_ENABLED: z
    .string()
    .transform((val) => val === 'true')
    .default(true),
  PLAYGROUND_ENABLED: z
    .string()
    .transform((val) => val === 'true')
    .default(true),
});

export const userServiceEnvSchema = z.object({
  ...baseEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...redisEnvSchema.shape,
  ...jwtEnvSchema.shape,
});

export const productServiceEnvSchema = z.object({
  ...baseEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...redisEnvSchema.shape,
});

export const orderServiceEnvSchema = z.object({
  ...baseEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...redisEnvSchema.shape,
});

// Type exports
export type GatewayEnv = z.infer<typeof gatewayEnvSchema>;
export type UserServiceEnv = z.infer<typeof userServiceEnvSchema>;
export type ProductServiceEnv = z.infer<typeof productServiceEnvSchema>;
export type OrderServiceEnv = z.infer<typeof orderServiceEnvSchema>;

// Helper function to parse and validate environment variables
export function parseEnv<T>(schema: z.ZodSchema<T>): T {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}
