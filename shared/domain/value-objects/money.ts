import { ValidationError } from '@graphql-microservices/shared-errors';

/**
 * Shared Money value object for handling currency and amounts across all services
 * This replaces the individual Money implementations in each service
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

    // Validate currency against ISO 4217 codes (common ones)
    const supportedCurrencies = new Set([
      'USD',
      'EUR',
      'GBP',
      'JPY',
      'CAD',
      'AUD',
      'CHF',
      'CNY',
      'SEK',
      'NZD',
      'MXN',
      'SGD',
      'HKD',
      'NOK',
      'TRY',
      'ZAR',
      'BRL',
      'INR',
      'KRW',
      'PLN',
    ]);

    const normalizedCurrency = currency.toUpperCase();
    if (!supportedCurrencies.has(normalizedCurrency)) {
      throw new ValidationError('Unsupported currency code', [
        {
          field: 'currency',
          message: `Supported currencies: ${Array.from(supportedCurrencies).join(', ')}`,
          value: currency,
        },
      ]);
    }

    this.amount = Math.round(amount * 100) / 100; // Round to 2 decimal places
    this.currency = normalizedCurrency;
  }

  getAmount(): number {
    return this.amount;
  }

  getCurrency(): string {
    return this.currency;
  }

  /**
   * Add two money values (must be same currency)
   */
  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new ValidationError('Cannot add different currencies', [
        {
          field: 'currency',
          message: 'Currencies must match',
          value: `${this.currency} vs ${other.currency}`,
        },
      ]);
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  /**
   * Subtract two money values (must be same currency)
   */
  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new ValidationError('Cannot subtract different currencies', [
        {
          field: 'currency',
          message: 'Currencies must match',
          value: `${this.currency} vs ${other.currency}`,
        },
      ]);
    }
    return new Money(this.amount - other.amount, this.currency);
  }

  /**
   * Multiply money by a scalar
   */
  multiply(multiplier: number): Money {
    if (multiplier < 0) {
      throw new ValidationError('Multiplier cannot be negative', [
        { field: 'multiplier', message: 'Must be non-negative', value: multiplier },
      ]);
    }
    return new Money(this.amount * multiplier, this.currency);
  }

  /**
   * Divide money by a scalar
   */
  divide(divisor: number): Money {
    if (divisor <= 0) {
      throw new ValidationError('Divisor must be positive', [
        { field: 'divisor', message: 'Must be positive', value: divisor },
      ]);
    }
    return new Money(this.amount / divisor, this.currency);
  }

  /**
   * Check if this money is greater than other
   */
  isGreaterThan(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new ValidationError('Cannot compare different currencies');
    }
    return this.amount > other.amount;
  }

  /**
   * Check if this money is greater than or equal to other
   */
  isGreaterThanOrEqual(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new ValidationError('Cannot compare different currencies');
    }
    return this.amount >= other.amount;
  }

  /**
   * Check if this money is less than other
   */
  isLessThan(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new ValidationError('Cannot compare different currencies');
    }
    return this.amount < other.amount;
  }

  /**
   * Check if this money is less than or equal to other
   */
  isLessThanOrEqual(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new ValidationError('Cannot compare different currencies');
    }
    return this.amount <= other.amount;
  }

  /**
   * Check if this money is equal to other
   */
  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  /**
   * Check if this money is zero
   */
  isZero(): boolean {
    return this.amount === 0;
  }

  /**
   * Check if this money is positive
   */
  isPositive(): boolean {
    return this.amount > 0;
  }

  /**
   * Get absolute value
   */
  abs(): Money {
    return new Money(Math.abs(this.amount), this.currency);
  }

  /**
   * Convert to string representation
   */
  toString(): string {
    return `${this.amount.toFixed(2)} ${this.currency}`;
  }

  /**
   * Convert to formatted string with currency symbol
   */
  toFormattedString(): string {
    const symbols = new Map([
      ['USD', '$'],
      ['EUR', '€'],
      ['GBP', '£'],
      ['JPY', '¥'],
      ['CAD', 'C$'],
      ['AUD', 'A$'],
      ['CHF', '₣'],
      ['CNY', '¥'],
      ['SEK', 'kr'],
      ['NZD', 'NZ$'],
      ['MXN', '$'],
      ['SGD', 'S$'],
      ['HKD', 'HK$'],
      ['NOK', 'kr'],
      ['TRY', '₺'],
      ['ZAR', 'R'],
      ['BRL', 'R$'],
      ['INR', '₹'],
      ['KRW', '₩'],
      ['PLN', 'zł'],
    ]);

    const symbol = symbols.get(this.currency) || this.currency;

    // Format number with appropriate decimal places
    let formatted: string;
    if (this.currency === 'JPY' || this.currency === 'KRW') {
      // These currencies typically don't use decimal places
      formatted = Math.round(this.amount).toLocaleString();
    } else {
      formatted = this.amount.toFixed(2);
    }

    return `${symbol}${formatted}`;
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON(): { amount: number; currency: string } {
    return {
      amount: this.amount,
      currency: this.currency,
    };
  }

  /**
   * Create Money from plain object
   */
  static fromJSON(data: { amount: number; currency: string }): Money {
    return new Money(data.amount, data.currency);
  }

  /**
   * Zero money value
   */
  static zero(currency: string = 'USD'): Money {
    return new Money(0, currency);
  }

  /**
   * Create money from cents/smallest unit
   */
  static fromCents(cents: number, currency: string = 'USD'): Money {
    // For currencies like JPY that don't have fractional units
    if (currency === 'JPY' || currency === 'KRW') {
      return new Money(cents, currency);
    }
    return new Money(cents / 100, currency);
  }

  /**
   * Get amount in cents/smallest unit
   */
  toCents(): number {
    // For currencies like JPY that don't have fractional units
    if (this.currency === 'JPY' || this.currency === 'KRW') {
      return Math.round(this.amount);
    }
    return Math.round(this.amount * 100);
  }

  /**
   * Sum multiple money values (must all be same currency)
   */
  static sum(amounts: Money[]): Money {
    if (amounts.length === 0) {
      return Money.zero();
    }

    const currency = amounts[0]?.currency;
    if (!currency) {
      return Money.zero();
    }

    // Validate all amounts have same currency
    for (const amount of amounts) {
      if (amount.currency !== currency) {
        throw new ValidationError('All amounts must have the same currency for sum operation');
      }
    }

    const total = amounts.reduce((sum, amount) => sum + amount.amount, 0);
    return new Money(total, currency);
  }

  /**
   * Get minimum of multiple money values (must all be same currency)
   */
  static min(amounts: Money[]): Money {
    if (amounts.length === 0) {
      throw new ValidationError('Cannot find minimum of empty array');
    }

    const currency = amounts[0]?.currency;
    if (!currency) {
      throw new ValidationError('Invalid money amount in array');
    }

    // Validate all amounts have same currency
    for (const amount of amounts) {
      if (amount.currency !== currency) {
        throw new ValidationError('All amounts must have the same currency for min operation');
      }
    }

    const minAmount = Math.min(...amounts.map((a) => a.amount));
    return new Money(minAmount, currency);
  }

  /**
   * Get maximum of multiple money values (must all be same currency)
   */
  static max(amounts: Money[]): Money {
    if (amounts.length === 0) {
      throw new ValidationError('Cannot find maximum of empty array');
    }

    const currency = amounts[0]?.currency;
    if (!currency) {
      throw new ValidationError('Invalid money amount in array');
    }

    // Validate all amounts have same currency
    for (const amount of amounts) {
      if (amount.currency !== currency) {
        throw new ValidationError('All amounts must have the same currency for max operation');
      }
    }

    const maxAmount = Math.max(...amounts.map((a) => a.amount));
    return new Money(maxAmount, currency);
  }

  /**
   * Calculate percentage of this amount
   */
  percentage(percent: number): Money {
    if (percent < 0 || percent > 100) {
      throw new ValidationError('Percentage must be between 0 and 100', [
        { field: 'percent', message: 'Must be between 0 and 100', value: percent },
      ]);
    }
    return this.multiply(percent / 100);
  }

  /**
   * Apply discount percentage
   */
  applyDiscount(discountPercent: number): Money {
    if (discountPercent < 0 || discountPercent > 100) {
      throw new ValidationError('Discount percentage must be between 0 and 100', [
        { field: 'discountPercent', message: 'Must be between 0 and 100', value: discountPercent },
      ]);
    }
    const discountAmount = this.percentage(discountPercent);
    return this.subtract(discountAmount);
  }

  /**
   * Calculate what percentage this amount is of another amount
   */
  percentageOf(total: Money): number {
    if (this.currency !== total.currency) {
      throw new ValidationError('Cannot calculate percentage of different currencies');
    }

    if (total.isZero()) {
      throw new ValidationError('Cannot calculate percentage of zero amount');
    }

    return (this.amount / total.amount) * 100;
  }
}
