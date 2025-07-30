# GraphQL Microservices Scripts

This directory contains utility scripts for managing the GraphQL microservices.

## Available Scripts

### `dev.ts` - Development Server

Starts all microservices with auto-discovery:

```bash
bun run dev
```

Features:
- Auto-discovers services from the `services/` directory
- Assigns consistent ports (gateway: 4000, users: 4001, products: 4002, orders: 4003)
- Starts services in correct order (regular services first, gateway last)
- Graceful shutdown on Ctrl+C

### `export-schema.ts` - Schema Export

Exports GraphQL schemas from running services:

```bash
# Export gateway schema (default)
bun run schema:export

# Export specific service
bun run schema:export -s users

# Export all services
bun run schema:export -s all

# Export only SDL format
bun run schema:export -f sdl

# Export to custom directory
bun run schema:export -o ./my-schemas
```

Options:
- `-s, --service <name>`: Service to export (gateway, users, products, orders, all)
- `-f, --format <type>`: Export format (sdl, json, both)
- `-o, --output <dir>`: Output directory (default: ./schemas)

Formats:
- **SDL**: Schema Definition Language (.graphql files)
- **JSON**: GraphQL introspection format (.json files)

### `setup-db.ts` - Database Setup

Sets up PostgreSQL databases for each service:

```bash
bun run setup
```

Creates databases:
- `users_db` - Users service database
- `products_db` - Products service database  
- `orders_db` - Orders service database

### `seed.ts` - Database Seeding

Seeds databases with sample data:

```bash
bun run seed
```

Creates:
- 2 users (admin and regular user)
- 10 sample products
- Sample orders

### `introspect-schema.ts` - Schema Introspection

Fetches and saves the federated schema from the gateway:

```bash
bun run schema:introspect
```

Saves to `schema.json` in the project root.

### `check-schemas.ts` - Schema Validation

Checks what types each service exposes:

```bash
bun run scripts/check-schemas.ts
```

Useful for debugging federation issues.

## Requirements

- All scripts require Bun runtime
- Database scripts require Docker Compose to be running
- Schema export scripts require services to be running