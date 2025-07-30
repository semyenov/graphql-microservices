# Migration Guide: From GraphQL Code Generator to gql-tada

This guide helps you migrate from traditional GraphQL Code Generator to gql-tada.

## Why Migrate to gql-tada?

### Traditional Codegen Approach
```typescript
// 1. Write GraphQL in separate .graphql files
// queries/getUser.graphql
query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
    email
  }
}

// 2. Run codegen
// npm run codegen

// 3. Import generated types and hooks
import { useGetUserQuery } from './generated/graphql';

function UserProfile({ userId }) {
  const { data, loading } = useGetUserQuery({
    variables: { id: userId },
  });
}
```

### gql-tada Approach
```typescript
// Everything in one place with instant type safety
import { graphql } from './graphql';

const GET_USER = graphql(`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
      email
    }
  }
`);

function UserProfile({ userId }) {
  const { data, loading } = useQuery(GET_USER, {
    variables: { id: userId }, // Type-safe!
  });
}
```

## Migration Steps

### Step 1: Install gql-tada

```bash
# Remove old codegen packages
bun remove @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-operations @graphql-codegen/typescript-react-apollo

# Install gql-tada
bun add gql.tada
```

### Step 2: Configure TypeScript

```json
// tsconfig.json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "gql.tada/ts-plugin",
        "schema": "./schema.json",
        "tadaOutputLocation": "./src/graphql-env.d.ts"
      }
    ]
  }
}
```

### Step 3: Set Up gql-tada

Create `src/graphql.ts`:
```typescript
import { initGraphQLTada } from 'gql.tada';
import type { introspection } from './graphql-env.d.ts';

export const graphql = initGraphQLTada<{
  introspection: introspection;
  scalars: {
    DateTime: string;
    Decimal: number;
    JSON: any;
  };
}>();

export type { FragmentOf, ResultOf, VariablesOf } from 'gql.tada';
export { readFragment } from 'gql.tada';
```

### Step 4: Migrate Queries

#### Before (Codegen)
```typescript
// queries/users.graphql
query GetUsers {
  users {
    id
    name
    email
  }
}

fragment UserFields on User {
  id
  name
  email
  role
}

// component.tsx
import { GetUsersDocument, UserFieldsFragment } from './generated';
```

#### After (gql-tada)
```typescript
// queries/users.ts
import { graphql } from '../graphql';

export const USER_FIELDS = graphql(`
  fragment UserFields on User {
    id
    name
    email
    role
  }
`);

export const GET_USERS = graphql(`
  query GetUsers {
    users {
      ...UserFields
    }
  }
`, [USER_FIELDS]);
```

### Step 5: Update Components

#### React Apollo (Before)
```typescript
import { useGetUsersQuery } from './generated';

function UserList() {
  const { data, loading, error } = useGetUsersQuery();
  
  return (
    <ul>
      {data?.users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

#### React Apollo (After)
```typescript
import { useQuery } from '@apollo/client';
import { GET_USERS } from './queries/users';

