import { BusinessRuleError, ValidationError } from '@graphql-microservices/shared-errors';
import type { Order, OrderStatus } from './order-aggregate';
import { type Address, Money, type PaymentInfo, type ShippingInfo } from './value-objects';

/**
 * Order business policies and rules
 */

// Constants
const MIN_ORDER_AMOUNT = 1.0;
const MAX_ORDER_AMOUNT = 50000.0;
const MAX_ITEMS_PER_ORDER = 50;
const MAX_QUANTITY_PER_ITEM = 1000;

/**
 * Validate order creation
 */
export function validateOrderCreation(
  customerId: string,
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: Money;
  }>,
  shippingAddress: Address,
  paymentInfo: PaymentInfo,
  shippingInfo: ShippingInfo
): void {
  // Customer validation
  if (!customerId || customerId.trim().length === 0) {
    throw new ValidationError('Customer ID is required');
  }

  // Items validation
  if (items.length === 0) {
    throw new ValidationError('Order must have at least one item');
  }

  if (items.length > MAX_ITEMS_PER_ORDER) {
    throw new BusinessRuleError(`Order cannot have more than ${MAX_ITEMS_PER_ORDER} items`);
  }

  // Validate each item
  for (const item of items) {
    validateOrderItem(item);
  }

  // Check for duplicate products
  const productIds = items.map((item) => item.productId);
  const uniqueProductIds = new Set(productIds);
  if (uniqueProductIds.size !== productIds.length) {
    throw new ValidationError('Order cannot contain duplicate products');
  }

  // Calculate and validate total
  const subtotal = items.reduce((total, item) => {
    const itemTotal = item.unitPrice.multiply(item.quantity);
    return total.add(itemTotal);
  }, Money.zero(items[0]?.unitPrice.getCurrency()));

  const totalWithShipping = subtotal.add(shippingInfo.getCost());

  if (totalWithShipping.getAmount() < MIN_ORDER_AMOUNT) {
    throw new BusinessRuleError(`Order total must be at least $${MIN_ORDER_AMOUNT}`);
  }

  if (totalWithShipping.getAmount() > MAX_ORDER_AMOUNT) {
    throw new BusinessRuleError(`Order total cannot exceed $${MAX_ORDER_AMOUNT}`);
  }

  // Validate addresses
  validateShippingAddress(shippingAddress);

  // Validate payment method
  validatePaymentInfo(paymentInfo);

  // Validate shipping method
  validateShippingInfo(shippingInfo, shippingAddress);
}

/**
 * Validate individual order item
 */
export function validateOrderItem(item: {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: Money;
}): void {
  if (!item.productId || item.productId.trim().length === 0) {
    throw new ValidationError('Product ID is required');
  }

  if (!item.productName || item.productName.trim().length === 0) {
    throw new ValidationError('Product name is required');
  }

  if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
    throw new ValidationError('Quantity must be a positive integer');
  }

  if (item.quantity > MAX_QUANTITY_PER_ITEM) {
    throw new BusinessRuleError(`Quantity cannot exceed ${MAX_QUANTITY_PER_ITEM} per item`);
  }

  if (item.unitPrice.getAmount() <= 0) {
    throw new ValidationError('Unit price must be greater than zero');
  }

  if (item.unitPrice.getAmount() > 10000.0) {
    throw new BusinessRuleError('Unit price cannot exceed $10,000.00');
  }
}

/**
 * Validate shipping address
 */
export function validateShippingAddress(address: Address): void {
  // Basic validation is handled by Address value object
  // Additional business rules can be added here

  // Example: Restrict shipping to certain countries
  const allowedCountries = new Set(['US', 'CA', 'MX', 'GB', 'DE', 'FR', 'AU', 'JP']);
  if (!allowedCountries.has(address.getCountry())) {
    throw new BusinessRuleError(`Shipping not available to ${address.getCountry()}`);
  }

  // Example: Validate state for US addresses
  if (address.getCountry() === 'US') {
    validateUSState(address.getState());
  }
}

/**
 * Validate US state codes
 */
