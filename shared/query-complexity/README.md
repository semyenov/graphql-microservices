# GraphQL Query Complexity Analysis

This package provides query complexity and depth analysis for GraphQL services to prevent expensive queries from overwhelming your servers.

## Features

- **Query Complexity Calculation**: Assign costs to fields and calculate total query complexity
- **Query Depth Limiting**: Prevent deeply nested queries
- **Directive-based Configuration**: Use `@complexity` directive in your schema
- **Programmatic Configuration**: Set complexity via field extensions
- **Apollo Server Plugin**: Easy integration with Apollo Server
- **Customizable Error Messages**: Provide helpful feedback to clients
- **Flexible Estimators**: Multiple strategies for calculating complexity

## Installation

```bash
bun add @graphql-microservices/shared-query-complexity
```

## Quick Start

### 1. Add Complexity to Your Schema

```graphql
directive @complexity(
  value: Int
  multipliers: [String!]
) on FIELD_DEFINITION

type User {
  id: ID! @complexity(value: 1)
  username: String! @complexity(value: 1)
  
  # List fields multiply by their limit argument
  posts(limit: Int = 10): [Post!]! @complexity(value: 1, multipliers: ["limit"])
  
  # Expensive computed fields
  recommendations: [Product!]! @complexity(value: 100)
}

type Query {
  # Simple lookup
  user(id: ID!): User @complexity(value: 1)
  
  # Paginated query
  users(first: Int = 20): [User!]! @complexity(value: 1, multipliers: ["first"])
  
  # Search is more expensive
  searchUsers(query: String!): [User!]! @complexity(value: 10)
}
```

### 2. Add Plugin to Apollo Server

```typescript
import { ApolloServer } from '@apollo/server';
import { createQueryComplexityPlugin, createComplexityValidationRules } from '@graphql-microservices/shared-query-complexity';

const server = new ApolloServer({
  schema,
  plugins: [
    createQueryComplexityPlugin(schema, {
      maximumComplexity: 1000,
      maximumDepth: 10,
    }),
  ],
  validationRules: [
    ...createComplexityValidationRules(schema, {
      maximumComplexity: 1000,
      maximumDepth: 10,
    }),
  ],
});
```

## Configuration Options

```typescript
interface QueryComplexityConfig {
  // Maximum allowed query complexity score (default: 1000)
  maximumComplexity?: number;
  
  // Maximum allowed query depth (default: 10)
  maximumDepth?: number;
  
  // Custom scalar complexity values
  scalarCost?: Record<string, number>;
  
  // Include introspection in complexity calculation (default: false)
  includeIntrospection?: boolean;
  
  // Log rejected queries (default: true)
  logRejectedQueries?: boolean;
  
  // Custom error message
  customErrorMessage?: (complexity: number, maximum: number) => string;
  
  // Callback when query is rejected
  onQueryRejected?: (complexity: number, query: string) => void;
}
```

## Complexity Calculation

### Directive-based

```graphql
# Fixed cost
field: String @complexity(value: 5)

# Multiplied by argument
users(limit: Int!): [User!]! @complexity(value: 1, multipliers: ["limit"])

# Multiple multipliers
matrix(rows: Int!, cols: Int!): [[Int!]!]! @complexity(value: 1, multipliers: ["rows", "cols"])
```

### Programmatic

```typescript
import { fieldComplexityConfig } from '@graphql-microservices/shared-query-complexity';

const resolvers = {
  Query: {
    users: {
      resolve: (parent, args, context) => { /* ... */ },
      ...fieldComplexityConfig.connection(20), // Default limit 20
    },
    searchProducts: {
      resolve: (parent, args, context) => { /* ... */ },
      ...fieldComplexityConfig.search(10), // Base cost 10
    },
  },
  Mutation: {
    bulkUpdate: {
      resolve: (parent, args, context) => { /* ... */ },
      ...fieldComplexityConfig.mutation(5), // Multiplies by array size
    },
  },
};
```

## Common Patterns

### Simple Field
```graphql
type User {
  id: ID! @complexity(value: 1)
  name: String! @complexity(value: 1)
}
```

### Paginated List
```graphql
type Query {
  # Complexity = 1 * min(first, 100)
  users(first: Int = 20): [User!]! @complexity(value: 1, multipliers: ["first"])
}
```

### Nested Relations
```graphql
type User {
  # Complexity = 2 * min(limit, 50)
  posts(limit: Int = 10): [Post!]! @complexity(value: 2, multipliers: ["limit"])
}

type Post {
  # Complexity = 1 * min(limit, 20)
  comments(limit: Int = 5): [Comment!]! @complexity(value: 1, multipliers: ["limit"])
}
```

