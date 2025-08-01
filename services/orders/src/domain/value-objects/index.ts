import { z } from 'zod';

// Money value object
export class Money {
  constructor(
    public readonly amount: number,
    public readonly currency: string = 'USD'
  ) {
    if (amount < 0) {
      throw new Error('Money amount cannot be negative');
    }
    if (!currency || currency.length !== 3) {
      throw new Error('Invalid currency code');
    }
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('Cannot add money with different currencies');
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('Cannot subtract money with different currencies');
    }
    if (this.amount < other.amount) {
      throw new Error('Insufficient amount');
    }
    return new Money(this.amount - other.amount, this.currency);
  }

  multiply(factor: number): Money {
    if (factor < 0) {
      throw new Error('Factor cannot be negative');
    }
    return new Money(this.amount * factor, this.currency);
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  isGreaterThan(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new Error('Cannot compare money with different currencies');
    }
    return this.amount > other.amount;
  }

  isLessThan(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new Error('Cannot compare money with different currencies');
    }
    return this.amount < other.amount;
  }

  toString(): string {
    return `${this.currency} ${this.amount.toFixed(2)}`;
  }

  static zero(currency: string = 'USD'): Money {
    return new Money(0, currency);
  }
}

// Address value object
export interface AddressProps {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export class Address {
  private constructor(
    public readonly street: string,
    public readonly city: string,
    public readonly state: string,
    public readonly postalCode: string,
    public readonly country: string
  ) {}

  static create(props: AddressProps): Address {
    const schema = z.object({
      street: z.string().min(1, 'Street is required'),
      city: z.string().min(1, 'City is required'),
      state: z.string().min(1, 'State is required'),
      postalCode: z.string().min(1, 'Postal code is required'),
      country: z.string().min(1, 'Country is required'),
    });

    const validated = schema.parse(props);
    return new Address(
      validated.street,
      validated.city,
      validated.state,
      validated.postalCode,
      validated.country
    );
  }

  equals(other: Address): boolean {
    return (
      this.street === other.street &&
      this.city === other.city &&
      this.state === other.state &&
      this.postalCode === other.postalCode &&
      this.country === other.country
    );
  }

  toString(): string {
    return `${this.street}, ${this.city}, ${this.state} ${this.postalCode}, ${this.country}`;
  }

  toObject(): AddressProps {
    return {
      street: this.street,
      city: this.city,
      state: this.state,
      postalCode: this.postalCode,
      country: this.country,
    };
  }
}

// Order Number value object
export class OrderNumber {
  private constructor(public readonly value: string) {}

  static create(value?: string): OrderNumber {
    if (value) {
      // Validate existing order number format
      const pattern = /^ORD-\d{4}-\d{2}-\d{2}-\d{6}$/;
      if (!pattern.test(value)) {
        throw new Error('Invalid order number format');
      }
      return new OrderNumber(value);
    }

    // Generate new order number
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000000)
      .toString()
      .padStart(6, '0');

    return new OrderNumber(`ORD-${year}-${month}-${day}-${random}`);
  }

  equals(other: OrderNumber): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

// Order Item value object
export interface OrderItemProps {
  productId: string;
  name: string;
  quantity: number;
  price: Money;
}

export class OrderItem {
  constructor(
    public readonly productId: string,
    public readonly name: string,
    public readonly quantity: number,
    public readonly price: Money
  ) {
    if (!productId || productId.trim() === '') {
      throw new Error('Product ID is required');
    }
    if (!name || name.trim() === '') {
      throw new Error('Product name is required');
    }
    if (quantity <= 0) {
      throw new Error('Quantity must be positive');
    }
  }

  getTotal(): Money {
    return this.price.multiply(this.quantity);
  }

  updateQuantity(newQuantity: number): OrderItem {
    return new OrderItem(this.productId, this.name, newQuantity, this.price);
  }

  equals(other: OrderItem): boolean {
    return (
      this.productId === other.productId &&
      this.name === other.name &&
      this.quantity === other.quantity &&
      this.price.equals(other.price)
    );
  }

  toObject(): OrderItemProps & { total: number } {
    return {
      productId: this.productId,
      name: this.name,
      quantity: this.quantity,
      price: this.price,
      total: this.getTotal().amount,
    };
  }
}

// Order Status value object
export type OrderStatusValue =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export class OrderStatus {
  private static readonly validTransitions: Record<OrderStatusValue, OrderStatusValue[]> = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['PROCESSING', 'CANCELLED'],
    PROCESSING: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED', 'CANCELLED'],
    DELIVERED: ['REFUNDED'],
    CANCELLED: [],
    REFUNDED: [],
  };

  constructor(public readonly value: OrderStatusValue) {}

  canTransitionTo(newStatus: OrderStatusValue): boolean {
    const allowedTransitions = OrderStatus.validTransitions[this.value];
    return allowedTransitions.includes(newStatus);
  }

  transitionTo(newStatus: OrderStatusValue): OrderStatus {
    if (!this.canTransitionTo(newStatus)) {
      throw new Error(`Invalid status transition from ${this.value} to ${newStatus}`);
    }
    return new OrderStatus(newStatus);
  }

  isFinal(): boolean {
    return ['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(this.value);
  }

  equals(other: OrderStatus): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

// Tracking Info value object
export interface TrackingInfoProps {
  trackingNumber: string;
  carrier: string;
  estimatedDeliveryDate: Date;
  shippedDate: Date;
}

export class TrackingInfo {
  constructor(
    public readonly trackingNumber: string,
    public readonly carrier: string,
    public readonly estimatedDeliveryDate: Date,
    public readonly shippedDate: Date
  ) {
    if (!trackingNumber || trackingNumber.trim() === '') {
      throw new Error('Tracking number is required');
    }
    if (!carrier || carrier.trim() === '') {
      throw new Error('Carrier is required');
    }
    if (estimatedDeliveryDate < shippedDate) {
      throw new Error('Estimated delivery date cannot be before shipped date');
    }
  }

  static create(props: Omit<TrackingInfoProps, 'shippedDate'>): TrackingInfo {
    return new TrackingInfo(
      props.trackingNumber,
      props.carrier,
      props.estimatedDeliveryDate,
      new Date()
    );
  }

  equals(other: TrackingInfo): boolean {
    return (
      this.trackingNumber === other.trackingNumber &&
      this.carrier === other.carrier &&
      this.estimatedDeliveryDate.getTime() === other.estimatedDeliveryDate.getTime() &&
      this.shippedDate.getTime() === other.shippedDate.getTime()
    );
  }

  toObject(): TrackingInfoProps {
    return {
      trackingNumber: this.trackingNumber,
      carrier: this.carrier,
      estimatedDeliveryDate: this.estimatedDeliveryDate,
      shippedDate: this.shippedDate,
    };
  }
}

// Payment Method value object
export type PaymentMethodType = 'CREDIT_CARD' | 'DEBIT_CARD' | 'PAYPAL' | 'BANK_TRANSFER';

export class PaymentMethod {
  constructor(
    public readonly type: PaymentMethodType,
    public readonly lastFourDigits?: string
  ) {
    if (lastFourDigits && !/^\d{4}$/.test(lastFourDigits)) {
      throw new Error('Last four digits must be exactly 4 digits');
    }
  }

  equals(other: PaymentMethod): boolean {
    return this.type === other.type && this.lastFourDigits === other.lastFourDigits;
  }

  toString(): string {
    if (this.lastFourDigits) {
      return `${this.type} ending in ${this.lastFourDigits}`;
    }
    return this.type;
  }
}