function UserList() {
  const { data, loading, error } = useQuery(GET_USERS);
  
  return (
    <ul>
      {data?.users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

### Step 6: Migrate Mutations

#### Before
```typescript
// mutations/createUser.graphql
mutation CreateUser($input: CreateUserInput!) {
  createUser(input: $input) {
    id
    name
    email
  }
}

// component.tsx
import { useCreateUserMutation } from './generated';

function CreateUserForm() {
  const [createUser] = useCreateUserMutation();
  
  const handleSubmit = (input: CreateUserInput) => {
    createUser({ variables: { input } });
  };
}
```

#### After
```typescript
import { graphql } from '../graphql';
import { useMutation } from '@apollo/client';

const CREATE_USER = graphql(`
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      id
      name
      email
    }
  }
`);

function CreateUserForm() {
  const [createUser] = useMutation(CREATE_USER);
  
  const handleSubmit = (input) => {
    createUser({ 
      variables: { input }, // Type-safe!
    });
  };
}
```

### Step 7: Handle Custom Scalars

#### Before (codegen.yml)
```yaml
config:
  scalars:
    DateTime: string
    Decimal: number
    JSON: any
```

#### After (graphql.ts)
```typescript
export const graphql = initGraphQLTada<{
  introspection: introspection;
  scalars: {
    DateTime: string;
    Decimal: number;
    JSON: any;
  };
}>();
```

### Step 8: Migrate Fragments

#### Complex Fragment Usage (Before)
```typescript
// fragments/order.graphql
fragment OrderDetails on Order {
  id
  status
  total
  items {
    ...OrderItemFields
  }
  user {
    ...UserBasic
  }
}

// Usage required multiple imports
import { 
  OrderDetailsFragment,
  OrderItemFieldsFragment,
  UserBasicFragment 
} from './generated';
```

#### Complex Fragment Usage (After)
```typescript
// fragments/order.ts
import { graphql } from '../graphql';

const ORDER_ITEM_FIELDS = graphql(`
  fragment OrderItemFields on OrderItem {
    id
    quantity
    price
    product {
      id
      name
    }
  }
`);

const USER_BASIC = graphql(`
  fragment UserBasic on User {
    id
    name
    email
  }
`);

export const ORDER_DETAILS = graphql(`
  fragment OrderDetails on Order {
    id
    status
    total
    items {
      ...OrderItemFields
    }
    user {
      ...UserBasic
    }
  }
`, [ORDER_ITEM_FIELDS, USER_BASIC]);
```

## Migration Patterns

### Pattern 1: Gradual Migration

Keep both systems during migration:

```typescript
// Use gql-tada for new queries
const NEW_QUERY = graphql(`
  query NewFeature {
    newField
  }
`);

// Keep using generated hooks for existing queries
import { useOldQueryQuery } from './generated';
```

### Pattern 2: Module Organization

```typescript
// queries/index.ts - Central export
export * from './users';
export * from './products';
export * from './orders';

// queries/users.ts
export const USER_QUERIES = {
  GET_USER: graphql(`...`),
  GET_USERS: graphql(`...`),
  SEARCH_USERS: graphql(`...`),
};

// Usage
import { USER_QUERIES } from '@/queries';
```

### Pattern 3: Type Helpers

```typescript
// types/helpers.ts
import type { ResultOf, VariablesOf } from '../graphql';
import type { GET_USER } from '../queries/users';

// Create type aliases for cleaner code
export type User = ResultOf<typeof GET_USER>['user'];
export type GetUserVars = VariablesOf<typeof GET_USER>;

// Use in components
function processUser(user: User) {
  console.log(user.name); // Type-safe!
}
```

## Common Pitfalls and Solutions

### 1. Missing Type Updates

**Issue**: Types not updating after schema changes

**Solution**:
```bash
# Always re-run introspection after schema changes
bun run schema:introspect
```

### 2. Fragment Type Errors

**Issue**: "Fragment cannot be spread here"

**Solution**:
```typescript
// Ensure fragments are passed to graphql()
const QUERY = graphql(`
  query {
    user {
      ...UserFields
    }
  }
`, [USER_FIELDS]); // Don't forget this!
```

### 3. Lost Optimistic Updates

**Issue**: Optimistic updates were easier with generated types

**Solution**:
```typescript
import type { ResultOf } from '../graphql';

const optimisticResponse: ResultOf<typeof CREATE_USER> = {
  createUser: {
    __typename: 'User',
    id: 'temp-id',
    name: input.name,
    email: input.email,
  },
};
```

### 4. Mock Data for Tests

**Issue**: Generated types made mocking easier

**Solution**:
```typescript
// test-utils/mocks.ts
import type { ResultOf } from '../graphql';
import type { GET_USER } from '../queries/users';

export function mockUser(overrides?: Partial<User>): ResultOf<typeof GET_USER> {
  return {
    user: {
      __typename: 'User',
      id: '1',
      name: 'Test User',
      email: 'test@example.com',
      ...overrides,
    },
  };
}
```

## Benefits After Migration

1. **Instant Type Safety**: No need to run codegen after every change
2. **Better DX**: Inline documentation and auto-completion
3. **Smaller Bundle**: No generated code to bundle
4. **Simpler Setup**: No codegen configuration needed
5. **Colocated Queries**: Queries live with components that use them

## Cleanup After Migration

```bash
# Remove old codegen files
rm -rf src/generated
rm codegen.yml
rm -rf **/*.graphql

# Remove codegen scripts from package.json
# Remove "codegen" and "codegen:watch" scripts

# Uninstall old packages
bun remove @graphql-codegen/cli
```

## Need Help?

- Check the [Troubleshooting Guide](./TROUBLESHOOTING.md)
- See [Framework Integration](./FRAMEWORK_INTEGRATION.md) for specific setups
- Review [Performance Guide](./PERFORMANCE_GUIDE.md) for optimization tips