function validateUSState(state: string): void {
  const validStates = new Set([
    'AL',
    'AK',
    'AZ',
    'AR',
    'CA',
    'CO',
    'CT',
    'DE',
    'FL',
    'GA',
    'HI',
    'ID',
    'IL',
    'IN',
    'IA',
    'KS',
    'KY',
    'LA',
    'ME',
    'MD',
    'MA',
    'MI',
    'MN',
    'MS',
    'MO',
    'MT',
    'NE',
    'NV',
    'NH',
    'NJ',
    'NM',
    'NY',
    'NC',
    'ND',
    'OH',
    'OK',
    'OR',
    'PA',
    'RI',
    'SC',
    'SD',
    'TN',
    'TX',
    'UT',
    'VT',
    'VA',
    'WA',
    'WV',
    'WI',
    'WY',
    'DC',
    'AS',
    'GU',
    'MP',
    'PR',
    'VI',
  ]);

  if (!validStates.has(state.toUpperCase())) {
    throw new ValidationError(`Invalid US state code: ${state}`);
  }
}

/**
 * Validate payment information
 */
export function validatePaymentInfo(paymentInfo: PaymentInfo): void {
  // Basic validation is handled by PaymentInfo value object
  // Additional business rules can be added here

  const method = paymentInfo.getMethod();

  // Example: Restrict payment methods for high-value orders
  if (['paypal', 'bank_transfer'].includes(method)) {
    // Additional verification might be required for these methods
    console.log(`High-security payment method detected: ${method}`);
  }

  // Example: Cash on delivery restrictions
  if (method === 'cash_on_delivery') {
    throw new BusinessRuleError('Cash on delivery is temporarily unavailable');
  }
}

/**
 * Validate shipping information
 */
export function validateShippingInfo(shippingInfo: ShippingInfo, shippingAddress: Address): void {
  const method = shippingInfo.getMethod();
  const country = shippingAddress.getCountry();

  // Express and overnight shipping restrictions
  if ((method === 'express' || method === 'overnight') && country !== 'US') {
    throw new BusinessRuleError(`${method} shipping is only available within the US`);
  }

  // Pickup method validation
  if (method === 'pickup') {
    // Only allow pickup for certain locations
    const pickupStates = new Set(['CA', 'NY', 'TX', 'FL']);
    if (country !== 'US' || !pickupStates.has(shippingAddress.getState())) {
      throw new BusinessRuleError('Pickup is only available in CA, NY, TX, and FL');
    }
  }

  // Validate shipping cost
  const expectedCost = calculateShippingCost(method, shippingAddress);
  if (!shippingInfo.getCost().equals(expectedCost)) {
    throw new ValidationError('Shipping cost does not match expected amount');
  }
}

/**
 * Calculate expected shipping cost
 */
export function calculateShippingCost(method: string, address: Address): Money {
  const baseCosts = new Map([
    ['standard', 5.99],
    ['express', 12.99],
    ['overnight', 25.99],
    ['pickup', 0.0],
  ]);

  let cost = baseCosts.get(method) ?? 5.99;

  // International shipping surcharge
  if (address.getCountry() !== 'US') {
    cost += 15.0;
  }

  return new Money(cost);
}

/**
 * Validate status transition with business rules
 */
export function validateStatusTransition(
  order: Order,
  newStatus: OrderStatus,
  reason?: string,
  changedBy?: string
): void {
  // Basic transition validation is handled by the aggregate
  // Additional business rules can be added here

  switch (newStatus) {
    case 'confirmed':
      validateConfirmTransition(order, reason, changedBy);
      break;
    case 'processing':
      validateProcessingTransition(order, reason, changedBy);
      break;
    case 'shipped':
      validateShippedTransition(order, reason, changedBy);
      break;
    case 'delivered':
      validateDeliveredTransition(order, reason, changedBy);
      break;
    case 'cancelled':
      validateCancelledTransition(order, reason, changedBy);
      break;
    case 'refunded':
      validateRefundedTransition(order, reason, changedBy);
      break;
  }
}

function validateConfirmTransition(order: Order, reason?: string, changedBy?: string): void {
  // Order can only be confirmed if payment is successful
  if (!order.getPaymentInfo().isSuccessful()) {
    throw new BusinessRuleError('Order can only be confirmed with successful payment');
  }

  // High-value orders may require manual approval
  if (order.getTotalAmount().getAmount() > 5000.0) {
    if (!changedBy) {
      throw new BusinessRuleError('High-value orders require manual confirmation');
    }
    if (!reason) {
      throw new ValidationError('Reason is required for high-value order confirmation');
    }
  }
}

function validateProcessingTransition(order: Order, _reason?: string, _changedBy?: string): void {
  // Ensure all items are available (this would typically check inventory)
  // For now, we'll assume this check happens elsewhere

  // International orders may require additional processing time
  if (order.getShippingAddress().getCountry() !== 'US') {
    console.log('International order requires additional processing time');
  }
}

