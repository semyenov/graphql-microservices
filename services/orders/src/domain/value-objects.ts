import { ValidationError } from '@graphql-microservices/shared-errors';

/**
 * Money value object for handling currency and amounts
 * (Reusing from products but could be moved to shared domain)
 */
export class Money {
  private readonly amount: number;
  private readonly currency: string;

  constructor(amount: number, currency: string = 'USD') {
    if (amount < 0) {
      throw new ValidationError('Amount cannot be negative', [
        { field: 'amount', message: 'Must be non-negative', value: amount },
      ]);
    }

    if (!currency || currency.length !== 3) {
      throw new ValidationError('Invalid currency code', [
        { field: 'currency', message: 'Must be a valid 3-letter currency code', value: currency },
      ]);
    }

    this.amount = Math.round(amount * 100) / 100; // Round to 2 decimal places
    this.currency = currency.toUpperCase();
  }

  getAmount(): number {
    return this.amount;
  }

  getCurrency(): string {
    return this.currency;
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new ValidationError('Cannot add different currencies');
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new ValidationError('Cannot subtract different currencies');
    }
    return new Money(this.amount - other.amount, this.currency);
  }

  multiply(multiplier: number): Money {
    if (multiplier < 0) {
      throw new ValidationError('Multiplier cannot be negative');
    }
    return new Money(this.amount * multiplier, this.currency);
  }

  isGreaterThan(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new ValidationError('Cannot compare different currencies');
    }
    return this.amount > other.amount;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  toString(): string {
    return `${this.amount} ${this.currency}`;
  }

  toJSON(): { amount: number; currency: string } {
    return {
      amount: this.amount,
      currency: this.currency,
    };
  }

  static fromJSON(data: { amount: number; currency: string }): Money {
    return new Money(data.amount, data.currency);
  }

  static zero(currency: string = 'USD'): Money {
    return new Money(0, currency);
  }
}

/**
 * Order Number value object with validation and formatting
 */
export class OrderNumber {
  private readonly value: string;

  constructor(orderNumber: string) {
    if (!orderNumber || typeof orderNumber !== 'string') {
      throw new ValidationError('Order number is required', [
        { field: 'orderNumber', message: 'Must be a non-empty string', value: orderNumber },
      ]);
    }

    const normalized = orderNumber.trim().toUpperCase();

    // Order number format: ORD-YYYYMMDD-XXXXX (e.g., ORD-20240131-00001)
    const orderPattern = /^ORD-\d{8}-\d{5}$/;
    if (!orderPattern.test(normalized)) {
      throw new ValidationError('Invalid order number format', [
        {
          field: 'orderNumber',
          message: 'Must follow format: ORD-YYYYMMDD-XXXXX',
          value: orderNumber,
        },
      ]);
    }

    this.value = normalized;
  }

  getValue(): string {
    return this.value;
  }

  /**
   * Get the date part from order number
   */
  getOrderDate(): string {
    return this.value.split('-')[1] || '';
  }

  /**
   * Get the sequence number from order number
   */
  getSequenceNumber(): string {
    return this.value.split('-')[2] || '';
  }

  equals(other: OrderNumber): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }

  static fromString(orderNumber: string): OrderNumber {
    return new OrderNumber(orderNumber);
  }

  /**
   * Generate a new order number for today
   */
  static generate(sequenceNumber: number): OrderNumber {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const sequence = sequenceNumber.toString().padStart(5, '0');
    return new OrderNumber(`ORD-${dateStr}-${sequence}`);
  }
}

/**
 * Address value object for shipping and billing
 */
export class Address {
  private readonly street: string;
  private readonly city: string;
  private readonly state: string;
  private readonly postalCode: string;
  private readonly country: string;
  private readonly additionalInfo?: string;

  constructor(
    street: string,
    city: string,
    state: string,
    postalCode: string,
    country: string,
    additionalInfo?: string
  ) {
    // Validate required fields
    if (!street || street.trim().length === 0) {
      throw new ValidationError('Street address is required');
    }
    if (!city || city.trim().length === 0) {
      throw new ValidationError('City is required');
    }
    if (!state || state.trim().length === 0) {
      throw new ValidationError('State is required');
    }
    if (!postalCode || postalCode.trim().length === 0) {
      throw new ValidationError('Postal code is required');
    }
    if (!country || country.trim().length === 0) {
      throw new ValidationError('Country is required');
    }

    // Validate lengths
    if (street.length > 200) {
      throw new ValidationError('Street address cannot exceed 200 characters');
    }
    if (city.length > 100) {
      throw new ValidationError('City cannot exceed 100 characters');
    }
    if (state.length > 100) {
      throw new ValidationError('State cannot exceed 100 characters');
    }
    if (postalCode.length > 20) {
      throw new ValidationError('Postal code cannot exceed 20 characters');
    }
    if (additionalInfo && additionalInfo.length > 200) {
      throw new ValidationError('Additional info cannot exceed 200 characters');
    }

    // Validate country code (ISO 3166-1 alpha-2)
    const countryPattern = /^[A-Z]{2}$/;
    const normalizedCountry = country.trim().toUpperCase();
    if (!countryPattern.test(normalizedCountry)) {
      throw new ValidationError('Country must be a valid 2-letter country code');
    }

    this.street = street.trim();
    this.city = city.trim();
    this.state = state.trim();
    this.postalCode = postalCode.trim();
    this.country = normalizedCountry;
    this.additionalInfo = additionalInfo?.trim();
  }

