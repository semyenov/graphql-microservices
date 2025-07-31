# Result Type Migration Guide

## Overview

We've introduced a new Result type implementation (ResultV2) inspired by the neverthrow library that provides better type safety, chainability, and functional programming patterns. The legacy Result type remains available for backward compatibility.

## Key Improvements

### 1. **Better Type Safety**
- Uses discriminated unions with `_tag` field
- Separate `Ok<T>` and `Err<E>` types
- More precise type inference

### 2. **Method Chaining**
- Fluent API with `ResultWrapper` class
- Railway-oriented programming support
- Better composition of operations

### 3. **Pattern Matching**
- Built-in `match` method
- Error type pattern matching with `matchError`
- Do-notation support for cleaner async code

### 4. **Advanced Features**
- Typed error classes
- Result combinators (combine, sequence, traverse)
- Better async support with `AsyncResult` type

## Migration Examples

### Basic Usage

**Legacy:**
```typescript
// Creating results
const success = Result.ok(42);
const failure = Result.err("Something went wrong");

// Checking results
if (Result.isOk(result)) {
  console.log(result.data);
} else {
  console.error(result.error);
}
```

**New (V2):**
```typescript
import { ok, err, isOk, wrap } from '@graphql-microservices/shared-type-utils';

// Creating results
const success = ok(42);
const failure = err("Something went wrong");

// Checking results
if (isOk(result)) {
  console.log(result.value); // Note: 'value' instead of 'data'
} else {
  console.error(result.error);
}
```

### Method Chaining

**Legacy:**
```typescript
const result = Result.map(
  Result.flatMap(
    userResult,
    user => getUserProfile(user.id)
  ),
  profile => profile.name
);
```

**New (V2):**
```typescript
const result = wrap(userResult)
  .andThen(user => getUserProfile(user.id))
  .map(profile => profile.name)
  .unwrapResult();
```

### Pattern Matching

**Legacy:**
```typescript
let message: string;
if (Result.isOk(result)) {
  message = `Success: ${result.data}`;
} else {
  message = `Error: ${result.error}`;
}
```

**New (V2):**
```typescript
const message = wrap(result).match({
  ok: (value) => `Success: ${value}`,
  err: (error) => `Error: ${error}`
});
```

### Error Handling

**Legacy:**
```typescript
const result = await Result.tryAsync(
  async () => {
    const data = await fetchData();
    return processData(data);
  },
  (error) => ({ code: 'FETCH_ERROR', message: error.message })
);
```

**New (V2):**
```typescript
import { ResultHelpers, ValidationError } from '@graphql-microservices/shared-type-utils';

const result = await ResultHelpers.tryCatchAsync(
  async () => {
    const data = await fetchData();
    return processData(data);
  },
  (error) => new ValidationError('Failed to fetch data', 'api')
);

// Pattern match on error types
if (isErr(result)) {
  matchError(result.error, {
    ValidationError: (err) => console.log(`Validation failed: ${err.field}`),
    NotFoundError: (err) => console.log(`Not found: ${err.id}`),
    _: (err) => console.log(`Unknown error: ${err.message}`)
  });
}
```

### Async Operations

**Legacy:**
```typescript
async function getUser(id: string): Promise<Result<User, Error>> {
  return Result.tryAsync(
    () => database.users.findById(id),
    (error) => new Error(`User not found: ${id}`)
  );
}
```

**New (V2):**
```typescript
import { AsyncResult, ResultHelpers, NotFoundError } from '@graphql-microservices/shared-type-utils';

async function getUser(id: string): AsyncResult<User, NotFoundError> {
  return ResultHelpers.tryCatchAsync(
    () => database.users.findById(id),
    () => new NotFoundError(`User not found`, id)
  );
}

// Chain async operations
const result = await wrap(await getUser('123'))
  .andThenAsync(user => getUserPermissions(user.id))
  .map(permissions => permissions.filter(p => p.active));
```

### Do-Notation