function validateShippedTransition(order: Order, _reason?: string, _changedBy?: string): void {
  // Order can only be shipped if it has tracking information
  const shippingInfo = order.getShippingInfo();
  if (shippingInfo.getMethod() !== 'pickup' && !shippingInfo.getTrackingNumber()) {
    throw new BusinessRuleError('Order cannot be shipped without tracking number');
  }

  // Validate shipping method and carrier consistency
  if (shippingInfo.getTrackingNumber() && !shippingInfo.getCarrier()) {
    throw new ValidationError('Carrier information is required when tracking number is provided');
  }
}

function validateDeliveredTransition(order: Order, _reason?: string, changedBy?: string): void {
  // Order can only be delivered if it was shipped (or pickup)
  const currentStatus = order.getStatus();
  if (currentStatus !== 'shipped' && order.getShippingInfo().getMethod() !== 'pickup') {
    throw new BusinessRuleError('Order must be shipped before it can be delivered');
  }

  // For pickup orders, require confirmation
  if (order.getShippingInfo().getMethod() === 'pickup' && !changedBy) {
    throw new BusinessRuleError('Pickup orders require manual delivery confirmation');
  }
}

function validateCancelledTransition(order: Order, reason?: string, changedBy?: string): void {
  if (!reason) {
    throw new ValidationError('Reason is required for order cancellation');
  }

  // Cannot cancel delivered orders
  if (order.getStatus() === 'delivered') {
    throw new BusinessRuleError('Cannot cancel delivered orders. Process refund instead.');
  }

  // Shipped orders require special handling
  if (order.getStatus() === 'shipped') {
    if (!changedBy) {
      throw new BusinessRuleError('Shipped orders require manual cancellation approval');
    }
    console.log('Shipped order cancellation requires coordination with shipping carrier');
  }
}

function validateRefundedTransition(order: Order, reason?: string, changedBy?: string): void {
  if (!reason) {
    throw new ValidationError('Reason is required for order refund');
  }

  if (!changedBy) {
    throw new BusinessRuleError('Refunds require manual approval');
  }

  // Can only refund delivered or cancelled orders
  const currentStatus = order.getStatus();
  if (currentStatus !== 'delivered' && currentStatus !== 'cancelled') {
    throw new BusinessRuleError('Can only refund delivered or cancelled orders');
  }

  // Payment must have been captured for refund to be possible
  if (!order.getPaymentInfo().isSuccessful()) {
    throw new BusinessRuleError('Cannot refund order without successful payment');
  }
}

/**
 * Get allowed status transitions for current status
 */
export function getAllowedTransitions(currentStatus: OrderStatus): OrderStatus[] {
  const transitions: Record<OrderStatus, OrderStatus[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['processing', 'cancelled'],
    processing: ['shipped', 'cancelled'],
    shipped: ['delivered', 'cancelled'],
    delivered: ['refunded'],
    cancelled: [],
    refunded: [],
  };

  return transitions[currentStatus] || [];
}

/**
 * Check if status transition is allowed
 */
export function isTransitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  const allowedTransitions = getAllowedTransitions(from);
  return allowedTransitions.includes(to);
}

/**
 * Check if order can be modified
 */
export function canModifyOrder(order: Order): boolean {
  const status = order.getStatus();
  return status === 'pending' || status === 'confirmed';
}

/**
 * Validate item addition
 */
export function validateItemAddition(
  order: Order,
  productId: string,
  quantity: number,
  unitPrice: Money
): void {
  if (!canModifyOrder(order)) {
    throw new BusinessRuleError(`Cannot modify order in ${order.getStatus()} status`);
  }

  // Check item limits
  const currentItems = order.getItems();
  if (currentItems.length >= 50) {
    throw new BusinessRuleError('Cannot add more items: maximum 50 items per order');
  }

  // Check if adding this item would exceed total limits
  const newItemTotal = unitPrice.multiply(quantity);
  const newOrderTotal = order.getTotalAmount().add(newItemTotal);

  if (newOrderTotal.getAmount() > 50000.0) {
    throw new BusinessRuleError('Adding this item would exceed maximum order amount of $50,000');
  }

  // Check for duplicate products
  const existingItem = currentItems.find((item) => item.productId === productId);
  if (existingItem) {
    const newQuantity = existingItem.quantity.getValue() + quantity;
    if (newQuantity > 1000) {
      throw new BusinessRuleError('Total quantity for this product would exceed maximum of 1000');
    }
  }
}

