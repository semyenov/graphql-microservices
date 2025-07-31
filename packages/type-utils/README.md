# GraphQL Type Utilities

Shared utilities for converting between Prisma database models and GraphQL types, handling common transformation patterns across microservices.

## Features

- **Type Conversions**: Safe conversion of Prisma types to GraphQL types
- **Model Transformers**: Reusable transformers for common models
- **Pagination Helpers**: Convert Prisma results to GraphQL connections
- **Error Handling**: Transform Prisma errors to GraphQL errors
- **Type Guards**: Validate data types at runtime
- **Batch Operations**: Efficient transformation of collections

## Installation

```bash
bun add @graphql-microservices/type-utils
```

## Basic Type Conversions

### Numbers and Decimals

```typescript
import { toGraphQLFloat } from '@graphql-microservices/type-utils';

// Prisma Decimal to GraphQL Float
const price = toGraphQLFloat(product.price); // Decimal → number
const total = toGraphQLFloat(order.total);   // BigInt → number
```

### Dates

```typescript
import { toGraphQLDateTime } from '@graphql-microservices/type-utils';

// Prisma DateTime to GraphQL String (ISO format)
const createdAt = toGraphQLDateTime(user.createdAt); // Date → "2024-01-01T00:00:00.000Z"
const updatedAt = toGraphQLDateTime(post.updatedAt); // Date → string | null
```

### JSON Fields

```typescript
import { toGraphQLJSON } from '@graphql-microservices/type-utils';

// Prisma Json to GraphQL object
const metadata = toGraphQLJSON<MetadataType>(product.metadata);
const settings = toGraphQLJSON(user.preferences);
```

### Arrays

```typescript
import { toGraphQLArray, toGraphQLNullable } from '@graphql-microservices/type-utils';

// Ensure arrays are never null
const tags = toGraphQLArray(product.tags); // string[] | null → string[]

// Handle nullable fields
const phone = toGraphQLNullable(user.phoneNumber); // string | undefined → string | null
```

## Model Transformers

### Basic Transformation

```typescript
import { transformPrismaToGraphQL } from '@graphql-microservices/type-utils';

const graphqlUser = transformPrismaToGraphQL<PrismaUser, GraphQLUser>(
  prismaUser,
  {
    dateFields: ['createdAt', 'updatedAt'],
    exclude: ['password', 'refreshToken'],
    decimalFields: ['balance'],
    jsonFields: ['preferences'],
  }
);
```

### Pre-built Transformers

```typescript
import {
  createUserTransformer,
  createProductTransformer,
  createOrderTransformer,
} from '@graphql-microservices/type-utils';

// User transformer (excludes password, converts dates)
const transformUser = createUserTransformer<PrismaUser, GraphQLUser>();
const user = transformUser(prismaUser);

// Product transformer (handles prices, metadata)
const transformProduct = createProductTransformer<PrismaProduct, GraphQLProduct>();
const product = transformProduct(prismaProduct);

// Order transformer (handles money fields, dates)
const transformOrder = createOrderTransformer<PrismaOrder, GraphQLOrder>();
const order = transformOrder(prismaOrder);
```

### Custom Transformers

```typescript
import { createModelTransformer } from '@graphql-microservices/type-utils';

const transformReview = createModelTransformer<PrismaReview, GraphQLReview>({
  dateFields: ['createdAt', 'updatedAt', 'editedAt'],
  decimalFields: ['rating'],
  fields: {
    // Custom transformation for specific fields
    status: (value) => value.toUpperCase(),
    authorName: (value, fieldName, model) => 
      model.isAnonymous ? 'Anonymous' : value,
  },
});
```

## Pagination

### GraphQL Connection Pattern

```typescript
import { toGraphQLConnection } from '@graphql-microservices/type-utils';

// Convert Prisma pagination to GraphQL connection
const users = await prisma.user.findMany({
  take: args.first + 1, // Fetch one extra for hasNextPage
  cursor: args.after ? { id: decodeCursor(args.after) } : undefined,
});

const hasNextPage = users.length > args.first;
const nodes = hasNextPage ? users.slice(0, -1) : users;

const connection = toGraphQLConnection(
  {
    data: nodes,
    total: await prisma.user.count(),
    hasMore: hasNextPage,
  },
  transformUser,
  args
);

return connection;
// Returns: { nodes, edges, pageInfo, totalCount }
```

### Cursor Encoding

```typescript
import { encodeCursor, decodeCursor } from '@graphql-microservices/type-utils';

// Encode ID to cursor
const cursor = encodeCursor({ id: 'user-123' }); // → base64 string

// Decode cursor to ID
const id = decodeCursor(cursor); // → 'user-123'
```

## Error Handling

### Prisma Error Transformation

```typescript
import { handlePrismaError } from '@graphql-microservices/type-utils';

try {
  await prisma.user.create({ data });
} catch (error) {
  // Converts Prisma errors to GraphQL errors
  throw handlePrismaError(error);
  // P2002 → UNIQUE_CONSTRAINT_VIOLATION
  // P2025 → NOT_FOUND
  // P2003 → FOREIGN_KEY_VIOLATION
}
```

## Type Guards

