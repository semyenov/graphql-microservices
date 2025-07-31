# @graphql-microservices/builder

A high-performance build tool for GraphQL microservices using [tsdown](https://github.com/rolldown/tsdown) and [Rolldown](https://rolldown.rs/).

## Features

- 🚀 **Fast Builds**: Powered by Rolldown for blazing-fast bundling
- 📦 **TypeScript Support**: Full TypeScript support with declaration files
- 🎯 **Optimized Output**: Tree-shaking, minification, and source maps
- 🔧 **Zero Config**: Pre-configured for GraphQL microservices
- 🔄 **Watch Mode**: Development mode with file watching
- 📊 **Multiple Formats**: Support for ESM and CJS output formats

## Installation

This package is part of the GraphQL microservices workspace and is automatically available when you install dependencies:

```bash
bun install
```

## Usage

### Build All Services

```typescript
import { buildAllServices } from '@graphql-microservices/builder';

await buildAllServices({
  minify: true,
  sourcemap: true,
});
```

### Build Specific Service

```typescript
import { buildSpecificService } from '@graphql-microservices/builder';

await buildSpecificService('users', {
  format: 'esm',
  minify: false,
  sourcemap: true,
});
```

### Custom Configuration

```typescript
import { createServiceConfig, build } from '@graphql-microservices/builder';
import { build as tsdownBuild } from 'tsdown';

const config = createServiceConfig('/path/to/service', {
  format: ['esm', 'cjs'],
  minify: true,
});

await tsdownBuild(config);
```

## API Reference

### `buildAllServices(options?: BuildOptions)`

Builds all discovered services in the workspace.

### `buildSpecificService(serviceName: string, options?: BuildOptions)`

Builds a specific service by name.

### `buildService(service: ServiceBuildConfig, options?: BuildOptions)`

Builds a single service with the provided configuration.

### `createServiceConfig(servicePath: string, options?: BuildOptions)`

Creates a tsdown configuration for a service.

## Build Options

```typescript
interface BuildOptions {
  service?: string;        // Service name (for specific builds)
  watch?: boolean;         // Enable watch mode
  format?: 'esm' | 'cjs' | ('esm' | 'cjs')[];  // Output format(s)
  minify?: boolean;        // Enable minification
  sourcemap?: boolean;     // Generate source maps
  dts?: boolean;           // Generate TypeScript declarations (experimental)
}
```

## Default Configuration

The builder comes with sensible defaults optimized for GraphQL microservices:

- **Platform**: Node.js
- **Target**: Node 20
- **Format**: ESM
- **Source Maps**: Enabled
- **Minification**: Disabled (enable for production)
- **Declaration Files**: Disabled by default (tsdown has issues with isolated declarations)
- **Clean**: Output directory is cleaned before each build
- **Shims**: ESM shims for `__dirname` and `__filename`

## External Dependencies

The following dependencies are marked as external and won't be bundled:

- `@graphql-microservices/*` (workspace packages)
- `@apollo/*` (Apollo GraphQL packages)
- `@prisma/*` (Prisma ORM)
- `graphql`
- `dataloader`

## Scripts

The root package.json includes convenient scripts:

```bash
# Build all packages (including this builder)
bun run build:packages

# Build all services using this builder
bun run build:services

# Generate TypeScript declaration files (alternative method)
bun run build:types

# Build everything
bun run build:all
```

## Development

To work on the builder itself:

```bash
cd packages/builder
bun run dev    # Watch mode
bun run build  # Production build
```

## Integration with CI/CD

The builder can be easily integrated into CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Build Services
  run: bun run build:all
  env:
    NODE_ENV: production
```

## TypeScript Declaration Files

Due to tsdown's enforcement of TypeScript's isolated declarations, declaration file generation is disabled by default. You have two options:

### Option 1: Use the Type Generation Script

```bash
# Generate types for all services
bun run build:types
```

This uses the TypeScript compiler directly to generate `.d.ts` files in each service's `dist` folder.

### Option 2: Enable in Build (Experimental)

```typescript
await buildAllServices({
  dts: true, // May fail with isolated declarations errors
});
```

## Troubleshooting

### Build Errors

If you encounter build errors:

1. Ensure all dependencies are installed: `bun install`
2. Check that TypeScript files are valid: `bun run typecheck`
3. Verify service structure matches expected format

### Declaration File Errors

If you see "Variable must have an explicit type annotation with --isolatedDeclarations":

1. Use the separate type generation script: `bun run build:types`
2. Or add explicit type annotations to exported variables
3. Or disable declaration generation and rely on TypeScript inference

### Performance

For optimal build performance:

- Use `minify: false` during development
- Enable `minify: true` only for production builds
- Consider using `format: 'esm'` only if you don't need CJS

## License

Part of the GraphQL Microservices project.