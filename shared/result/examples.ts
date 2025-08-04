/**
 * Examples of using the Result type in the microservices
 */

import {
  type AsyncResult,
  BusinessRuleError,
  type DomainError,
  domainError,
  NotFoundError,
  pipe,
  Result,
  resultBuilder,
  validationError,
} from './index';

// Example 1: Repository pattern with Result
interface UserRepository {
  findById(id: string): AsyncResult<User | null, DomainError>;
  findByEmail(email: string): AsyncResult<User | null, DomainError>;
  save(user: User): AsyncResult<User, DomainError>;
}

interface User {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
}

class UserRepositoryImpl implements UserRepository {
  async findById(id: string): AsyncResult<User | null, DomainError> {
    return Result.tryCatchAsync(
      async () => {
        // Simulate database call
        const user = await this.prisma.user.findUnique({ where: { id } });
        return user;
      },
      (error) => domainError('DATABASE_ERROR', 'Failed to fetch user', error)
    );
  }

  async findByEmail(email: string): AsyncResult<User | null, DomainError> {
    return Result.tryCatchAsync(
      async () => {
        const user = await this.prisma.user.findUnique({ where: { email } });
        return user;
      },
      (error) => domainError('DATABASE_ERROR', 'Failed to fetch user by email', error)
    );
  }

  async save(user: User): AsyncResult<User, DomainError> {
    return Result.tryCatchAsync(
      async () => {
        const saved = await this.prisma.user.create({ data: user });
        return saved;
      },
      (error) => domainError('DATABASE_ERROR', 'Failed to save user', error)
    );
  }

  private prisma: any; // Prisma client
}

// Example 2: Service layer with Result
class UserService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly eventBus: any
  ) {}

  async getUser(id: string): AsyncResult<User, DomainError> {
    const userResult = await this.userRepo.findById(id);

    return Result.flatMap(userResult, (user) => {
      if (!user) {
        return Result.err(NotFoundError('User', id));
      }

      if (!user.isActive) {
        return Result.err(BusinessRuleError('User account is deactivated'));
      }

      return Result.ok(user);
    });
  }

  async updateUserEmail(userId: string, newEmail: string): AsyncResult<User, DomainError> {
    // Validate email
    const emailValidation = this.validateEmail(newEmail);
    if (Result.isErr(emailValidation)) {
      return emailValidation;
    }

    // Check if email is already taken
    const existingUser = await this.userRepo.findByEmail(newEmail);

    return Result.flatMap(existingUser, async (existing) => {
      if (existing && existing.id !== userId) {
        return Result.err(BusinessRuleError(`Email ${newEmail} is already taken`));
      }

      // Get current user
      const userResult = await this.getUser(userId);

      return Result.flatMap(userResult, async (user) => {
        // Update user
        const updatedUser = { ...user, email: newEmail };
        const saveResult = await this.userRepo.save(updatedUser);

        // Publish event on success
        return Result.tap(saveResult, async (saved) => {
          await this.eventBus.publish({
            type: 'UserEmailUpdated',
            userId: saved.id,
            oldEmail: user.email,
            newEmail: saved.email,
          });
        });
      });
    });
  }

  private validateEmail(email: string): Result<void, DomainError> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email) {
      return Result.err(validationError([{ field: 'email', message: 'Email is required' }]));
    }

    if (!emailRegex.test(email)) {
      return Result.err(
        validationError([
          {
            field: 'email',
            message: 'Invalid email format',
            value: email,
          },
        ])
      );
    }

    return Result.ok(undefined);
  }
}

// Example 3: Command handler with Result
interface CreateOrderCommand {
  customerId: string;
  items: Array<{ productId: string; quantity: number }>;
}

