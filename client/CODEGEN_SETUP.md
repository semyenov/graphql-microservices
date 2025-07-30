# GraphQL Codegen Setup

This document describes the GraphQL codegen configuration for the client package.

## Overview

The GraphQL Codegen is configured to:
1. Extract schemas from service TypeScript files (using template literals)
2. Clean the schemas (remove custom directives like `@auth`, `@public`)
3. Generate TypeScript types for both services and client

## Configuration

The `codegen.yml` file is configured to:
- Use extracted and cleaned schema files from the `schemas/` directory
- Look for GraphQL operations in `client/src/**/*.ts` files
- Generate types for each service and client operations

## Scripts

### Update All Schemas and Types
```bash
# Run this command to update all schemas and regenerate types
bun run schema:update
```

This command runs three steps:
1. Extracts schemas from service TypeScript files
2. Cleans the schemas (removes custom directives)
3. Runs GraphQL Codegen

### Individual Scripts

```bash
# Extract schemas from TypeScript files
bun run scripts/extract-schemas.ts

# Clean schemas (remove custom directives)
bun run scripts/clean-schemas.ts

# Run codegen (requires cleaned schemas)
bun run codegen

# Watch mode for codegen
bun run codegen:watch
```

## Generated Files

- `services/users/src/generated/graphql.ts` - Types for Users service
- `services/products/src/generated/graphql.ts` - Types for Products service
- `services/orders/src/generated/graphql.ts` - Types for Orders service
- `shared/graphql/generated/client-types.ts` - Types for client operations
- `schemas/*.graphql` - Extracted raw schemas
- `schemas/*-clean.graphql` - Cleaned schemas used by codegen

## Workflow

1. When you modify a service schema (in the `typeDefs` template literal):
   ```bash
   bun run schema:update
   ```

2. When you add/modify client queries or mutations:
   ```bash
   bun run codegen
   ```

3. For development with auto-regeneration:
   ```bash
   bun run codegen:watch
   ```

## Troubleshooting

### Common Issues

1. **"Cannot query field X on type Y"** - The client query doesn't match the schema. Check:
   - Field names are correct
   - You're querying the right type (e.g., `ProductsPage` has a `products` field, not direct product fields)
   - Arguments match the schema definition

2. **"Unknown directive @auth"** - Run `bun run schema:update` to clean the schemas

3. **Generated files are empty** - Ensure:
   - The schema files exist in `schemas/` directory
   - The TypeScript files have proper `gql` template literals
   - Run `bun run schema:update` to regenerate everything

## Adding a New Service

1. Create the service with a `typeDefs` using `gql` template literal
2. Add the service to `scripts/extract-schemas.ts`
3. Update `codegen.yml` to include the new schema and generate location
4. Run `bun run schema:update`