**New (V2) only:**
```typescript
import { resultDo, ok } from '@graphql-microservices/shared-type-utils';

const result = resultDo(({ bind, return }) => {
  const user = bind('user', getUser('123'));
  const profile = bind('profile', getProfile(user.id));
  const permissions = bind('permissions', getPermissions(user.id));
  
  return(return({
    user,
    profile,
    permissions
  }));
});
```

## Gradual Migration Strategy

### Step 1: Use Compatibility Layer

For existing code, use the `chain` method to access V2 features:

```typescript
// Existing legacy Result
const legacyResult = Result.ok(42);

// Use new chaining API
const newResult = Result.chain(legacyResult)
  .map(x => x * 2)
  .andThen(x => ok(x + 1))
  .unwrapResult();

// Convert back to legacy if needed
const backToLegacy = Result.fromV2(newResult);
```

### Step 2: Migrate Function by Function

Use migration utilities:

```typescript
// Original function
function calculateTax(amount: number): Result<number, string> {
  if (amount < 0) return Result.err("Invalid amount");
  return Result.ok(amount * 0.2);
}

// Wrapped for V2 compatibility
const calculateTaxV2 = Migration.wrapFunction(calculateTax);

// Now returns ResultV2
const taxResult = calculateTaxV2(100);
```

### Step 3: Update Service Layer

Gradually update service methods:

```typescript
class ProductService {
  // Keep legacy method for compatibility
  async getProduct(id: string): Promise<Result<Product, ServiceError>> {
    // ... existing implementation
  }

  // Add V2 method
  async getProductV2(id: string): AsyncResult<Product, NotFoundError | ValidationError> {
    const result = await this.getProduct(id);
    return Result.toV2(result);
  }
}
```

### Step 4: Update Resolvers

Update GraphQL resolvers to use V2:

```typescript
const resolvers = {
  Query: {
    product: async (_, { id }, context) => {
      const result = await context.productService.getProductV2(id);
      
      return wrap(result).match({
        ok: (product) => product,
        err: (error) => {
          throw new GraphQLError(error.message, {
            extensions: { 
              code: error._tag,
              ...(error instanceof NotFoundError && { id: error.id })
            }
          });
        }
      });
    }
  }
};
```

## Best Practices

1. **Use Typed Errors**: Create specific error classes extending `ResultError`
2. **Leverage Pattern Matching**: Use `match` and `matchError` for cleaner code
3. **Chain Operations**: Use the fluent API for better readability
4. **Type Your Results**: Use `SafeResult<T, E>` with constrained error types
5. **Handle All Cases**: TypeScript will enforce exhaustive pattern matching

## Common Patterns

### Validation
```typescript
function validateEmail(email: string): ResultV2<string, ValidationError> {
  if (!email.includes('@')) {
    return err(new ValidationError('Invalid email format', 'email'));
  }
  return ok(email.toLowerCase());
}
```

### Repository Pattern
```typescript
class UserRepository {
  async findById(id: string): AsyncResult<User, NotFoundError> {
    return ResultHelpers.tryCatchAsync(
      async () => {
        const user = await this.db.users.findUnique({ where: { id } });
        if (!user) throw new Error('Not found');
        return user;
      },
      () => new NotFoundError('User not found', id)
    );
  }
}
```

### Service Composition
```typescript
async function createOrder(
  userId: string,
  items: OrderItem[]
): AsyncResult<Order, ValidationError | NotFoundError> {
  return pipe(ok({ userId, items }))
    .pipe(data => wrap(validateOrderItems(data.items)))
    .pipe(() => wrap(await getUserById(userId)))
    .pipe(user => wrap(await createOrderForUser(user, items)))
    .value();
}
```

## Troubleshooting

### Type Errors
If you get type errors when migrating, check:
- Use `value` instead of `data` for V2 Results
- Import types from the correct module
- Use `wrap()` to access chaining methods

### Runtime Errors
- V2 Results use `_tag` for discrimination, not `success`
- Error objects should extend `ResultError` for pattern matching
- The `unwrap()` method throws if called on an error

### Performance
- V2 has minimal overhead compared to legacy
- Chaining methods create new wrapper instances but not new Results
- Use `unwrapResult()` to get the raw Result when done chaining