  getStreet(): string {
    return this.street;
  }

  getCity(): string {
    return this.city;
  }

  getState(): string {
    return this.state;
  }

  getPostalCode(): string {
    return this.postalCode;
  }

  getCountry(): string {
    return this.country;
  }

  getAdditionalInfo(): string | undefined {
    return this.additionalInfo;
  }

  /**
   * Get formatted address as single string
   */
  getFormattedAddress(): string {
    const parts = [this.street, this.city, this.state, this.postalCode, this.country];
    if (this.additionalInfo) {
      parts.splice(1, 0, this.additionalInfo);
    }
    return parts.join(', ');
  }

  equals(other: Address): boolean {
    return (
      this.street === other.street &&
      this.city === other.city &&
      this.state === other.state &&
      this.postalCode === other.postalCode &&
      this.country === other.country &&
      this.additionalInfo === other.additionalInfo
    );
  }

  toString(): string {
    return this.getFormattedAddress();
  }

  toJSON(): {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    additionalInfo?: string;
  } {
    return {
      street: this.street,
      city: this.city,
      state: this.state,
      postalCode: this.postalCode,
      country: this.country,
      additionalInfo: this.additionalInfo,
    };
  }

  static fromJSON(data: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    additionalInfo?: string;
  }): Address {
    return new Address(
      data.street,
      data.city,
      data.state,
      data.postalCode,
      data.country,
      data.additionalInfo
    );
  }
}

/**
 * Order Quantity value object with validation
 */
export class OrderQuantity {
  private readonly value: number;

  constructor(quantity: number) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationError('Order quantity must be a positive integer', [
        { field: 'quantity', message: 'Must be a positive integer', value: quantity },
      ]);
    }

    if (quantity > 1000) {
      throw new ValidationError('Order quantity cannot exceed 1000 items per line', [
        { field: 'quantity', message: 'Maximum 1000 items per line', value: quantity },
      ]);
    }

    this.value = quantity;
  }

  getValue(): number {
    return this.value;
  }

  /**
   * Add quantities
   */
  add(other: OrderQuantity): OrderQuantity {
    return new OrderQuantity(this.value + other.value);
  }

  /**
   * Calculate total price for this quantity
   */
  calculateTotal(unitPrice: Money): Money {
    return unitPrice.multiply(this.value);
  }

  equals(other: OrderQuantity): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value.toString();
  }

  toJSON(): number {
    return this.value;
  }

  static fromNumber(quantity: number): OrderQuantity {
    return new OrderQuantity(quantity);
  }
}

/**
 * Payment Information value object
 */
export class PaymentInfo {
  private readonly method:
    | 'credit_card'
    | 'debit_card'
    | 'paypal'
    | 'bank_transfer'
    | 'cash_on_delivery';
  private readonly status: 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded';
  private readonly transactionId?: string;
  private readonly lastFourDigits?: string;
  private readonly cardBrand?: string;

