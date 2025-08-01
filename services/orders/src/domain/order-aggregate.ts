import {
  AggregateRoot,
  type DomainEvent,
  EventFactory,
} from '@graphql-microservices/event-sourcing';
import {
  BusinessRuleError,
  generateId,
  ValidationError,
} from '@graphql-microservices/shared-errors';
import {
  Address,
  Money,
  OrderNumber,
  OrderQuantity,
  PaymentInfo,
  ShippingInfo,
} from './value-objects';

/**
 * Order Status enum
 */
export type OrderStatus =
  | 'pending' // Order created, awaiting payment
  | 'confirmed' // Payment confirmed, being processed
  | 'processing' // Order being prepared
  | 'shipped' // Order shipped
  | 'delivered' // Order delivered
  | 'cancelled' // Order cancelled
  | 'refunded'; // Order refunded

/**
 * Order Item interface
 */
export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: OrderQuantity;
  unitPrice: Money;
  totalPrice: Money;
}

/**
 * Order domain events
 */
export interface OrderCreatedEvent extends DomainEvent {
  type: 'OrderCreated';
  data: {
    orderNumber: string;
    customerId: string;
    items: Array<{
      id: string;
      productId: string;
      productName: string;
      productSku: string;
      quantity: number;
      unitPrice: { amount: number; currency: string };
      totalPrice: { amount: number; currency: string };
    }>;
    subtotal: { amount: number; currency: string };
    tax: { amount: number; currency: string };
    shippingCost: { amount: number; currency: string };
    totalAmount: { amount: number; currency: string };
    shippingAddress: ReturnType<Address['toJSON']>;
    billingAddress?: ReturnType<Address['toJSON']>;
    paymentInfo: ReturnType<PaymentInfo['toJSON']>;
    shippingInfo: ReturnType<ShippingInfo['toJSON']>;
  };
}

export interface OrderStatusChangedEvent extends DomainEvent {
  type: 'OrderStatusChanged';
  data: {
    orderNumber: string;
    newStatus: OrderStatus;
    previousStatus: OrderStatus;
    reason?: string;
    changedBy?: string;
  };
}

export interface OrderItemAddedEvent extends DomainEvent {
  type: 'OrderItemAdded';
  data: {
    orderNumber: string;
    item: {
      id: string;
      productId: string;
      productName: string;
      productSku: string;
      quantity: number;
      unitPrice: { amount: number; currency: string };
      totalPrice: { amount: number; currency: string };
    };
    newSubtotal: { amount: number; currency: string };
    newTotalAmount: { amount: number; currency: string };
  };
}

export interface OrderItemRemovedEvent extends DomainEvent {
  type: 'OrderItemRemoved';
  data: {
    orderNumber: string;
    itemId: string;
    removedItem: {
      productId: string;
      productName: string;
      quantity: number;
      totalPrice: { amount: number; currency: string };
    };
    newSubtotal: { amount: number; currency: string };
    newTotalAmount: { amount: number; currency: string };
  };
}

export interface OrderItemQuantityChangedEvent extends DomainEvent {
  type: 'OrderItemQuantityChanged';
  data: {
    orderNumber: string;
    itemId: string;
    productId: string;
    newQuantity: number;
    previousQuantity: number;
    newItemTotal: { amount: number; currency: string };
    newSubtotal: { amount: number; currency: string };
    newTotalAmount: { amount: number; currency: string };
  };
}

export interface OrderPaymentUpdatedEvent extends DomainEvent {
  type: 'OrderPaymentUpdated';
  data: {
    orderNumber: string;
    paymentInfo: ReturnType<PaymentInfo['toJSON']>;
    previousPaymentStatus: string;
  };
}

export interface OrderShippingUpdatedEvent extends DomainEvent {
  type: 'OrderShippingUpdated';
  data: {
    orderNumber: string;
    shippingInfo: ReturnType<ShippingInfo['toJSON']>;
    trackingNumber?: string;
  };
}

export interface OrderCancelledEvent extends DomainEvent {
  type: 'OrderCancelled';
  data: {
    orderNumber: string;
    reason: string;
    cancelledBy: string;
    refundAmount?: { amount: number; currency: string };
  };
}

