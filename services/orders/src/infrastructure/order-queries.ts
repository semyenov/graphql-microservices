import {
  ByCreatedDateQuery,
  ByStateQuery,
  CompositeRepositoryQuery,
  RepositoryQuerySpec,
} from '@graphql-microservices/event-sourcing';
import type { Order, OrderStatus } from '../domain/order-aggregate';

/**
 * Query specification for finding orders by customer ID
 */
export class OrdersByCustomerQuery extends RepositoryQuerySpec<Order> {
  readonly name = `OrdersByCustomer(${this.customerId})`;

  constructor(private readonly customerId: string) {
    super();
  }

  match(order: Order): boolean {
    return order.customerId === this.customerId;
  }

  getHint(): string {
    return `customer_id:${this.customerId}`;
  }
}

/**
 * Query specification for finding orders by status
 */
export class OrdersByStatusQuery extends RepositoryQuerySpec<Order> {
  readonly name = `OrdersByStatus(${this.status})`;

  constructor(private readonly status: OrderStatus) {
    super();
  }

  match(order: Order): boolean {
    return order.status === this.status;
  }

  getHint(): string {
    return `status:${this.status}`;
  }
}

/**
 * Query specification for finding orders by multiple statuses
 */
export class OrdersByStatusesQuery extends RepositoryQuerySpec<Order> {
  readonly name = `OrdersByStatuses([${this.statuses.join(', ')}])`;

  constructor(private readonly statuses: OrderStatus[]) {
    super();
  }

  match(order: Order): boolean {
    return this.statuses.includes(order.status);
  }

  getHint(): string {
    return `statuses:[${this.statuses.join(',')}]`;
  }
}

/**
 * Query specification for finding orders by order number pattern
 */
export class OrdersByNumberPatternQuery extends RepositoryQuerySpec<Order> {
  readonly name = `OrdersByNumberPattern(${this.pattern})`;

  constructor(private readonly pattern: string) {
    super();
  }

  match(order: Order): boolean {
    const orderNumber = order.orderNumber.getValue();
    return (
      orderNumber.includes(this.pattern) ||
      orderNumber.match(new RegExp(this.pattern, 'i')) !== null
    );
  }

  getHint(): string {
    return `order_number_pattern:${this.pattern}`;
  }
}

/**
 * Query specification for finding orders within a total amount range
 */
export class OrdersByAmountRangeQuery extends RepositoryQuerySpec<Order> {
  readonly name = `OrdersByAmountRange(${this.minAmount}-${this.maxAmount} ${this.currency})`;

  constructor(
    private readonly minAmount: number,
    private readonly maxAmount: number,
    private readonly currency: string = 'USD'
  ) {
    super();
  }

  match(order: Order): boolean {
    const totalAmount = order.totalAmount;
    return (
      totalAmount.getCurrency() === this.currency &&
      totalAmount.getAmount() >= this.minAmount &&
      totalAmount.getAmount() <= this.maxAmount
    );
  }

  getHint(): string {
    return `amount_range:${this.minAmount}-${this.maxAmount}:${this.currency}`;
  }
}

/**
 * Query specification for finding active orders (not cancelled, delivered, or refunded)
 */
export class ActiveOrdersQuery extends RepositoryQuerySpec<Order> {
  readonly name = 'ActiveOrders';

  match(order: Order): boolean {
    const inactiveStatuses: OrderStatus[] = ['cancelled', 'delivered', 'refunded'];
    return !inactiveStatuses.includes(order.status);
  }

  getHint(): string {
    return 'status:active';
  }
}

/**
 * Query specification for finding completed orders (delivered or refunded)
 */
export class CompletedOrdersQuery extends RepositoryQuerySpec<Order> {
  readonly name = 'CompletedOrders';

  match(order: Order): boolean {
    const completedStatuses: OrderStatus[] = ['delivered', 'refunded'];
    return completedStatuses.includes(order.status);
  }

  getHint(): string {
    return 'status:completed';
  }
}

/**
 * Query specification for finding orders requiring attention (pending too long, failed payments, etc.)
 */
export class OrdersRequiringAttentionQuery extends RepositoryQuerySpec<Order> {
  readonly name = 'OrdersRequiringAttention';

  constructor(private readonly maxPendingHours: number = 24) {
    super();
  }

  match(order: Order): boolean {
    const now = new Date();
    const hoursSinceCreation = (now.getTime() - order.createdAt.getTime()) / (1000 * 60 * 60);

    // Orders pending too long
    if (order.status === 'pending' && hoursSinceCreation > this.maxPendingHours) {
      return true;
    }

    // Orders with failed payments
    if (order.paymentInfo.getStatus() === 'failed') {
      return true;
    }

    // Orders confirmed but not processing after reasonable time
    if (order.status === 'confirmed' && hoursSinceCreation > 2) {
      return true;
    }

    return false;
  }