  constructor(
    method: 'credit_card' | 'debit_card' | 'paypal' | 'bank_transfer' | 'cash_on_delivery',
    status: 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded',
    transactionId?: string,
    lastFourDigits?: string,
    cardBrand?: string
  ) {
    // Validate payment method
    const validMethods = [
      'credit_card',
      'debit_card',
      'paypal',
      'bank_transfer',
      'cash_on_delivery',
    ];
    if (!validMethods.includes(method)) {
      throw new ValidationError(`Invalid payment method: ${method}`);
    }

    // Validate payment status
    const validStatuses = ['pending', 'authorized', 'captured', 'failed', 'refunded'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid payment status: ${status}`);
    }

    // Validate card details if provided
    if (lastFourDigits && !/^\d{4}$/.test(lastFourDigits)) {
      throw new ValidationError('Last four digits must be exactly 4 digits');
    }

    if (cardBrand && cardBrand.length > 20) {
      throw new ValidationError('Card brand cannot exceed 20 characters');
    }

    this.method = method;
    this.status = status;
    this.transactionId = transactionId;
    this.lastFourDigits = lastFourDigits;
    this.cardBrand = cardBrand;
  }

  getMethod(): string {
    return this.method;
  }

  getStatus(): string {
    return this.status;
  }

  getTransactionId(): string | undefined {
    return this.transactionId;
  }

  getLastFourDigits(): string | undefined {
    return this.lastFourDigits;
  }

  getCardBrand(): string | undefined {
    return this.cardBrand;
  }

  /**
   * Check if payment is successful
   */
  isSuccessful(): boolean {
    return this.status === 'captured' || this.status === 'authorized';
  }

  /**
   * Check if payment is pending
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Check if payment failed
   */
  isFailed(): boolean {
    return this.status === 'failed';
  }

  /**
   * Get masked payment details for display
   */
  getMaskedDetails(): string {
    if (this.method === 'credit_card' || this.method === 'debit_card') {
      const brand = this.cardBrand ? `${this.cardBrand} ` : '';
      const lastFour = this.lastFourDigits ? `****${this.lastFourDigits}` : '****';
      return `${brand}${lastFour}`;
    }

    return this.method.replace('_', ' ').toUpperCase();
  }

  equals(other: PaymentInfo): boolean {
    return (
      this.method === other.method &&
      this.status === other.status &&
      this.transactionId === other.transactionId
    );
  }

  toString(): string {
    return `${this.method} - ${this.status}`;
  }

  toJSON(): {
    method: string;
    status: string;
    transactionId?: string;
    lastFourDigits?: string;
    cardBrand?: string;
  } {
    return {
      method: this.method,
      status: this.status,
      transactionId: this.transactionId,
      lastFourDigits: this.lastFourDigits,
      cardBrand: this.cardBrand,
    };
  }

  static fromJSON(data: {
    method: 'credit_card' | 'debit_card' | 'paypal' | 'bank_transfer' | 'cash_on_delivery';
    status: 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded';
    transactionId?: string;
    lastFourDigits?: string;
    cardBrand?: string;
  }): PaymentInfo {
    return new PaymentInfo(
      data.method,
      data.status,
      data.transactionId,
      data.lastFourDigits,
      data.cardBrand
    );
  }
}

/**
 * Shipping Information value object
 */
export class ShippingInfo {
  private readonly method: 'standard' | 'express' | 'overnight' | 'pickup';
  private readonly carrier?: string;
  private readonly trackingNumber?: string;
  private readonly estimatedDelivery?: Date;
  private readonly shippingAddress: Address;
  private readonly cost: Money;

  constructor(
    method: 'standard' | 'express' | 'overnight' | 'pickup',
    shippingAddress: Address,
    cost: Money,
    carrier?: string,
    trackingNumber?: string,
    estimatedDelivery?: Date
  ) {
    // Validate shipping method
    const validMethods = ['standard', 'express', 'overnight', 'pickup'];
    if (!validMethods.includes(method)) {
      throw new ValidationError(`Invalid shipping method: ${method}`);
    }

    // Validate tracking number format if provided
    if (trackingNumber && (trackingNumber.length < 6 || trackingNumber.length > 50)) {
      throw new ValidationError('Tracking number must be between 6 and 50 characters');
    }

    // Validate estimated delivery is in the future
    if (estimatedDelivery && estimatedDelivery <= new Date()) {
      throw new ValidationError('Estimated delivery must be in the future');
    }

    this.method = method;
    this.shippingAddress = shippingAddress;
    this.cost = cost;
    this.carrier = carrier;
    this.trackingNumber = trackingNumber;
    this.estimatedDelivery = estimatedDelivery;
  }

  getMethod(): string {
    return this.method;
  }

  getCarrier(): string | undefined {
    return this.carrier;
  }

  getTrackingNumber(): string | undefined {
    return this.trackingNumber;
  }

  getEstimatedDelivery(): Date | undefined {
    return this.estimatedDelivery;
  }

  getShippingAddress(): Address {
    return this.shippingAddress;
  }

  getCost(): Money {
    return this.cost;
  }

  /**
   * Check if package is trackable
   */
  isTrackable(): boolean {
    return !!this.trackingNumber && !!this.carrier;
  }

  /**
   * Get formatted shipping method
   */
  getFormattedMethod(): string {
    return this.method.replace('_', ' ').toUpperCase();
  }

  equals(other: ShippingInfo): boolean {
    return (
      this.method === other.method &&
      this.shippingAddress.equals(other.shippingAddress) &&
      this.cost.equals(other.cost) &&
      this.trackingNumber === other.trackingNumber
    );
  }

  toString(): string {
    return `${this.getFormattedMethod()} to ${this.shippingAddress.getCity()}, ${this.shippingAddress.getState()}`;
  }

  toJSON(): {
    method: string;
    carrier?: string;
    trackingNumber?: string;
    estimatedDelivery?: string;
    shippingAddress: ReturnType<Address['toJSON']>;
    cost: ReturnType<Money['toJSON']>;
  } {
    return {
      method: this.method,
      carrier: this.carrier,
      trackingNumber: this.trackingNumber,
      estimatedDelivery: this.estimatedDelivery?.toISOString(),
      shippingAddress: this.shippingAddress.toJSON(),
      cost: this.cost.toJSON(),
    };
  }

  static fromJSON(data: {
    method: 'standard' | 'express' | 'overnight' | 'pickup';
    carrier?: string;
    trackingNumber?: string;
    estimatedDelivery?: string;
    shippingAddress: ReturnType<Address['toJSON']>;
    cost: ReturnType<Money['toJSON']>;
  }): ShippingInfo {
    return new ShippingInfo(
      data.method,
      Address.fromJSON(data.shippingAddress),
      Money.fromJSON(data.cost),
      data.carrier,
      data.trackingNumber,
      data.estimatedDelivery ? new Date(data.estimatedDelivery) : undefined
    );
  }
}