/**
 * Validate item removal
 */
export function validateItemRemoval(order: Order, itemId: string): void {
  if (!canModifyOrder(order)) {
    throw new BusinessRuleError(`Cannot modify order in ${order.getStatus()} status`);
  }

  const currentItems = order.getItems();
  if (currentItems.length === 1) {
    throw new BusinessRuleError(
      'Cannot remove the last item from order. Cancel the order instead.'
    );
  }

  const item = order.getItem(itemId);
  if (!item) {
    throw new ValidationError(`Item with ID ${itemId} not found in order`);
  }
}

/**
 * Validate quantity change
 */
export function validateQuantityChange(order: Order, itemId: string, newQuantity: number): void {
  if (!canModifyOrder(order)) {
    throw new BusinessRuleError(`Cannot modify order in ${order.getStatus()} status`);
  }

  if (newQuantity <= 0) {
    // Will be handled by item removal validation
    return;
  }

  if (newQuantity > 1000) {
    throw new BusinessRuleError('Quantity cannot exceed 1000 per item');
  }

  const item = order.getItem(itemId);
  if (!item) {
    throw new ValidationError(`Item with ID ${itemId} not found in order`);
  }

  // Check if quantity change would exceed order total limit
  const currentItemTotal = item.totalPrice;
  const newItemTotal = item.unitPrice.multiply(newQuantity);
  const totalDifference = newItemTotal.subtract(currentItemTotal);
  const newOrderTotal = order.getTotalAmount().add(totalDifference);

  if (newOrderTotal.getAmount() > 50000.0) {
    throw new BusinessRuleError('Quantity change would exceed maximum order amount of $50,000');
  }

  if (newOrderTotal.getAmount() < 1.0) {
    throw new BusinessRuleError(
      'Quantity change would result in order total below minimum of $1.00'
    );
  }
}

/**
 * Validate payment method for order
 */
export function validatePaymentMethod(order: Order, paymentMethod: string): void {
  const orderTotal = order.getTotalAmount().getAmount();
  const shippingCountry = order.getShippingAddress().getCountry();

  // High-value order restrictions
  if (orderTotal > 10000.0) {
    const allowedMethods = ['credit_card', 'bank_transfer'];
    if (!allowedMethods.includes(paymentMethod)) {
      throw new BusinessRuleError('High-value orders require credit card or bank transfer');
    }
  }

  // International order restrictions
  if (shippingCountry !== 'US') {
    const allowedMethods = ['credit_card', 'paypal'];
    if (!allowedMethods.includes(paymentMethod)) {
      throw new BusinessRuleError('International orders only accept credit card or PayPal');
    }
  }

  // Cash on delivery restrictions
  if (paymentMethod === 'cash_on_delivery') {
    if (orderTotal > 500.0) {
      throw new BusinessRuleError('Cash on delivery not available for orders over $500');
    }

    if (shippingCountry !== 'US') {
      throw new BusinessRuleError('Cash on delivery only available within the US');
    }
  }
}

/**
 * Calculate payment processing fee
 */
export function calculateProcessingFee(paymentMethod: string, orderTotal: Money): Money {
  const feeRates = new Map([
    ['credit_card', 0.029], // 2.9%
    ['debit_card', 0.015], // 1.5%
    ['paypal', 0.035], // 3.5%
    ['bank_transfer', 5.0], // Flat fee
    ['cash_on_delivery', 0], // No fee
  ]);

  const rate = feeRates.get(paymentMethod) ?? 0.029;

  if (paymentMethod === 'bank_transfer') {
    return new Money(rate, orderTotal.getCurrency());
  }

  return orderTotal.multiply(rate);
}

/**
 * Validate refund request
 */