  getHint(): string {
    return 'requires_attention:true';
  }
}

/**
 * Query specification for finding orders by item count
 */
export class OrdersByItemCountQuery extends RepositoryQuerySpec<Order> {
  readonly name = `OrdersByItemCount(${this.operator}${this.count})`;

  constructor(
    private readonly count: number,
    private readonly operator: '=' | '>' | '<' | '>=' | '<=' = '='
  ) {
    super();
  }

  match(order: Order): boolean {
    const itemCount = order.items.size;

    switch (this.operator) {
      case '=':
        return itemCount === this.count;
      case '>':
        return itemCount > this.count;
      case '<':
        return itemCount < this.count;
      case '>=':
        return itemCount >= this.count;
      case '<=':
        return itemCount <= this.count;
      default:
        return false;
    }
  }

  getHint(): string {
    return `item_count:${this.operator}${this.count}`;
  }
}

/**
 * Query specification for finding orders containing specific products
 */
export class OrdersContainingProductQuery extends RepositoryQuerySpec<Order> {
  readonly name = `OrdersContainingProduct(${this.productId})`;

  constructor(private readonly productId: string) {
    super();
  }

  match(order: Order): boolean {
    for (const [, item] of order.items) {
      if (item.productId === this.productId) {
        return true;
      }
    }
    return false;
  }

  getHint(): string {
    return `contains_product:${this.productId}`;
  }
}

/**
 * Utility class for building complex order queries
 */
export class OrderQueryBuilder {
  /**
   * Find orders by customer and status
   */
  static byCustomerAndStatus(
    customerId: string,
    status: OrderStatus
  ): CompositeRepositoryQuery<Order> {
    return new CompositeRepositoryQuery(
      [new OrdersByCustomerQuery(customerId), new OrdersByStatusQuery(status)],
      'AND'
    );
  }

  /**
   * Find active orders by customer
   */
  static activeByCustomer(customerId: string): CompositeRepositoryQuery<Order> {
    return new CompositeRepositoryQuery(
      [new OrdersByCustomerQuery(customerId), new ActiveOrdersQuery()],
      'AND'
    );
  }

  /**
   * Find recent orders by customer
   */
  static recentByCustomer(
    customerId: string,
    daysBack: number = 30
  ): CompositeRepositoryQuery<Order> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);

    return new CompositeRepositoryQuery(
      [new OrdersByCustomerQuery(customerId), new ByCreatedDateQuery(fromDate)],
      'AND'
    );
  }

  /**
   * Find high-value orders
   */
  static highValue(minAmount: number = 1000, currency: string = 'USD'): OrdersByAmountRangeQuery {
    return new OrdersByAmountRangeQuery(minAmount, Number.MAX_SAFE_INTEGER, currency);
  }

  /**
   * Find orders requiring urgent attention
   */
  static urgent(): CompositeRepositoryQuery<Order> {
    return new CompositeRepositoryQuery(
      [
        new OrdersRequiringAttentionQuery(2), // 2 hours max pending
        new OrdersByStatusesQuery(['pending', 'confirmed']),
      ],
      'AND'
    );
  }

  /**
   * Find bulk orders (more than specified item count)
   */
  static bulk(minItems: number = 10): OrdersByItemCountQuery {
    return new OrdersByItemCountQuery(minItems, '>=');
  }

  /**
   * Find orders in date range with specific status
   */
  static inDateRangeWithStatus(
    from: Date,
    to: Date,
    status: OrderStatus
  ): CompositeRepositoryQuery<Order> {
    return new CompositeRepositoryQuery(
      [new ByCreatedDateQuery(from, to), new OrdersByStatusQuery(status)],
      'AND'
    );
  }
}

/**
 * Pre-built common queries for easy use
 */
export const CommonOrderQueries = {
  // Status-based queries
  pending: () => new OrdersByStatusQuery('pending'),
  confirmed: () => new OrdersByStatusQuery('confirmed'),
  processing: () => new OrdersByStatusQuery('processing'),
  shipped: () => new OrdersByStatusQuery('shipped'),
  delivered: () => new OrdersByStatusQuery('delivered'),
  cancelled: () => new OrdersByStatusQuery('cancelled'),
  refunded: () => new OrdersByStatusQuery('refunded'),

  // State-based queries
  active: () => new ActiveOrdersQuery(),
  completed: () => new CompletedOrdersQuery(),
  requiresAttention: () => new OrdersRequiringAttentionQuery(),

  // Time-based queries
  today: () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new ByCreatedDateQuery(today);
  },

  thisWeek: () => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return new ByCreatedDateQuery(weekStart);
  },

  thisMonth: () => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    return new ByCreatedDateQuery(monthStart);
  },

  // Value-based queries
  highValue: () => OrderQueryBuilder.highValue(500),
  bulk: () => OrderQueryBuilder.bulk(5),
};
