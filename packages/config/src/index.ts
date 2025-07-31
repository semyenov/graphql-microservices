import { z } from 'zod';

// Re-export all schemas and types from schemas.ts for backward compatibility
export * from './schemas.js';

// Helper function to parse and validate environment variables
// This is kept for backward compatibility but using c12 config is recommended
export function parseEnv<T>(schema: z.ZodSchema<T>): T {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(z.treeifyError(result.error));
    process.exit(1);
  }

  return result.data;
}

// Export c12-based config loaders
export {
  type ConfigContext,
  type ConfigOptions,
  loadGatewayConfig,
  loadGatewayConfigWithObservability,
  loadOrderServiceConfig,
  loadOrderServiceConfigWithObservability,
  loadProductServiceConfig,
  loadProductServiceConfigWithObservability,
  loadUserServiceConfig,
  loadUserServiceConfigWithObservability,
} from './c12.js';
