#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAllServiceInfo, logError, logSuccess } from '@shared/utils';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Service descriptions
const serviceDescriptions: Record<string, string> = {
  users: 'Manages user accounts, authentication, and authorization',
  products: 'Handles product catalog, inventory, and stock management',
  orders: 'Manages order processing, status tracking, and fulfillment',
  gateway: 'Apollo Gateway that aggregates all subgraphs',
};

async function loadServiceSchemas() {
  const allServices = getAllServiceInfo();
  const services: Array<{ name: string; port: number; description: string; schema?: string }> = [];

  for (const [name, info] of Object.entries(allServices)) {
    if (name === 'gateway') continue; // Skip gateway for individual service docs

    const service = {
      name,
      port: info.port,
      description: serviceDescriptions[name] || `${name} service`,
      schema: undefined as string | undefined,
    };

    // Try to load schema from file
    const schemaPath = join(rootDir, 'schemas', `${name}.graphql`);
    if (existsSync(schemaPath)) {
      service.schema = readFileSync(schemaPath, 'utf-8');
    }

    services.push(service);
  }

  return services;
}

// Generate Markdown documentation
async function generateMarkdownDocs(): Promise<string> {
  const services = await loadServiceSchemas();
  let markdown = `# GraphQL API Documentation

This document provides comprehensive API documentation for the GraphQL microservices architecture.

## Table of Contents

1. [Overview](#overview)
2. [Services](#services)
3. [Authentication](#authentication)
4. [Rate Limiting](#rate-limiting)
5. [Subscriptions](#subscriptions)
6. [API Reference](#api-reference)
7. [Examples](#examples)

## Overview

This GraphQL API is built using Apollo Federation v2, allowing multiple services to work together as a unified graph.

### Base URL

\`\`\`
http://localhost:4000/graphql
\`\`\`

### Headers

| Header | Description | Required |
|--------|-------------|----------|
| Authorization | JWT Bearer token | Yes (except for public operations) |
| X-Correlation-ID | Request tracking ID | No |

## Services

`;

  services.forEach((service) => {
    markdown += `### ${service.name.charAt(0).toUpperCase() + service.name.slice(1)} Service

**Port**: ${service.port}  
**Description**: ${service.description}

`;
  });

  markdown += `## Authentication

Most operations require authentication using a JWT token. Public operations are marked with \`@public\` directive.

### Obtaining a Token

\`\`\`graphql
mutation SignIn {
  signIn(input: {
    username: "john.doe"
    password: "password123"
  }) {
    accessToken
    refreshToken
    user {
      id
      username
      email
      role
    }
  }
}
\`\`\`

### Using the Token

Include the token in the Authorization header:

\`\`\`
Authorization: Bearer YOUR_ACCESS_TOKEN
\`\`\`

### Refreshing Tokens

\`\`\`graphql
mutation RefreshToken {
  refreshToken(refreshToken: "YOUR_REFRESH_TOKEN") {
    accessToken
    refreshToken
  }
}
\`\`\`

## Rate Limiting

API operations are rate-limited to prevent abuse. Different limits apply to different operation types:

| Operation Type | Limit | Duration | Block Duration |
|----------------|-------|----------|----------------|
| Authentication | 5 requests | 5 minutes | 15 minutes |
| Mutations | 30 requests | 1 minute | 5 minutes |
| Queries | 100 requests | 1 minute | 1 minute |
| Public | 200 requests | 1 minute | 30 seconds |

## Subscriptions

Real-time updates are available through GraphQL subscriptions over WebSocket.

### Connection URL

\`\`\`
ws://localhost:4000/graphql
\`\`\`

### Available Subscriptions

#### User Events
- \`userCreated\` - New user registration
- \`userUpdated\` - User profile updates
- \`userDeactivated\` - User account deactivation

#### Product Events
- \`productCreated\` - New product added
- \`productUpdated\` - Product details changed
- \`productStockChanged\` - Inventory updates
- \`productDeactivated\` - Product removed from catalog

#### Order Events
- \`orderCreated\` - New order placed
- \`orderStatusChanged\` - Order status updates
- \`orderCancelled\` - Order cancellation
- \`orderRefunded\` - Order refund processed

## API Reference

`;

  // Add type definitions
  markdown += `### Types

`;

  // Parse types from schema files
  const typeDefinitions: string[] = [];

  services.forEach((service) => {
    if (service.schema) {
      // Extract type definitions using regex
      const typeRegex = /type\s+(\w+)(?:\s+@\w+(?:\([^)]*\))?)?\s*{[^}]+}/g;
      const enumRegex = /enum\s+(\w+)\s*{[^}]+}/g;
      const inputRegex = /input\s+(\w+)\s*{[^}]+}/g;

      let match: RegExpExecArray | null = null;

      match = typeRegex.exec(service.schema);
      while (match !== null) {
        if (
          !['Query', 'Mutation', 'Subscription'].includes(match[1] ?? '') &&
          !match[1]?.startsWith('__')
        ) {
          typeDefinitions.push(match[0]);
        }
        match = typeRegex.exec(service.schema);
      }

      match = enumRegex.exec(service.schema);
      while (match !== null) {
        typeDefinitions.push(match[0]);
        match = enumRegex.exec(service.schema);
      }

      match = inputRegex.exec(service.schema);
      while (match !== null) {
        typeDefinitions.push(match[0]);
        match = inputRegex.exec(service.schema);
      }
    }
  });

  // Remove duplicates and sort
  const uniqueTypes = [...new Set(typeDefinitions)].sort();

  uniqueTypes.forEach((typeDef) => {
    // Extract type name
    const nameMatch = typeDef.match(/(type|enum|input)\s+(\w+)/);
    if (nameMatch) {
      const typeName = nameMatch[2];

      // Clean the type definition (remove directives for display)
      const cleanedType = typeDef.replace(/@\w+(?:\([^)]*\))?/g, '');

      markdown += `#### ${typeName}

\`\`\`graphql
${cleanedType}
\`\`\`

`;
    }
  });

  // Add example queries
  markdown += `## Examples

### User Management

#### Create User Account

\`\`\`graphql
mutation SignUp {
  signUp(input: {
    username: "jane.doe"
    email: "jane@example.com"
    password: "SecurePass123!"
    name: "Jane Doe"
    phoneNumber: "+1234567890"
  }) {
    accessToken
    user {
      id
      username
      email
    }
  }
}
\`\`\`

#### Get Current User

\`\`\`graphql
query GetMe {
  me {
    id
    username
    email
    name
    role
    orders {
      id
      orderNumber
      total
      status
    }
  }
}
\`\`\`

### Product Management

#### List Products

\`\`\`graphql
query ListProducts {
  products(first: 10, category: "Electronics") {
    products {
      id
      name
      description
      price
      stock
      category
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
\`\`\`

#### Create Product

\`\`\`graphql
mutation CreateProduct {
  createProduct(input: {
    name: "Wireless Headphones"
    description: "High-quality Bluetooth headphones"
    price: 99.99
    stock: 100
    sku: "WH-001"
    category: "Electronics"
    tags: ["audio", "wireless", "bluetooth"]
  }) {
    id
    name
    price
  }
}
\`\`\`

### Order Management

#### Create Order

\`\`\`graphql
mutation CreateOrder {
  createOrder(input: {
    items: [
      {
        productId: "product-123"
        quantity: 2
        price: 99.99
      }
    ]
    shippingInfo: {
      address: "123 Main St"
      city: "New York"
      state: "NY"
      zipCode: "10001"
      country: "USA"
      phone: "+1234567890"
    }
  }) {
    id
    orderNumber
    total
    status
  }
}
\`\`\`

#### Track Order Status

\`\`\`graphql
subscription TrackOrder($orderId: ID!) {
  orderStatusChanged(orderId: $orderId) {
    id
    orderNumber
    status
    updatedAt
  }
}
\`\`\`

## Error Handling

### Error Format

\`\`\`json
{
  "errors": [
    {
      "message": "Error message",
      "extensions": {
        "code": "ERROR_CODE",
        "field": "fieldName",
        "additionalInfo": {}
      }
    }
  ]
}
\`\`\`

### Common Error Codes

| Code | Description |
|------|-------------|
| UNAUTHENTICATED | Missing or invalid authentication |
| FORBIDDEN | Insufficient permissions |
| NOT_FOUND | Resource not found |
| VALIDATION_ERROR | Input validation failed |
| RATE_LIMITED | Rate limit exceeded |
| INTERNAL_ERROR | Server error |

## Pagination

The API uses cursor-based pagination for list operations:

\`\`\`graphql
query GetProducts($cursor: String) {
  products(first: 20, after: $cursor) {
    products {
      id
      name
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
    totalCount
  }
}
\`\`\`

## Best Practices

1. **Use Fragments**: Reuse common field selections
2. **Request Only Needed Fields**: Minimize data transfer
3. **Handle Errors Gracefully**: Check for errors in responses
4. **Implement Retry Logic**: For transient failures
5. **Cache Appropriately**: Use Apollo Client caching
6. **Monitor Rate Limits**: Track usage to avoid blocks

## SDK Examples

### TypeScript/JavaScript

\`\`\`typescript
import { ApolloClient, InMemoryCache, gql } from '@apollo/client';

const client = new ApolloClient({
  uri: 'http://localhost:4000/graphql',
  cache: new InMemoryCache(),
  headers: {
    authorization: \`Bearer \${getAuthToken()}\`,
  },
});

// Query example
const GET_PRODUCTS = gql\`
  query GetProducts {
    products(first: 10) {
      products {
        id
        name
        price
      }
    }
  }
\`;

const { data } = await client.query({ query: GET_PRODUCTS });
\`\`\`

### React

\`\`\`typescript
import { useQuery, useMutation } from '@apollo/client';

function ProductList() {
  const { data, loading, error } = useQuery(GET_PRODUCTS);
  const [createProduct] = useMutation(CREATE_PRODUCT);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {data.products.products.map(product => (
        <li key={product.id}>{product.name} - \${product.price}</li>
      ))}
    </ul>
  );
}
\`\`\`

## Additional Resources

- [GraphQL Documentation](https://graphql.org/learn/)
- [Apollo Federation](https://www.apollographql.com/docs/federation/)
- [Apollo Client](https://www.apollographql.com/docs/react/)
`;

  return markdown;
}