class CreateOrderCommandHandler {
  async execute(command: CreateOrderCommand): AsyncResult<Order, DomainError> {
    // Validate command
    const validation = this.validateCommand(command);
    if (Result.isErr(validation)) {
      return validation;
    }

    // Check customer exists
    const customerResult = await this.customerService.getCustomer(command.customerId);

    return Result.flatMap(customerResult, async (customer) => {
      // Check product availability
      const availabilityResults = await Promise.all(
        command.items.map((item) =>
          this.productService.checkAvailability(item.productId, item.quantity)
        )
      );

      const availabilityCheck = Result.all(availabilityResults);

      return Result.flatMap(availabilityCheck, async () => {
        // Create order
        const order = Order.create({
          customerId: customer.id,
          items: command.items,
        });

        // Save to event store
        const saveResult = await this.eventStore.save(order);

        // Publish events
        return Result.tap(saveResult, async () => {
          await this.eventBus.publishAll(order.getUncommittedEvents());
        });
      });
    });
  }

  private validateCommand(command: CreateOrderCommand): Result<void, DomainError> {
    const errors: Array<{ field: string; message: string }> = [];

    if (!command.customerId) {
      errors.push({ field: 'customerId', message: 'Customer ID is required' });
    }

    if (!command.items || command.items.length === 0) {
      errors.push({ field: 'items', message: 'At least one item is required' });
    }

    command.items.forEach((item, index) => {
      if (!item.productId) {
        errors.push({
          field: `items[${index}].productId`,
          message: 'Product ID is required',
        });
      }

      if (!item.quantity || item.quantity <= 0) {
        errors.push({
          field: `items[${index}].quantity`,
          message: 'Quantity must be greater than 0',
        });
      }
    });

    return errors.length > 0 ? Result.err(validationError(errors)) : Result.ok(undefined);
  }

  private customerService: any;
  private productService: any;
  private eventStore: any;
  private eventBus: any;
}

// Example 4: GraphQL resolver with Result
const userResolvers = {
  Query: {
    user: async (_: any, { id }: { id: string }, context: any) => {
      const result = await context.userService.getUser(id);

      return Result.match(result, {
        ok: (user) => user,
        err: (error) => {
          // Convert domain error to GraphQL error
          throw new GraphQLError(error.message, {
            extensions: { code: error.code, details: error.details },
          });
        },
      });
    },
  },

  Mutation: {
    updateUserEmail: async (
      _: any,
      { userId, email }: { userId: string; email: string },
      context: any
    ) => {
      const result = await context.userService.updateUserEmail(userId, email);

      // Using unwrapOrElse
      return Result.unwrapOrElse(result, (error) => {
        throw new GraphQLError(error.message, {
          extensions: { code: error.code, details: error.details },
        });
      });
    },
  },
};

// Example 5: Functional composition with pipe
async function processOrder(orderId: string) {
  const orderResult = await getOrder(orderId);

  return pipe(orderResult)
    .to(validateOrder)
    .to(calculateTotals)
    .to(applyDiscounts)
    .to(checkInventory)
    .value();
}

function validateOrder(result: Result<Order, DomainError>): Result<Order, DomainError> {
  return Result.flatMap(result, (order) => {
    if (order.items.length === 0) {
      return Result.err(BusinessRuleError('Order must have at least one item'));
    }
    return Result.ok(order);
  });
}

function calculateTotals(result: Result<Order, DomainError>): Result<Order, DomainError> {
  return Result.map(result, (order) => ({
    ...order,
    total: order.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
  }));
}

// Example 6: Parallel operations with Result
async function createUserWithProfile(data: { email: string; name: string; avatar?: string }) {
  // Run validations in parallel
  const validationResults = await Promise.all([
    validateEmail(data.email),
    validateName(data.name),
    data.avatar ? validateAvatarUrl(data.avatar) : Promise.resolve(Result.ok(undefined)),
  ]);

  const validations = Result.all(validationResults);

  return Result.flatMap(validations, async () => {
    // Create user and profile in parallel
    const [userResult, profileResult] = await Promise.all([
      createUser(data.email, data.name),
      createProfile(data.name, data.avatar),
    ]);

    const combined = Result.all([userResult, profileResult]);

    return Result.map(combined, ([user, profile]) => ({
      user,
      profile,
    }));
  });
}