export interface OrderRefundedEvent extends DomainEvent {
  type: 'OrderRefunded';
  data: {
    orderNumber: string;
    refundAmount: { amount: number; currency: string };
    reason: string;
    refundedBy: string;
    refundTransactionId?: string;
  };
}

export type OrderDomainEvent =
  | OrderCreatedEvent
  | OrderStatusChangedEvent
  | OrderItemAddedEvent
  | OrderItemRemovedEvent
  | OrderItemQuantityChangedEvent
  | OrderPaymentUpdatedEvent
  | OrderShippingUpdatedEvent
  | OrderCancelledEvent
  | OrderRefundedEvent;

/**
 * Order aggregate errors
 */
export class OrderDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'OrderDomainError';
  }
}

export class OrderNotFoundError extends OrderDomainError {
  constructor(id: string) {
    super(`Order with id '${id}' not found`, 'ORDER_NOT_FOUND');
  }
}

export class InvalidOrderStatusTransitionError extends OrderDomainError {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Invalid order status transition from '${from}' to '${to}'`, 'INVALID_STATUS_TRANSITION');
  }
}

export class OrderNotModifiableError extends OrderDomainError {
  constructor(status: OrderStatus) {
    super(`Order cannot be modified in '${status}' status`, 'ORDER_NOT_MODIFIABLE');
  }
}

export class OrderItemNotFoundError extends OrderDomainError {
  constructor(itemId: string) {
    super(`Order item with id '${itemId}' not found`, 'ORDER_ITEM_NOT_FOUND');
  }
}

export class InvalidOrderTotalError extends OrderDomainError {
  constructor(reason: string) {
    super(`Invalid order total: ${reason}`, 'INVALID_ORDER_TOTAL');
  }
}

/**
 * Order aggregate root
 */
export class Order extends AggregateRoot<Record<string, unknown>> {
  private _orderNumber: OrderNumber = OrderNumber.fromString('ORD-20240101-00001');
  private _customerId: string = '';
  private _status: OrderStatus = 'pending';
  private _items: Map<string, OrderItem> = new Map();
  private _subtotal: Money = Money.zero();
  private _tax: Money = Money.zero();
  private _shippingCost: Money = Money.zero();
  private _totalAmount: Money = Money.zero();
  private _shippingAddress: Address = Address.fromJSON({
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  });
  private _billingAddress?: Address;
  private _paymentInfo: PaymentInfo = PaymentInfo.fromJSON({
    method: 'credit_card',
    status: 'pending',
  });
  private _shippingInfo: ShippingInfo = ShippingInfo.fromJSON({
    method: 'standard',
    shippingAddress: {
      street: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'US',
    },
    cost: { amount: 0, currency: 'USD' },
  });

  private _createdAt: Date = new Date();
  private _updatedAt: Date = new Date();

  constructor(
    id: string,
    data: {
      orderNumber: OrderNumber;
      customerId: string;
      items: OrderItem[];
      shippingAddress: Address;
      paymentInfo: PaymentInfo;
      shippingInfo: ShippingInfo;
      billingAddress?: Address;
    },
    version: number = 0
  ) {
    super(id, data, version);
  }

  get orderNumber(): OrderNumber {
    return this._orderNumber;
  }

  get customerId(): string {
    return this._customerId;
  }

  get status(): OrderStatus {
    return this._status;
  }

  get items(): Map<string, OrderItem> {
    return this._items;
  }

  get subtotal(): Money {
    return this._subtotal;
  }

  get tax(): Money {
    return this._tax;
  }

  get shippingCost(): Money {
    return this._shippingCost;
  }

  get totalAmount(): Money {
    return this._totalAmount;
  }

  get shippingAddress(): Address {
    return this._shippingAddress;
  }

  get billingAddress(): Address | undefined {
    return this._billingAddress;
  }

  get paymentInfo(): PaymentInfo {
    return this._paymentInfo;
  }

  get shippingInfo(): ShippingInfo {
    return this._shippingInfo;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Create a new order
   */
  static createOrder(
    input: {
      id: string;
      orderNumber: OrderNumber;
      customerId: string;
      items: OrderItem[];
      shippingAddress: Address;
      paymentInfo: PaymentInfo;
      shippingInfo: ShippingInfo;
      billingAddress?: Address;
    },
    metadata?: { correlationId?: string; userId?: string }
  ): Order {
    const order = new Order(
      input.id,
      {
        orderNumber: input.orderNumber,
        customerId: input.customerId,
        items: input.items,
        shippingAddress: input.shippingAddress,
        paymentInfo: input.paymentInfo,
        shippingInfo: input.shippingInfo,
        billingAddress: input.billingAddress,
      },
      0
    );

    // Validate required fields
    if (!input.customerId || input.customerId.trim().length === 0) {
      throw new ValidationError('Customer ID is required');
    }

    if (input.items.length === 0) {
      throw new ValidationError('Order must have at least one item');
    }

    if (input.items.length > 50) {
      throw new BusinessRuleError('Order cannot have more than 50 items');
    }

    // Create order items and calculate totals
    const orderItems: Array<{
      id: string;
      productId: string;
      productName: string;
      productSku: string;
      quantity: number;
      unitPrice: { amount: number; currency: string };
      totalPrice: { amount: number; currency: string };
    }> = [];

    let subtotal = Money.zero(input.items[0]?.unitPrice.getCurrency());

    for (const item of input.items) {
      const itemId = generateId();
      const quantity = OrderQuantity.fromNumber(item.quantity.getValue());
      const totalPrice = quantity.calculateTotal(item.unitPrice);

      orderItems.push({
        id: itemId,
        productId: item.productId,
        productName: input.items[0]?.productName ?? '',
        productSku: input.items[0]?.productSku ?? '',
        quantity: input.items[0]?.quantity.getValue() ?? 0,
        unitPrice: item.unitPrice.toJSON(),
        totalPrice: totalPrice.toJSON(),
      });

      subtotal = subtotal.add(totalPrice);
    }

    // Calculate tax (8.5% for simplicity - in real app, this would be based on location)
    const tax = subtotal.multiply(0.085);

    // Calculate total
    const totalAmount = subtotal.add(tax).add(input.shippingInfo.getCost());

    // Validate minimum order amount
    if (totalAmount.getAmount() < 1.0) {
      throw new BusinessRuleError('Order total must be at least $1.00');
    }

    // Validate maximum order amount
    if (totalAmount.getAmount() > 50000.0) {
      throw new BusinessRuleError('Order total cannot exceed $50,000.00');
    }

    const event = EventFactory.create(
      'OrderCreated',
      input.id,
      'Order',
      {
        orderNumber: input.orderNumber.getValue(),
        customerId: input.customerId,
        items: orderItems,
        subtotal: subtotal.toJSON(),
        tax: tax.toJSON(),
        shippingCost: input.shippingInfo.getCost().toJSON(),
        totalAmount: totalAmount.toJSON(),
        shippingAddress: input.shippingAddress.toJSON(),
        billingAddress: input.billingAddress?.toJSON(),
        paymentInfo: input.paymentInfo.toJSON(),
        shippingInfo: input.shippingInfo.toJSON(),
      },
      {
        source: 'orders-service',
        correlationId: metadata?.correlationId,
        userId: metadata?.userId,
      },
      1
    );

    order.applyEvent(event);
    return order;
  }

  /**
   * Create order from events (for event sourcing reconstruction)
   */
  static fromOrderEvents(events: DomainEvent[]): Order {
    const orderId = events[0]?.aggregateId ?? '';
    const orderNumber = OrderNumber.fromString('ORD-20240101-00001');
    const customerId = '';
    const orderItems: OrderItem[] = [];
    const shippingAddress = Address.fromJSON({
      street: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'US',
    });
    const paymentInfo = PaymentInfo.fromJSON({ method: 'credit_card', status: 'pending' });
    const shippingInfo = ShippingInfo.fromJSON({
      method: 'standard',
      shippingAddress: { street: '', city: '', state: '', postalCode: '', country: 'US' },
      cost: { amount: 0, currency: 'USD' },
    });
    const order = new Order(orderId, {
      orderNumber,
      customerId,
      items: orderItems,
      shippingAddress,
      paymentInfo,
      shippingInfo,
      billingAddress: undefined,
    });
    if (events.length === 0) {
      return order;
    }

    // Apply all events to reconstruct state
    for (const event of events) {
      order.applyEventData(event);
    }

    order.markEventsAsCommitted();
    return order;
  }

  /**
   * Change order status
   */
  changeStatus(
    newStatus: OrderStatus,
    reason?: string,
    changedBy?: string,
    metadata?: { correlationId?: string }
  ): void {
    if (newStatus === this.status) {
      return; // No change needed
    }

    // Validate status transition
    this.validateStatusTransition(this.status, newStatus);

    const event = EventFactory.create(
      'OrderStatusChanged',
      this.id,
      'Order',
      {
        orderNumber: this.orderNumber.getValue(),
        newStatus,
        previousStatus: this.status,
        reason,
        changedBy,
      },
      {
        source: 'orders-service',
        correlationId: metadata?.correlationId,
        userId: changedBy,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Add item to order
   */
  addItem(
    productId: string,
    productName: string,
    productSku: string,
    quantity: number,
    unitPrice: Money,
    metadata?: { correlationId?: string; userId?: string }
  ): void {
    if (!this.canModifyItems()) {
      throw new OrderNotModifiableError(this.status);
    }

    // Check if item already exists
    const existingItem = Array.from(this.items.values()).find(
      (item) => item.productId === productId
    );

    if (existingItem) {
      // Update quantity instead of adding duplicate
      this.updateItemQuantity(
        existingItem.id,
        existingItem.quantity.getValue() + quantity,
        metadata
      );
      return;
    }

    const itemId = generateId();
    const itemQuantity = OrderQuantity.fromNumber(quantity);
    const totalPrice = itemQuantity.calculateTotal(unitPrice);

    // Validate currency consistency
    if (!this.subtotal.equals(Money.zero())) {
      if (unitPrice.getCurrency() !== this.subtotal.getCurrency()) {
        throw new ValidationError('All items must use the same currency');
      }
    }

    const newSubtotal = this.subtotal.add(totalPrice);
    const newTotalAmount = this.calculateTotalAmount(newSubtotal);

    const event = EventFactory.create(
      'OrderItemAdded',
      this.id,
      'Order',
      {
        orderNumber: this.orderNumber.getValue(),
        item: {
          id: itemId,
          productId,
          productName,
          productSku,
          quantity,
          unitPrice: unitPrice.toJSON(),
          totalPrice: totalPrice.toJSON(),
        },
        newSubtotal: newSubtotal.toJSON(),
        newTotalAmount: newTotalAmount.toJSON(),
      },
      {
        source: 'orders-service',
        correlationId: metadata?.correlationId,
        userId: metadata?.userId,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Remove item from order
   */
  removeItem(itemId: string, metadata?: { correlationId?: string; userId?: string }): void {
    if (!this.canModifyItems()) {
      throw new OrderNotModifiableError(this.status);
    }

    const item = this.items.get(itemId);
    if (!item) {
      throw new OrderItemNotFoundError(itemId);
    }

    // Cannot remove the last item
    if (this.items.size === 1) {
      throw new BusinessRuleError(
        'Cannot remove the last item from order. Cancel the order instead.'
      );
    }

    const newSubtotal = this.subtotal.subtract(item.totalPrice);
    const newTotalAmount = this.calculateTotalAmount(newSubtotal);

    const event = EventFactory.create(
      'OrderItemRemoved',
      this.id,
      'Order',
      {
        orderNumber: this.orderNumber.getValue(),
        itemId,
        removedItem: {
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity.getValue(),
          totalPrice: item.totalPrice.toJSON(),
        },
        newSubtotal: newSubtotal.toJSON(),
        newTotalAmount: newTotalAmount.toJSON(),
      },
      {
        source: 'orders-service',
        correlationId: metadata?.correlationId,
        userId: metadata?.userId,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Update item quantity
   */
  updateItemQuantity(
    itemId: string,
    newQuantity: number,
    metadata?: { correlationId?: string; userId?: string }
  ): void {
    if (!this.canModifyItems()) {
      throw new OrderNotModifiableError(this.status);
    }

    const item = this.items.get(itemId);
    if (!item) {
      throw new OrderItemNotFoundError(itemId);
    }

    if (newQuantity <= 0) {
      this.removeItem(itemId, metadata);
      return;
    }

    const previousQuantity = item.quantity.getValue();
    if (newQuantity === previousQuantity) {
      return; // No change needed
    }

    const newOrderQuantity = OrderQuantity.fromNumber(newQuantity);
    const newItemTotal = newOrderQuantity.calculateTotal(item.unitPrice);

    // Calculate new totals
    const quantityDifference = newQuantity - previousQuantity;
    const priceDifference = item.unitPrice.multiply(quantityDifference);
    const newSubtotal = this.subtotal.add(priceDifference);
    const newTotalAmount = this.calculateTotalAmount(newSubtotal);

    const event = EventFactory.create(
      'OrderItemQuantityChanged',
      this.id,
      'Order',
      {
        orderNumber: this.orderNumber.getValue(),
        itemId,
        productId: item.productId,
        newQuantity,
        previousQuantity,
        newItemTotal: newItemTotal.toJSON(),
        newSubtotal: newSubtotal.toJSON(),
        newTotalAmount: newTotalAmount.toJSON(),
      },
      {
        source: 'orders-service',
        correlationId: metadata?.correlationId,
        userId: metadata?.userId,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Update payment information
   */
  updatePaymentInfo(
    paymentInfo: PaymentInfo,
    metadata?: { correlationId?: string; userId?: string }
  ): void {
    if (this.status === 'delivered' || this.status === 'cancelled' || this.status === 'refunded') {
      throw new OrderNotModifiableError(this.status);
    }

    const previousPaymentStatus = this.paymentInfo.getStatus();

    const event = EventFactory.create(
      'OrderPaymentUpdated',
      this.id,
      'Order',
      {
        orderNumber: this.orderNumber.getValue(),
        paymentInfo: paymentInfo.toJSON(),
        previousPaymentStatus,
      },
      {
        source: 'orders-service',
        correlationId: metadata?.correlationId,
        userId: metadata?.userId,
      },
      this.version + 1
    );

    this.applyEvent(event);

    // Auto-update status based on payment
    if (paymentInfo.isSuccessful() && this.status === 'pending') {
      this.changeStatus('confirmed', 'Payment confirmed', metadata?.userId, metadata);
    } else if (paymentInfo.isFailed() && this.status === 'pending') {
      this.changeStatus('cancelled', 'Payment failed', metadata?.userId, metadata);
    }
  }

  /**
   * Update shipping information
   */
  updateShippingInfo(
    shippingInfo: ShippingInfo,
    metadata?: { correlationId?: string; userId?: string }
  ): void {
    if (this.status === 'delivered' || this.status === 'cancelled' || this.status === 'refunded') {
      throw new OrderNotModifiableError(this.status);
    }

    const event = EventFactory.create(
      'OrderShippingUpdated',
      this.id,
      'Order',
      {
        orderNumber: this.orderNumber.getValue(),
        shippingInfo: shippingInfo.toJSON(),
        trackingNumber: shippingInfo.getTrackingNumber(),
      },
      {
        source: 'orders-service',
        correlationId: metadata?.correlationId,
        userId: metadata?.userId,
      },
      this.version + 1
    );

    this.applyEvent(event);

    // Auto-update status if tracking number is added
    if (shippingInfo.getTrackingNumber() && this.status === 'processing') {
      this.changeStatus('shipped', 'Tracking number added', metadata?.userId, metadata);
    }
  }

  /**
   * Cancel order
   */
  cancel(reason: string, cancelledBy: string, metadata?: { correlationId?: string }): void {
    if (!this.canCancel()) {
      throw new BusinessRuleError(`Cannot cancel order in ${this.status} status`);
    }

    // Calculate refund amount if payment was captured
    let refundAmount: Money | undefined;
    if (this.paymentInfo.getStatus() === 'captured') {
      refundAmount = this.totalAmount;
    }

    const event = EventFactory.create(
      'OrderCancelled',
      this.id,
      'Order',
      {
        orderNumber: this.orderNumber.getValue(),
        reason,
        cancelledBy,
        refundAmount: refundAmount?.toJSON(),
      },
      {
        source: 'orders-service',
        correlationId: metadata?.correlationId,
        userId: cancelledBy,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Process refund
   */
  refund(
    refundAmount: Money,
    reason: string,
    refundedBy: string,
    refundTransactionId?: string,
    metadata?: { correlationId?: string }
  ): void {
    if (this.status !== 'delivered' && this.status !== 'cancelled') {
      throw new BusinessRuleError(`Cannot refund order in ${this.status} status`);
    }

    if (refundAmount.isGreaterThan(this.totalAmount)) {
      throw new ValidationError('Refund amount cannot exceed order total');
    }

    if (refundAmount.getCurrency() !== this.totalAmount.getCurrency()) {
      throw new ValidationError('Refund currency must match order currency');
    }

    const event = EventFactory.create(
      'OrderRefunded',
      this.id,
      'Order',
      {
        orderNumber: this.orderNumber.getValue(),
        refundAmount: refundAmount.toJSON(),
        reason,
        refundedBy,
        refundTransactionId,
      },
      {
        source: 'orders-service',
        correlationId: metadata?.correlationId,
        userId: refundedBy,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Apply event data to aggregate state
   */
  protected override applyEventData(event: DomainEvent): void {
    switch (event.type) {
      case 'OrderCreated': {
        const data = event.data as OrderCreatedEvent['data'];
        this._orderNumber = OrderNumber.fromString(data.orderNumber);
        this._customerId = data.customerId;
        this._status = 'pending';
        this._subtotal = Money.fromJSON(data.subtotal);
        this._tax = Money.fromJSON(data.tax);
        this._shippingCost = Money.fromJSON(data.shippingCost);
        this._totalAmount = Money.fromJSON(data.totalAmount);
        this._shippingAddress = Address.fromJSON(data.shippingAddress);
        this._billingAddress = data.billingAddress
          ? Address.fromJSON(data.billingAddress)
          : undefined;
        this._paymentInfo = PaymentInfo.fromJSON(data.paymentInfo as any);
        this._shippingInfo = ShippingInfo.fromJSON(data.shippingInfo as any);
        this._createdAt = event.occurredAt;
        this._updatedAt = event.occurredAt;

        // Recreate items
        this._items.clear();
        for (const itemData of data.items) {
          this._items.set(itemData.id, {
            id: itemData.id,
            productId: itemData.productId,
            productName: itemData.productName,
            productSku: itemData.productSku,
            quantity: OrderQuantity.fromNumber(itemData.quantity),
            unitPrice: Money.fromJSON(itemData.unitPrice),
            totalPrice: Money.fromJSON(itemData.totalPrice),
          });
        }
        break;
      }

      case 'OrderStatusChanged': {
        const data = event.data as OrderStatusChangedEvent['data'];
        this._status = data.newStatus;
        this._updatedAt = event.occurredAt;
        break;
      }

      case 'OrderItemAdded': {
        const data = event.data as OrderItemAddedEvent['data'];
        const item = data.item;
        this._items.set(item.id, {
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          quantity: OrderQuantity.fromNumber(item.quantity),
          unitPrice: Money.fromJSON(item.unitPrice),
          totalPrice: Money.fromJSON(item.totalPrice),
        });
        this._subtotal = Money.fromJSON(data.newSubtotal);
        this._totalAmount = Money.fromJSON(data.newTotalAmount);
        this._updatedAt = event.occurredAt;
        break;
      }

      case 'OrderItemRemoved': {
        const data = event.data as OrderItemRemovedEvent['data'];
        this._items.delete(data.itemId);
        this._subtotal = Money.fromJSON(data.newSubtotal);
        this._totalAmount = Money.fromJSON(data.newTotalAmount);
        this._updatedAt = event.occurredAt;
        break;
      }

      case 'OrderItemQuantityChanged': {
        const data = event.data as OrderItemQuantityChangedEvent['data'];
        const item = this._items.get(data.itemId);
        if (item) {
          this._items.set(data.itemId, {
            ...item,
            quantity: OrderQuantity.fromNumber(data.newQuantity),
            totalPrice: Money.fromJSON(data.newItemTotal),
          });
        }
        this._subtotal = Money.fromJSON(data.newSubtotal);
        this._totalAmount = Money.fromJSON(data.newTotalAmount);
        this._updatedAt = event.occurredAt;
        break;
      }

      case 'OrderPaymentUpdated': {
        const data = event.data as OrderPaymentUpdatedEvent['data'];
        this._paymentInfo = PaymentInfo.fromJSON(data.paymentInfo as any);
        this._updatedAt = event.occurredAt;
        break;
      }

      case 'OrderShippingUpdated': {
        const data = event.data as OrderShippingUpdatedEvent['data'];
        this._shippingInfo = ShippingInfo.fromJSON(data.shippingInfo as any);
        this._updatedAt = event.occurredAt;
        break;
      }

      case 'OrderCancelled':
        this._status = 'cancelled';
        this._updatedAt = event.occurredAt;
        break;

      case 'OrderRefunded':
        this._status = 'refunded';
        this._updatedAt = event.occurredAt;
        break;

      default:
        throw new Error(`Unknown event type: ${(event as { type: string }).type}`);
    }
  }

  /**
   * Validate status transition
   */
  private validateStatusTransition(from: OrderStatus, to: OrderStatus): void {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['shipped', 'cancelled'],
      shipped: ['delivered', 'cancelled'],
      delivered: ['refunded'],
      cancelled: [], // Cannot transition from cancelled
      refunded: [], // Cannot transition from refunded
    };

    const allowedStatuses = validTransitions[from];
    if (!allowedStatuses.includes(to)) {
      throw new InvalidOrderStatusTransitionError(from, to);
    }
  }

  /**
   * Check if order items can be modified
   */
  private canModifyItems(): boolean {
    return this.status === 'pending' || this.status === 'confirmed';
  }

  /**
   * Check if order can be cancelled
   */
  private canCancel(): boolean {
    return this.status !== 'delivered' && this.status !== 'cancelled' && this.status !== 'refunded';
  }

  /**
   * Calculate total amount including tax and shipping
   */
  private calculateTotalAmount(subtotal: Money): Money {
    const tax = subtotal.multiply(0.085); // 8.5% tax rate
    return subtotal.add(tax).add(this.shippingCost);
  }

  // Getters
  getOrderNumber(): OrderNumber {
    return this._orderNumber;
  }

  getCustomerId(): string {
    return this._customerId;
  }

  getStatus(): OrderStatus {
    return this._status;
  }

  getItems(): OrderItem[] {
    return Array.from(this._items.values());
  }

  getItem(itemId: string): OrderItem | undefined {
    return this._items.get(itemId);
  }

  getSubtotal(): Money {
    return this._subtotal;
  }

  getTax(): Money {
    return this._tax;
  }

  getShippingCost(): Money {
    return this._shippingCost;
  }

  getTotalAmount(): Money {
    return this._totalAmount;
  }

  getShippingAddress(): Address {
    return this._shippingAddress;
  }

  getBillingAddress(): Address | undefined {
    return this._billingAddress;
  }

  getPaymentInfo(): PaymentInfo {
    return this._paymentInfo;
  }

  getShippingInfo(): ShippingInfo {
    return this._shippingInfo;
  }

  getCreatedAt(): Date {
    return this._createdAt;
  }

  getUpdatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Get total item count
   */
  getTotalItemCount(): number {
    return Array.from(this._items.values()).reduce(
      (total, item) => total + item.quantity.getValue(),
      0
    );
  }

  /**
   * Check if order is pending payment
   */
  isPendingPayment(): boolean {
    return this._status === 'pending' && this._paymentInfo.isPending();
  }

  /**
   * Check if order is ready to ship
   */
  isReadyToShip(): boolean {
    return this._status === 'confirmed' || this._status === 'processing';
  }

  /**
   * Check if order is completed
   */
  isCompleted(): boolean {
    return this._status === 'delivered';
  }

  /**
   * Check if order is cancelled
   */
  isCancelled(): boolean {
    return this._status === 'cancelled';
  }
}
