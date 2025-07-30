# GraphQL Microservices Documentation

Welcome to the comprehensive documentation for the GraphQL Microservices architecture.

## Documentation Index

### API Documentation
- [API Reference](./api/README.md) - Complete API documentation with examples
- [Interactive Documentation](./api/index.html) - HTML-based interactive docs
- [OpenAPI Specification](./api/openapi.json) - OpenAPI 3.0 specification
- [Postman Collection](./api/postman-collection.json) - Ready-to-use Postman collection

### Feature Documentation
- [Subscriptions](./SUBSCRIPTIONS.md) - Real-time updates with GraphQL subscriptions
- [Rate Limiting](./RATE_LIMITING.md) - API rate limiting implementation
- [Authentication & Authorization](./AUTH.md) - JWT-based authentication system

### Architecture
- [Federation](./FEDERATION.md) - Apollo Federation v2 architecture
- [Caching](./CACHING.md) - Redis caching strategies
- [Database Design](./DATABASE.md) - PostgreSQL database schemas

## Quick Links

### Getting Started
1. **Installation**: See main [README.md](../README.md)
2. **Development**: Run `bun run dev` to start all services
3. **API Playground**: Visit http://localhost:4000/graphql

### Key Features
- ✅ Apollo Federation v2
- ✅ JWT Authentication with refresh tokens
- ✅ Role-based access control
- ✅ Redis caching
- ✅ GraphQL subscriptions
- ✅ Rate limiting
- ✅ DataLoader for N+1 prevention
- ✅ TypeScript with strict typing
- ✅ Prisma ORM
- ✅ Docker support

### Services
1. **Gateway** (Port 4000) - Apollo Gateway
2. **Users** (Port 4001) - Authentication & user management
3. **Products** (Port 4002) - Product catalog
4. **Orders** (Port 4003) - Order processing

## Development Workflow

### Schema Changes
1. Modify service schema in `services/[service]/src/index.ts`
2. Extract schemas: `bun run scripts/extract-schemas.ts`
3. Update types: `bun run schema:update`
4. Generate docs: `bun run docs:generate`

### Adding Features
1. Create feature branch
2. Implement changes with tests
3. Update documentation
4. Run linting: `bun run lint`
5. Run type checking: `bun run typecheck`

## Tools & Scripts

### Schema Management
- `bun run schema:introspect` - Generate introspection from gateway
- `bun run schema:export` - Export schemas in various formats
- `bun run schema:update` - Update all schema-related files

### Documentation
- `bun run docs:generate` - Generate API documentation
- View docs at `/docs/api/index.html`

### Development
- `bun run dev` - Start all services
- `bun run dev:gateway` - Start gateway only
- `bun run build` - Build all services
- `bun test` - Run tests

## Best Practices

### GraphQL Schema Design
- Use federation directives appropriately
- Keep schemas focused on service boundaries
- Use shared types with `@shareable`
- Implement proper error handling

### Security
- Always validate input
- Use authentication directives
- Implement rate limiting
- Follow OWASP guidelines

### Performance
- Use DataLoader for batch loading
- Implement caching strategies
- Monitor query complexity
- Use pagination for lists

## Troubleshooting

### Common Issues
1. **Port conflicts**: Kill processes or change ports in `.env`
2. **Database connection**: Ensure PostgreSQL/Redis are running
3. **Type errors**: Run `bun run typecheck`
4. **Schema conflicts**: Check federation directives

### Debug Mode
Set `DEBUG=*` environment variable for verbose logging.

## Contributing

1. Follow the code style (enforced by Biome)
2. Write tests for new features
3. Update documentation
4. Submit PR with clear description

## Resources

- [GraphQL Best Practices](https://graphql.org/learn/best-practices/)
- [Apollo Federation Docs](https://www.apollographql.com/docs/federation/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Bun Documentation](https://bun.sh/docs)