export function validateRefund(order: Order, refundAmount: Money, reason: string): void {
  if (refundAmount.isGreaterThan(order.getTotalAmount())) {
    throw new ValidationError('Refund amount cannot exceed order total');
  }

  if (refundAmount.getAmount() <= 0) {
    throw new ValidationError('Refund amount must be greater than zero');
  }

  if (!reason || reason.trim().length === 0) {
    throw new ValidationError('Refund reason is required');
  }

  // Check refund window (30 days)
  const orderDate = order.getCreatedAt();
  const daysSinceOrder = Math.floor((Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSinceOrder > 30) {
    throw new BusinessRuleError('Refunds are only allowed within 30 days of order');
  }

  // Full refunds require different validation than partial refunds
  if (refundAmount.equals(order.getTotalAmount())) {
    validateFullRefund(order, reason);
  } else {
    validatePartialRefund(order, refundAmount, reason);
  }
}

function validateFullRefund(_order: Order, reason: string): void {
  // Full refunds are generally allowed for any valid reason
  // This is just an example - in practice, you might have more sophisticated reason validation
  console.log(`Full refund requested: ${reason}`);
}

function validatePartialRefund(_order: Order, amount: Money, reason: string): void {
  // Partial refunds typically require specific reasons
  // This is just an example - in practice, you might validate based on specific business rules
  console.log(`Partial refund of ${amount.toString()} requested: ${reason}`);
}

/**
 * Validate shipping method for order
 */
export function validateShippingMethod(order: Order, shippingMethod: string): void {
  const shippingAddress = order.getShippingAddress();
  const orderTotal = order.getTotalAmount().getAmount();

  // Method availability by country
  if (shippingMethod === 'overnight' && shippingAddress.getCountry() !== 'US') {
    throw new BusinessRuleError('Overnight shipping only available within the US');
  }

  if (shippingMethod === 'pickup') {
    validatePickupAvailability(shippingAddress);
  }

  // Express shipping minimum order
  if (shippingMethod === 'express' && orderTotal < 50.0) {
    throw new BusinessRuleError('Express shipping requires minimum order of $50');
  }

  // Free shipping threshold
  if (shippingMethod === 'standard' && orderTotal >= 75.0) {
    console.log('Order qualifies for free standard shipping');
  }
}

function validatePickupAvailability(address: Address): void {
  const pickupLocations = new Map([
    ['US', new Set(['CA', 'NY', 'TX', 'FL', 'IL'])],
    ['CA', new Set(['ON', 'BC', 'AB'])],
  ]);

  const availableStates = pickupLocations.get(address.getCountry());
  if (!availableStates || !availableStates.has(address.getState())) {
    throw new BusinessRuleError(
      `Pickup not available in ${address.getState()}, ${address.getCountry()}`
    );
  }
}

/**
 * Calculate estimated delivery date
 */
export function calculateEstimatedDelivery(shippingMethod: string, shippingAddress: Address): Date {
  const now = new Date();
  const country = shippingAddress.getCountry();

  let daysToAdd = 0;

  switch (shippingMethod) {
    case 'standard':
      daysToAdd = country === 'US' ? 5 : 10;
      break;
    case 'express':
      daysToAdd = country === 'US' ? 2 : 5;
      break;
    case 'overnight':
      daysToAdd = 1;
      break;
    case 'pickup':
      daysToAdd = 1; // Ready for pickup next day
      break;
    default:
      daysToAdd = 5;
  }

  // Add weekend handling
  const deliveryDate = new Date(now);
  deliveryDate.setDate(deliveryDate.getDate() + daysToAdd);

  // If delivery falls on weekend, move to Monday
  if (deliveryDate.getDay() === 0) {
    // Sunday
    deliveryDate.setDate(deliveryDate.getDate() + 1);
  } else if (deliveryDate.getDay() === 6) {
    // Saturday
    deliveryDate.setDate(deliveryDate.getDate() + 2);
  }

  return deliveryDate;
}

/**
 * Validate tracking number format
 */
export function validateTrackingNumber(trackingNumber: string, carrier?: string): void {
  if (!trackingNumber || trackingNumber.length < 6) {
    throw new ValidationError('Tracking number must be at least 6 characters');
  }

  if (trackingNumber.length > 50) {
    throw new ValidationError('Tracking number cannot exceed 50 characters');
  }

  // Carrier-specific validation (simplified examples)
  if (carrier) {
    switch (carrier.toLowerCase()) {
      case 'ups':
        if (!/^1Z[A-Z0-9]{16}$/.test(trackingNumber)) {
          console.warn('UPS tracking number format may be invalid');
        }
        break;
      case 'fedex':
        if (!/^\d{12,14}$/.test(trackingNumber)) {
          console.warn('FedEx tracking number format may be invalid');
        }
        break;
      case 'usps':
        if (!/^(94|93|92|91|90)\d{20}$/.test(trackingNumber)) {
          console.warn('USPS tracking number format may be invalid');
        }
        break;
    }
  }
}
