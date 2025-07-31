/**
 * Example usage of the new Result V2 implementation
 */

import { 
  ok, 
  err, 
  wrap, 
  ResultHelpers,
  ValidationError,
  NotFoundError,
  matchError,
  resultDo,
  pipe,
  type Result,
  type AsyncResult
} from '../src';

// Example: Basic usage
function divide(a: number, b: number): Result<number, ValidationError> {
  if (b === 0) {
    return err(new ValidationError('Cannot divide by zero', 'divisor', b));
  }
  return ok(a / b);
}

// Example: Chaining operations
function calculateTax(amount: number, rate: number): Result<number, ValidationError> {
  return wrap(divide(amount * rate, 100))
    .map(tax => Math.round(tax * 100) / 100)
    .unwrapResult();
}

// Example: Async operations
async function fetchUser(id: string): AsyncResult<{ id: string; name: string }, NotFoundError> {
  // Simulating async fetch
  await new Promise(resolve => setTimeout(resolve, 100));
  
  if (id === 'invalid') {
    return err(new NotFoundError('User not found', 'User', id));
  }
  
  return ok({ id, name: 'John Doe' });
}

// Example: Pattern matching
async function handleUserRequest(userId: string): Promise<string> {
  const userResult = await fetchUser(userId);
  
  return wrap(userResult).match({
    ok: (user) => `Welcome, ${user.name}!`,
    err: (error) => matchError(error, {
      NotFoundError: (e) => `User ${e.id} not found`,
      _: (e) => `Error: ${e.message}`
    })
  });
}

// Example: Do-notation for cleaner async code
async function processOrder(
  userId: string, 
  productId: string, 
  quantity: number
): AsyncResult<{ orderId: string; total: number }, ValidationError | NotFoundError> {
  return resultDo(async ({ bind, return: ret }) => {
    // Fetch user
    const user = bind('user', await fetchUser(userId));
    
    // Validate quantity
    const validQuantity = bind('quantity', 
      quantity > 0 
        ? ok(quantity) 
        : err(new ValidationError('Invalid quantity', 'quantity', quantity))
    );
    
    // Calculate price (mock)
    const pricePerUnit = 29.99;
    const subtotal = pricePerUnit * validQuantity;
    const taxResult = calculateTax(subtotal, 10);
    const tax = bind('tax', taxResult);
    
    // Create order
    const order = {
      orderId: `ORD-${Date.now()}`,
      total: subtotal + tax
    };
    
    return ret(order);
  });
}

// Example: Railway-oriented programming
function processPayment(amount: number): Result<{ transactionId: string }, ValidationError> {
  return pipe(ok(amount))
    .pipe(amt => wrap(amt)
      .map(a => a > 0 ? a : null)
      .andThen(a => a 
        ? ok(a) 
        : err(new ValidationError('Amount must be positive', 'amount', amount))
      )
    )
    .pipe(amt => wrap(amt)
      .map(a => ({ 
        transactionId: `TXN-${Date.now()}`,
        amount: a 
      }))
    )
    .value();
}

// Example: Combining multiple results
async function validateUserData(data: {
  email: string;
  age: number;
  username: string;
}): AsyncResult<typeof data, ValidationError[]> {
  const emailResult = data.email.includes('@') 
    ? ok(data.email)
    : err(new ValidationError('Invalid email', 'email', data.email));
    
  const ageResult = data.age >= 18 
    ? ok(data.age)
    : err(new ValidationError('Must be 18 or older', 'age', data.age));
    
  const usernameResult = data.username.length >= 3
    ? ok(data.username)
    : err(new ValidationError('Username too short', 'username', data.username));
    
  const combined = ResultHelpers.combineWithAllErrors([
    emailResult,
    ageResult,
    usernameResult
  ]);
  
  return wrap(combined)
    .map(() => data)
    .unwrapResult();
}

// Example: Error recovery
async function fetchWithRetry(
  url: string, 
  maxRetries: number = 3
): AsyncResult<Response, Error> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    const result = await ResultHelpers.tryCatchAsync(
      () => fetch(url),
      (error) => error as Error
    );
    
    if (wrap(result).isOk()) {
      return result;
    }
    
    lastError = wrap(result).unwrapErr();
    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
  }
  
  return err(lastError || new Error('Failed after retries'));
}

// Example: Using with GraphQL resolvers
import { GraphQLError } from 'graphql';

const resolvers = {
  Query: {
    user: async (_: unknown, { id }: { id: string }) => {
      const result = await fetchUser(id);
      
      return wrap(result).match({
        ok: (user) => user,
        err: (error) => {
          throw new GraphQLError(error.message, {
            extensions: { 
              code: error._tag,
              resource: error.resource,
              id: error.id
            }
          });
        }
      });
    }
  },
  
  Mutation: {
    createOrder: async (_: unknown, args: { userId: string; productId: string; quantity: number }) => {
      const result = await processOrder(args.userId, args.productId, args.quantity);
      
      if (wrap(result).isErr()) {
        const error = wrap(result).unwrapErr();
        throw new GraphQLError(error.message, {
          extensions: { code: error._tag }
        });
      }
      
      return wrap(result).unwrap();
    }
  }
};

// Run examples
async function runExamples() {
  console.log('=== Result V2 Examples ===\n');
  
  // Basic division
  console.log('Division example:');
  console.log('10 / 2 =', wrap(divide(10, 2)).unwrapOr(0));
  console.log('10 / 0 =', wrap(divide(10, 0)).match({
    ok: v => v,
    err: e => `Error: ${e.message}`
  }));
  
  // Tax calculation
  console.log('\nTax calculation:');
  const taxResult = calculateTax(100, 8.5);
  console.log('Tax on $100 at 8.5%:', wrap(taxResult).unwrapOr(0));
  
  // User handling
  console.log('\nUser handling:');
  console.log(await handleUserRequest('123'));
  console.log(await handleUserRequest('invalid'));
  
  // Order processing
  console.log('\nOrder processing:');
  const orderResult = await processOrder('123', 'PROD-1', 2);
  wrap(orderResult).match({
    ok: (order) => console.log('Order created:', order),
    err: (error) => console.log('Order failed:', error.message)
  });
  
  // Validation
  console.log('\nValidation example:');
  const validationResult = await validateUserData({
    email: 'test@example.com',
    age: 25,
    username: 'john'
  });
  console.log('Validation:', wrap(validationResult).isOk() ? 'Passed' : 'Failed');
  
  const invalidResult = await validateUserData({
    email: 'invalid-email',
    age: 16,
    username: 'jo'
  });
  if (wrap(invalidResult).isErr()) {
    const errors = wrap(invalidResult).unwrapErr();
    console.log('Validation errors:', errors.map(e => `${e.field}: ${e.message}`));
  }
}

// Export for testing
export { 
  divide, 
  calculateTax, 
  fetchUser, 
  handleUserRequest, 
  processOrder,
  validateUserData,
  runExamples 
};