```typescript
import {
  isValidId,
  isValidDate,
  isValidEmail,
} from '@graphql-microservices/type-utils';

// Validate at runtime
if (!isValidId(args.id)) {
  throw new Error('Invalid ID format');
}

if (!isValidEmail(input.email)) {
  throw new Error('Invalid email format');
}

if (!isValidDate(input.birthDate)) {
  throw new Error('Invalid date');
}
```

## Batch Operations

```typescript
import { batchTransform, groupBy } from '@graphql-microservices/type-utils';

// Transform array of items
const products = await prisma.product.findMany();
const graphqlProducts = batchTransform(products, transformProduct);

// Group items by key
const ordersByUser = groupBy(orders, 'userId');
// Map<string, Order[]>

const productsByCategory = groupBy(products, 'category');
// Map<string, Product[]>
```

## Real-World Examples

### User Service

```typescript
import { createUserTransformer, toGraphQLConnection } from '@graphql-microservices/type-utils';

const transformUser = createUserTransformer<PrismaUser, GraphQLUser>();

const resolvers = {
  Query: {
    user: async (_, { id }, context) => {
      const user = await context.prisma.user.findUnique({ where: { id } });
      return user ? transformUser(user) : null;
    },
    
    users: async (_, args, context) => {
      const users = await context.prisma.user.findMany({
        take: args.first + 1,
        cursor: args.after ? { id: decodeCursor(args.after) } : undefined,
      });
      
      return toGraphQLConnection(
        {
          data: users.slice(0, args.first),
          total: await context.prisma.user.count(),
          hasMore: users.length > args.first,
        },
        transformUser,
        args
      );
    },
  },
};
```

### Product Service

```typescript
import {
  createProductTransformer,
  handlePrismaError,
  toGraphQLFloat,
} from '@graphql-microservices/type-utils';

const transformProduct = createProductTransformer<PrismaProduct, GraphQLProduct>();

const resolvers = {
  Query: {
    products: async (_, { category }, context) => {
      try {
        const products = await context.prisma.product.findMany({
          where: category ? { category } : undefined,
        });
        return batchTransform(products, transformProduct);
      } catch (error) {
        throw handlePrismaError(error);
      }
    },
  },
  
  Product: {
    // Computed field
    discountedPrice: (product) => {
      const price = toGraphQLFloat(product.price);
      const discount = toGraphQLFloat(product.discount);
      return price - (price * discount / 100);
    },
  },
};
```

### Order Service

```typescript
import {
  createOrderTransformer,
  toGraphQLJSON,
  toGraphQLDateTime,
} from '@graphql-microservices/type-utils';

const transformOrder = createOrderTransformer<PrismaOrder, GraphQLOrder>();

const resolvers = {
  Mutation: {
    createOrder: async (_, { input }, context) => {
      const order = await context.prisma.order.create({
        data: {
          ...input,
          shippingInfo: input.shippingInfo, // Stored as JSON
          total: calculateTotal(input.items),
        },
        include: { items: true },
      });
      
      return transformOrder(order);
    },
  },
  
  Order: {
    // Parse JSON fields
    shippingInfo: (order) => toGraphQLJSON(order.shippingInfo),
    paymentInfo: (order) => toGraphQLJSON(order.paymentInfo),
    
    // Format dates
    estimatedDelivery: (order) => {
      const shippedAt = new Date(order.shippedAt);
      const deliveryDate = new Date(shippedAt);
      deliveryDate.setDate(deliveryDate.getDate() + 5);
      return toGraphQLDateTime(deliveryDate);
    },
  },
};
```

## Best Practices

### 1. Create Reusable Transformers

```typescript
// services/users/src/transformers.ts
export const transformUser = createUserTransformer<PrismaUser, GraphQLUser>();
export const transformUserWithStats = createModelTransformer<
  PrismaUser & { _count: { posts: number } },
  GraphQLUserWithStats
>({
  dateFields: ['createdAt', 'updatedAt'],
  exclude: ['password'],
  fields: {
    postCount: (value, field, model) => model._count.posts,
  },
});
```

### 2. Handle Edge Cases

```typescript
const safeTransformOrder = (order: PrismaOrder | null): GraphQLOrder | null => {
  if (!order) return null;
  
  try {
    return transformOrder(order);
  } catch (error) {
    logError(error, { orderId: order.id });
    // Return partial data rather than failing completely
    return {
      id: order.id,
      status: 'ERROR',
      // ... minimal fields
    };
  }
};
```

### 3. Type Safety

```typescript
// Define explicit types
interface PrismaProductWithRelations extends PrismaProduct {
  category: PrismaCategory;
  reviews: PrismaReview[];
}

interface GraphQLProductWithRelations extends GraphQLProduct {
  category: GraphQLCategory;
  reviews: GraphQLReview[];
  averageRating: number;
}

const transformProductWithRelations = createModelTransformer<
  PrismaProductWithRelations,
  GraphQLProductWithRelations
>({
  // ... configuration
});
```

## Performance Tips

1. **Reuse Transformers**: Create once, use many times
2. **Batch Operations**: Use `batchTransform` for arrays
3. **Selective Fields**: Only transform fields you need
4. **Cache Transformers**: Store transformer instances

```typescript
// Cache transformer instances
const transformerCache = new Map();

function getTransformer(type: string) {
  if (!transformerCache.has(type)) {
    transformerCache.set(type, createTransformerForType(type));
  }
  return transformerCache.get(type);
}
```