### Expensive Operations
```graphql
type Query {
  # Fixed high cost
  generateReport(type: ReportType!): Report! @complexity(value: 500)
  
  # Analytics queries
  analytics(dateRange: DateRange!): Analytics! @complexity(value: 200)
}
```

## Examples

### Simple Query (Complexity: 3)
```graphql
query {
  user(id: "123") {  # 1
    id               # 1
    name             # 1
  }
}
```

### Paginated Query (Complexity: 41)
```graphql
query {
  users(first: 20) { # 1 * 20 = 20
    id               # 1
    name             # 1
  }
}                    # Total: 20 + 20 * 2 = 60
```

### Nested Query (Complexity: 153)
```graphql
query {
  users(first: 10) {      # 1 * 10 = 10
    id                    # 1
    posts(limit: 5) {     # 2 * 5 = 10
      id                  # 1
      comments(limit: 3) { # 1 * 3 = 3
        id                # 1
        text              # 1
      }
    }
  }
}
# Total: 10 + 10 * (1 + 10 + 10 * (1 + 3 + 3 * 2))
```

## Error Handling

When a query exceeds limits:

```json
{
  "errors": [{
    "message": "Query is too complex: 1523. Maximum allowed complexity: 1000",
    "extensions": {
      "code": "QUERY_COMPLEXITY_EXCEEDED",
      "complexity": 1523,
      "maximumComplexity": 1000
    }
  }]
}
```

## Best Practices

### 1. Start Conservative

Begin with lower limits and increase based on actual usage:
```typescript
{
  maximumComplexity: 500,
  maximumDepth: 7,
}
```

### 2. Monitor and Adjust

```typescript
{
  onQueryRejected: (complexity, query) => {
    // Log to monitoring service
    metrics.recordCounter('graphql.query.rejected', 1, {
      complexity,
      service: 'users-service',
    });
  },
}
```

### 3. Different Limits per Environment

```typescript
const complexityConfig = {
  maximumComplexity: process.env.NODE_ENV === 'production' ? 1000 : 2000,
  maximumDepth: process.env.NODE_ENV === 'production' ? 10 : 15,
};
```

### 4. Provide Helpful Error Messages

```typescript
{
  customErrorMessage: (complexity, maximum) =>
    `Your query is too complex (score: ${complexity}, limit: ${maximum}). ` +
    `Try requesting fewer fields or reducing the number of nested resources.`,
}
```

## Integration with Services

### Using the Helper Function

```typescript
import { createServerWithComplexityAnalysis, complexityConfigs } from '@graphql-microservices/shared-query-complexity/service-integration';

const server = createServerWithComplexityAnalysis(
  typeDefs,
  resolvers,
  complexityConfigs.service // or .gateway, .publicApi
);
```

### Manual Integration

```typescript
import { createQueryComplexityPlugin, addComplexityToSchema } from '@graphql-microservices/shared-query-complexity';

// Add directive to schema
const enhancedTypeDefs = addComplexityToSchema(typeDefs);

// Create schema
const schema = buildSubgraphSchema([{
  typeDefs: enhancedTypeDefs,
  resolvers,
}]);

// Create server
const server = new ApolloServer({
  schema,
  plugins: [
    createQueryComplexityPlugin(schema, {
      maximumComplexity: 1000,
      onQueryRejected: (complexity) => {
        console.error(`Query rejected with complexity ${complexity}`);
      },
    }),
  ],
});
```

## Performance Considerations

1. **Complexity calculation is fast**: Happens during query validation
2. **No runtime overhead**: Rejected before execution
3. **Caching**: Complexity is calculated once per unique query
4. **Memory efficient**: No additional memory per request

## Testing

### Estimate Query Complexity

```typescript
import { estimateQueryComplexity } from '@graphql-microservices/shared-query-complexity';

const complexity = estimateQueryComplexity(
  schema,
  `query { users(first: 50) { id posts { id } } }`,
  { first: 50 }
);

console.log(`Query complexity: ${complexity}`);
```

### Test Rejection

```typescript
it('should reject overly complex queries', async () => {
  const query = `
    query {
      users(first: 100) {
        posts(limit: 100) {
          comments(limit: 100) {
            id
          }
        }
      }
    }
  `;
  
  const result = await server.executeOperation({ query });
  
  expect(result.errors?.[0].extensions.code).toBe('QUERY_COMPLEXITY_EXCEEDED');
});
```

## Troubleshooting

### Query Always Rejected

1. Check if introspection queries are included
2. Verify complexity values in schema
3. Enable logging to see actual complexity

### Complexity Not Calculated

1. Ensure directive is defined in schema
2. Check that plugin is added to server
3. Verify validation rules are included

### Performance Impact

1. Complexity calculation should be <1ms
2. If slow, check for recursive field definitions
3. Consider simplifying estimation strategy
