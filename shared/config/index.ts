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
  JWT_EXPIRES_IN: z
    .string()
    .transform((val) => ms(val as StringValue) ?? 15 * 60 * 1000)
    .default(15 * 60 * 1000),
  JWT_REFRESH_EXPIRES_IN: z
    .string()
    .transform((val) => ms(val as StringValue) ?? 7 * 24 * 60 * 60 * 1000)
    .default(7 * 24 * 60 * 60 * 1000),
  JWT_ACCESS_PRIVATE_KEY: z.string().optional(),
  JWT_ACCESS_PUBLIC_KEY: z.string().optional(),
  JWT_REFRESH_PRIVATE_KEY: z.string().optional(),
  JWT_REFRESH_PUBLIC_KEY: z.string().optional(),
});

// OpenTelemetry configuration schema
const observabilityEnvSchema = z.object({
  OTEL_SERVICE_NAME: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default('http://localhost:4318'),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      try {
        return JSON.parse(val) as Record<string, string>;
      } catch {
        // Parse key=value,key2=value2 format
        const headers: Record<string, string> = {};
        val.split(',').forEach((pair) => {
          const [key, value] = pair.split('=');
          if (key && value) {
            headers[key.trim()] = value.trim();
          }
        });
        return headers;
      }
    }),
  OTEL_TRACES_ENABLED: z
    .string()
    .transform((val) => val === 'true')
    .default(true),
  OTEL_METRICS_ENABLED: z
    .string()
    .transform((val) => val === 'true')
    .default(true),
  OTEL_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// Query complexity configuration schema
const queryComplexityEnvSchema = z.object({
  QUERY_MAX_COMPLEXITY: z.string().transform(Number).default(1000),
  QUERY_MAX_DEPTH: z.string().transform(Number).default(10),
  QUERY_COMPLEXITY_ENABLED: z
    .string()
    .transform((val) => val === 'true')
    .default(true),
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

// Export observability schema separately for the observability package
export { observabilityEnvSchema };

// Export query complexity schema separately for the query complexity package
export { queryComplexityEnvSchema };

// Add observability to service schemas for services that want built-in observability
export const userServiceEnvSchemaWithObservability = z.object({
  ...userServiceEnvSchema.shape,
  ...observabilityEnvSchema.shape,
});

export const productServiceEnvSchemaWithObservability = z.object({
  ...productServiceEnvSchema.shape,
  ...observabilityEnvSchema.shape,
});

export const orderServiceEnvSchemaWithObservability = z.object({
  ...orderServiceEnvSchema.shape,
  ...observabilityEnvSchema.shape,
});

export const gatewayEnvSchemaWithObservability = z.object({
  ...gatewayEnvSchema.shape,
  ...observabilityEnvSchema.shape,
});

// Type exports
export type GatewayEnv = z.infer<typeof gatewayEnvSchema>;
export type UserServiceEnv = z.infer<typeof userServiceEnvSchema>;
export type ProductServiceEnv = z.infer<typeof productServiceEnvSchema>;
export type OrderServiceEnv = z.infer<typeof orderServiceEnvSchema>;
export type ObservabilityEnv = z.infer<typeof observabilityEnvSchema>;

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