// Generate HTML documentation using GraphQL Voyager
function generateHtmlDocs(): string {
  // For now, generate a simple HTML documentation
  // GraphQL Voyager requires a valid GraphQL schema without federation directives

  return `<!DOCTYPE html>
<html>
<head>
  <title>GraphQL API Documentation</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    #voyager {
      height: 100vh;
    }
    .header {
      background: #1e1e1e;
      color: white;
      padding: 1rem;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 1.5rem;
    }
  </style>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/graphql-voyager/dist/voyager.css" />
</head>
<body>
  <div class="header">
    <h1>GraphQL Microservices API Documentation</h1>
  </div>
  <div id="voyager"></div>

  <script>
    // Placeholder for GraphQL Voyager
    // To use Voyager, run the gateway and use the introspection endpoint
    document.getElementById('voyager').innerHTML = \`
      <div style="padding: 2rem; text-align: center;">
        <h2>Interactive Schema Explorer</h2>
        <p>To view the interactive schema explorer:</p>
        <ol style="text-align: left; max-width: 600px; margin: 2rem auto;">
          <li>Start the gateway service: <code>bun run dev:gateway</code></li>
          <li>Visit the GraphQL Playground: <a href="http://localhost:4000/graphql">http://localhost:4000/graphql</a></li>
          <li>Use the built-in schema explorer in the playground</li>
        </ol>
        <p>Alternatively, use GraphQL Voyager with the introspection endpoint.</p>
      </div>
    \`;
  </script>
</body>
</html>`;
}