// Example 7: Result with event sourcing
class OrderAggregate {
  static create(customerId: string, items: OrderItem[]): Result<OrderAggregate, DomainError> {
    // Validate business rules
    if (!customerId) {
      return Result.err(BusinessRuleError('Customer ID is required'));
    }

    if (items.length === 0) {
      return Result.err(BusinessRuleError('Order must have at least one item'));
    }

    const invalidItems = items.filter((item) => item.quantity <= 0);
    if (invalidItems.length > 0) {
      return Result.err(
        BusinessRuleError('All items must have positive quantity', { invalidItems })
      );
    }

    // Create aggregate
    const order = new OrderAggregate();
    order.apply({
      type: 'OrderCreated',
      customerId,
      items,
      createdAt: new Date(),
    });

    return Result.ok(order);
  }

  cancel(reason: string): Result<void, DomainError> {
    if (this.status === 'cancelled') {
      return Result.err(BusinessRuleError('Order is already cancelled'));
    }

    if (this.status === 'delivered') {
      return Result.err(BusinessRuleError('Cannot cancel delivered order'));
    }

    this.apply({
      type: 'OrderCancelled',
      reason,
      cancelledAt: new Date(),
    });

    return Result.ok(undefined);
  }

  private status: string = 'pending';
  private apply(event: any) {
    // Apply event logic
  }
}

// Example 8: Result chain for complex workflows
async function processPayment(
  orderId: string,
  paymentMethod: PaymentMethod
): AsyncResult<PaymentReceipt, DomainError> {
  return resultBuilder.chain<any, DomainError>(
    // Step 1: Load order
    async () => loadOrder(orderId),

    // Step 2: Validate payment method
    async (order) => validatePaymentMethod(order, paymentMethod),

    // Step 3: Calculate final amount
    async (validated) => calculateFinalAmount(validated),

    // Step 4: Process payment
    async (calculated) => chargePayment(calculated),

    // Step 5: Update order status
    async (charged) => updateOrderStatus(charged),

    // Step 6: Send confirmation
    async (updated) => sendConfirmation(updated)
  );
}

// Type definitions for examples
interface Order {
  id: string;
  customerId: string;
  items: OrderItem[];
  status: string;
  total?: number;
}

interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

interface PaymentMethod {
  type: 'credit_card' | 'paypal';
  details: any;
}

interface PaymentReceipt {
  orderId: string;
  transactionId: string;
  amount: number;
  timestamp: Date;
}

// Stub functions for examples
declare function getOrder(id: string): AsyncResult<Order, DomainError>;
declare function validateEmail(email: string): AsyncResult<void, DomainError>;
declare function validateName(name: string): AsyncResult<void, DomainError>;
declare function validateAvatarUrl(url: string): AsyncResult<void, DomainError>;
declare function createUser(email: string, name: string): AsyncResult<User, DomainError>;
declare function createProfile(name: string, avatar?: string): AsyncResult<any, DomainError>;
declare function applyDiscounts(result: Result<Order, DomainError>): Result<Order, DomainError>;
declare function checkInventory(result: Result<Order, DomainError>): Result<Order, DomainError>;
declare function loadOrder(id: string): AsyncResult<Order, DomainError>;
declare function validatePaymentMethod(
  order: Order,
  method: PaymentMethod
): AsyncResult<any, DomainError>;
declare function calculateFinalAmount(data: any): AsyncResult<any, DomainError>;
declare function chargePayment(data: any): AsyncResult<any, DomainError>;
declare function updateOrderStatus(data: any): AsyncResult<any, DomainError>;
declare function sendConfirmation(data: any): AsyncResult<PaymentReceipt, DomainError>;
declare const GraphQLError: any;
