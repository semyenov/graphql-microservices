# Configuration Management with c12

This package provides configuration management for all GraphQL microservices using [c12](https://github.com/unjs/c12), a smart configuration loader with multi-source support, environment-specific overrides, and TypeScript validation via Zod schemas.

## Features

- 🔧 **Multi-source configuration**: Load from files, environment variables, and more
- 🌍 **Environment-specific overrides**: Different configs for dev, staging, production
- 📁 **File-based configuration**: Use `.config.ts` files with full TypeScript support
- ✅ **Schema validation**: All configs validated with Zod schemas
- 🔄 **Backward compatible**: Existing `parseEnv` function still works
- 🎯 **Type-safe**: Full TypeScript support with auto-completion
- 📦 **Extends support**: Share common configuration between services

## Usage

### Using c12 Config Loaders (Recommended)

```typescript
import { loadUserServiceConfig } from "@graphql-microservices/config";

// Load configuration with c12
const config = await loadUserServiceConfig({
  // Optional: override config file name
  configFile: "users.config",

  // Optional: provide defaults
  defaultConfig: {
    PORT: 4001,
    LOG_LEVEL: "debug",
  },

  // Optional: runtime overrides
  overrides: {
    DATABASE_URL: "postgresql://localhost/test_db",
  },
});

// Config is fully typed!
console.log(config.PORT); // number
console.log(config.DATABASE_URL); // string | undefined
```

### Using Legacy parseEnv (Backward Compatible)

```typescript
import { parseEnv, userServiceEnvSchema } from "@graphql-microservices/config";

// Parse environment variables only
const config = parseEnv(userServiceEnvSchema);
```

## Configuration Files

Create configuration files in your project root:

### `gateway.config.ts`

```typescript
import { defineConfig } from "c12";

export default defineConfig({
  PORT: 4000,
  NODE_ENV: "development",
  REDIS_URL: "redis://localhost:6379",

  // Production overrides
  $production: {
    NODE_ENV: "production",
    LOG_LEVEL: "warn",
    INTROSPECTION_ENABLED: false,
  },

  // Extend from shared config
  $extends: "./shared/base.config",
});
```

### Environment-specific Overrides

c12 supports environment-specific sections:

```typescript
export default defineConfig({
  // Base config
  PORT: 4001,

  // Production overrides when NODE_ENV=production
  $production: {
    LOG_LEVEL: "warn",
  },

  // Staging overrides when NODE_ENV=staging
  $staging: {
    LOG_LEVEL: "info",
  },

  // Test overrides when NODE_ENV=test
  $test: {
    PORT: 5001,
    DATABASE_URL: "postgresql://localhost/test_db",
  },
});
```

## Configuration Priority

Configurations are loaded and merged in the following order (highest priority first):

1. Runtime overrides (passed to load function)
2. Environment variables
3. `.env` files (via Bun's built-in support)
4. Config files (`.config.ts`, `.config.js`, etc.)
5. RC files (`.graphqlmsrc`, `~/.graphqlmsrc`)
6. Default config (passed to load function)
7. Extended configs (via `$extends`)

## Available Config Loaders

- `loadGatewayConfig()` - Gateway service configuration
- `loadUserServiceConfig()` - Users service configuration
- `loadProductServiceConfig()` - Products service configuration
- `loadOrderServiceConfig()` - Orders service configuration

With observability:

- `loadGatewayConfigWithObservability()`
- `loadUserServiceConfigWithObservability()`
- `loadProductServiceConfigWithObservability()`
- `loadOrderServiceConfigWithObservability()`

## Schema Definitions

All configuration schemas are defined using Zod and exported from `@graphql-microservices/config/schemas`:

```typescript
import {
  gatewayEnvSchema,
  userServiceEnvSchema,
  productServiceEnvSchema,
  orderServiceEnvSchema,
  observabilityEnvSchema,
  queryComplexityEnvSchema,
} from "@graphql-microservices/config/schemas";
```

## Extending Configurations

Share common configuration between services:

```typescript
// shared/base.config.ts
export default defineConfig({
  NODE_ENV: "development",
  LOG_LEVEL: "info",
  REDIS_URL: "redis://localhost:6379",
});

// users.config.ts
export default defineConfig({
  $extends: "./shared/base.config",
  PORT: 4001,
  DATABASE_URL: "postgresql://localhost/users_db",
});
```

## Remote Configuration

c12 supports loading configuration from remote sources:

```typescript
export default defineConfig({
  // Extend from a git repository
  $extends: "github:myorg/shared-configs/base.config.ts",

  // Or from any URL
  $extends: "https://config.example.com/base.json",
});
```

## Migration Guide

To migrate from environment-only configuration:

1. Keep existing code unchanged (backward compatible)
2. Create `.config.ts` files for each service
3. Gradually replace `parseEnv()` with `loadServiceConfig()`
4. Remove hardcoded defaults from code (move to config files)

### Before:

```typescript
const config = parseEnv(userServiceEnvSchema);
const port = config.PORT || 4001; // Default in code
```

### After:

```typescript
const config = await loadUserServiceConfig();
const port = config.PORT; // Default in config file
```

## Best Practices

1. **Use config files for defaults**: Keep environment variables for secrets only
2. **Share common config**: Use `$extends` to avoid duplication
3. **Environment-specific overrides**: Use `$production`, `$staging`, etc.
4. **Type safety**: Always use the typed config loaders
5. **Validation**: Configs are automatically validated with Zod schemas

## Advanced Features

### Custom Config Loader

Create a custom config loader for a new service:

```typescript
import { loadConfig } from "c12";
import { z } from "zod";

const myServiceSchema = z.object({
  PORT: z.number(),
  CUSTOM_OPTION: z.string(),
});

export async function loadMyServiceConfig() {
  const { config } = await loadConfig({
    name: "graphql-microservices",
    configFile: "myservice.config",

    defaults: {
      PORT: 4004,
      CUSTOM_OPTION: "default",
    },
  });

  return myServiceSchema.parse(config);
}
```

### Config Layers

Inspect how your configuration was resolved:

```typescript
const { config, layers } = await loadConfig({
  name: "graphql-microservices",
});

// See which files contributed to the final config
console.log(layers);
```
