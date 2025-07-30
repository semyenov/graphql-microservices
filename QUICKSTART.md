# Quick Start Guide

## Prerequisites

- Bun.sh installed (`curl -fsSL https://bun.sh/install | bash`)
- Docker and Docker Compose installed
- PostgreSQL client (optional, for direct database access)

## Initial Setup

1. **Clone and install dependencies:**
```bash
bun install
```

2. **Start databases (PostgreSQL and Redis):**
```bash
bun run docker:dev
```

3. **Set up databases and run migrations:**
```bash
bun run setup
```

4. **Start all services:**
```bash
bun run dev
```

## Verify Setup

1. Open GraphQL Playground: http://localhost:4000/graphql

2. Create a test user:
```graphql
mutation CreateTestUser {
  signUp(input: {
    username: "testuser"
    email: "test@example.com"
    password: "TestPass123"
    name: "Test User"
  }) {
    user {
      id
      username
      email
    }
    accessToken
    refreshToken
  }
}
```

3. Copy the `accessToken` from the response

4. Set the authorization header in Playground:
```json
{
  "Authorization": "Bearer YOUR_ACCESS_TOKEN_HERE"
}
```

5. Test authenticated query:
```graphql
query GetMyProfile {
  me {
    id
    username
    email
    role
    createdAt
  }
}
```

## Development Workflow

### Adding New Features

1. **Update Prisma Schema:**
```bash
# Edit services/[service]/prisma/schema.prisma
# Then generate client and migrate
cd services/[service]
bunx prisma generate
bunx prisma migrate dev --name your_migration_name
```

2. **Update GraphQL Schema:**
- Edit the service's `typeDefs` in `src/index.ts`
- Add new resolvers
- Update shared types if needed

3. **Test Your Changes:**
```bash
# Run tests
bun test

# Or test specific service
bun test services/users
```

### Common Commands

```bash
# View logs for specific service
bun run dev:users

# Access Prisma Studio (database GUI)
cd services/users && bunx prisma studio

# Format code
bun run lint:fix

# Type check
bun run typecheck
```

## Architecture Overview

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│   Gateway   │────▶│    Redis    │
│  (Port 4000)│     │   (Cache)   │
└──────┬──────┘     └─────────────┘
       │
       ├─────────────┬─────────────┬─────────────┐
       ▼             ▼             ▼             │
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│    Users    │ │  Products   │ │   Orders    │ │
│  (Port 4001)│ │ (Port 4002) │ │ (Port 4003) │ │
└──────┬──────┘ └──────┬──────┘ └──────┬──────┘ │
       │               │               │         │
       ▼               ▼               ▼         │
┌─────────────────────────────────────────────┐ │
│              PostgreSQL                     │ │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐    │ │
│  │users_db │  │products │  │orders_db│    │ │
│  └─────────┘  └─────────┘  └─────────┘    │ │
└─────────────────────────────────────────────┘ │
```

## Troubleshooting

### Services won't start
- Check if ports are already in use: `lsof -i :4000`
- Ensure Docker is running: `docker ps`
- Check logs: `docker-compose -f docker-compose.dev.yml logs`

### Database connection errors
- Verify PostgreSQL is running: `docker ps | grep postgres`
- Check DATABASE_URL in .env file
- Try restarting databases: `bun run docker:dev:down && bun run docker:dev`

### Authentication issues
- Ensure JWT_SECRET is set in .env
- Check token expiration
- Verify authorization header format: `Bearer <token>`

## Next Steps

1. Explore the API documentation in `API.md`
2. Review authentication flows in `API_AUTH.md`
3. Check development guide in `DEVELOPMENT.md`
4. Implement your own services following the patterns