// Generate OpenAPI spec from GraphQL schema
function generateOpenApiSpec(): object {
  // Gateway schema is available in schemas/combined.graphql if needed for OpenAPI generation

  return {
    openapi: '3.0.0',
    info: {
      title: 'GraphQL Microservices API',
      version: '1.0.0',
      description: 'A federated GraphQL API for microservices',
    },
    servers: [
      {
        url: 'http://localhost:4000/graphql',
        description: 'Development server',
      },
    ],
    paths: {
      '/graphql': {
        post: {
          summary: 'GraphQL endpoint',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['query'],
                  properties: {
                    query: {
                      type: 'string',
                      description: 'GraphQL query',
                    },
                    variables: {
                      type: 'object',
                      description: 'Query variables',
                    },
                    operationName: {
                      type: 'string',
                      description: 'Operation name',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Successful response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                      },
                      errors: {
                        type: 'array',
                        items: {
                          type: 'object',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          security: [
            {
              bearerAuth: [],
            },
          ],
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  };
}

// Main function
async function generateDocs() {
  console.log('📚 Generating API documentation...\n');

  const docsDir = join(rootDir, 'docs', 'api');
  mkdirSync(docsDir, { recursive: true });

  try {
    // Generate Markdown documentation
    const markdown = await generateMarkdownDocs();
    const markdownPath = join(docsDir, 'README.md');
    writeFileSync(markdownPath, markdown);
    logSuccess(`Generated Markdown documentation: ${markdownPath}`);

    // Generate HTML documentation
    const html = generateHtmlDocs();
    const htmlPath = join(docsDir, 'index.html');
    writeFileSync(htmlPath, html);
    logSuccess(`Generated HTML documentation: ${htmlPath}`);

    // Generate OpenAPI spec
    const openApiSpec = generateOpenApiSpec();
    const openApiPath = join(docsDir, 'openapi.json');
    writeFileSync(openApiPath, JSON.stringify(openApiSpec, null, 2));
    logSuccess(`Generated OpenAPI specification: ${openApiPath}`);

    // Generate Postman collection
    const postmanCollection = {
      info: {
        name: 'GraphQL Microservices',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: [
        {
          name: 'Authentication',
          item: [
            {
              name: 'Sign Up',
              request: {
                method: 'POST',
                header: [{ key: 'Content-Type', value: 'application/json' }],
                body: {
                  mode: 'graphql',
                  graphql: {
                    query: `mutation SignUp($input: SignUpInput!) {
  signUp(input: $input) {
    accessToken
    refreshToken
    user {
      id
      username
      email
    }
  }
}`,
                    variables: JSON.stringify(
                      {
                        input: {
                          username: 'testuser',
                          email: 'test@example.com',
                          password: 'password123',
                          name: 'Test User',
                        },
                      },
                      null,
                      2
                    ),
                  },
                },
                url: {
                  raw: 'http://localhost:4000/graphql',
                  protocol: 'http',
                  host: ['localhost'],
                  port: '4000',
                  path: ['graphql'],
                },
              },
            },
          ],
        },
      ],
    };

    const postmanPath = join(docsDir, 'postman-collection.json');
    writeFileSync(postmanPath, JSON.stringify(postmanCollection, null, 2));
    logSuccess(`Generated Postman collection: ${postmanPath}`);

    console.log('\n📖 Documentation generated successfully!');
    console.log('   View HTML docs by opening:', htmlPath);
  } catch (error) {
    logError(`Documentation generation failed: ${error}`);
    process.exit(1);
  }
}

// Run the script
generateDocs().catch((error) => {
  logError(`Script failed: ${error}`);
  process.exit(1);
});
