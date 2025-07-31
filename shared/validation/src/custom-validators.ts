import { ValidationError } from '@graphql-microservices/shared-errors';
import { z } from 'zod';

/**
 * Custom business rule validators
 */

/**
 * Validate that a user can update their role
 * Only admins can change roles, and they cannot demote themselves
 */
export const validateRoleUpdate = (
  currentUserId: string,
  targetUserId: string,
  currentRole: string,
  newRole?: string
): void => {
  if (!newRole || currentRole === 'ADMIN') {
    return; // No role change or admin can change any role
  }

  if (currentRole !== 'ADMIN') {
    throw new ValidationError('Only administrators can change user roles', [
      { field: 'role', message: 'Insufficient permissions to change role' },
    ]);
  }

  if (currentUserId === targetUserId && newRole !== 'ADMIN') {
    throw new ValidationError('Administrators cannot demote themselves', [
      { field: 'role', message: 'Cannot change your own admin role' },
    ]);
  }
};

/**
 * Validate product availability for ordering
 */
export const validateProductAvailability = (
  product: { isActive: boolean; stock: number },
  requestedQuantity: number
): void => {
  if (!product.isActive) {
    throw new ValidationError('Product is not available', [
      { field: 'productId', message: 'This product is currently unavailable' },
    ]);
  }

  if (product.stock < requestedQuantity) {
    throw new ValidationError('Insufficient stock', [
      {
        field: 'quantity',
        message: `Only ${product.stock} items available`,
        value: requestedQuantity,
      },
    ]);
  }
};

/**
 * Validate order status transition
 */
export const validateOrderStatusTransition = (currentStatus: string, newStatus: string): void => {
  const validTransitions: Record<string, string[]> = {
    PENDING: ['PROCESSING', 'CANCELLED'],
    PROCESSING: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED', 'CANCELLED'],
    DELIVERED: ['REFUNDED'],
    CANCELLED: [],
    REFUNDED: [],
  };

  const allowedTransitions = validTransitions[currentStatus] || [];

  if (!allowedTransitions.includes(newStatus)) {
    throw new ValidationError(`Cannot transition from ${currentStatus} to ${newStatus}`, [
      {
        field: 'status',
        message: `Valid transitions from ${currentStatus}: ${allowedTransitions.join(', ') || 'none'}`,
      },
    ]);
  }
};

/**
 * Validate business hours for operations
 */
export const validateBusinessHours = (operation: string, timezone = 'UTC'): void => {
  const now = new Date();
  const hours = now.getUTCHours();
  const dayOfWeek = now.getUTCDay();

  // Example: No operations on Sunday (0) or outside 6 AM - 10 PM UTC
  if (dayOfWeek === 0) {
    throw new ValidationError(`${operation} is not available on Sundays`);
  }

  if (hours < 6 || hours >= 22) {
    throw new ValidationError(`${operation} is only available between 6 AM and 10 PM ${timezone}`);
  }
};

/**
 * Validate discount code
 */
export const validateDiscountCode = (
  code: string,
  orderTotal: number
): { isValid: boolean; discount: number; message?: string } => {
  // Example discount codes
  const discountCodes: Record<string, { discount: number; minOrder?: number; expiresAt?: Date }> = {
    WELCOME10: { discount: 0.1, minOrder: 0 },
    SAVE20: { discount: 0.2, minOrder: 100 },
    FLASH50: {
      discount: 0.5,
      minOrder: 200,
      expiresAt: new Date('2024-12-31'),
    },
  };

  const discountInfo = discountCodes[code.toUpperCase()];

  if (!discountInfo) {
    return { isValid: false, discount: 0, message: 'Invalid discount code' };
  }

  if (discountInfo.expiresAt && new Date() > discountInfo.expiresAt) {
    return { isValid: false, discount: 0, message: 'Discount code has expired' };
  }

  if (discountInfo.minOrder && orderTotal < discountInfo.minOrder) {
    return {
      isValid: false,
      discount: 0,
      message: `Minimum order of $${discountInfo.minOrder} required for this discount`,
    };
  }

  return { isValid: true, discount: discountInfo.discount };
};

/**
 * Validate credit card number (basic Luhn algorithm)
 */
export const validateCreditCard = (cardNumber: string): boolean => {
  const digits = cardNumber.replace(/\D/g, '');

  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    const digitChar = digits[i];
    if (!digitChar) continue;
    let digit = parseInt(digitChar, 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
};

/**
 * Validate shipping address against blocked regions
 */
export const validateShippingRegion = (country: string, state?: string): void => {
  const blockedRegions = [
    { country: 'XX', reason: 'Embargoed country' },
    { country: 'US', state: 'XX', reason: 'State restrictions' },
  ];

  const blocked = blockedRegions.find(
    (region) => region.country === country && (!region.state || region.state === state)
  );

  if (blocked) {
    throw new ValidationError(`Shipping not available: ${blocked.reason}`, [
      {
        field: 'shippingInfo',
        message: `Cannot ship to ${state ? `${state}, ` : ''}${country}`,
      },
    ]);
  }
};

/**
 * Complex password strength validator
 */
export const validatePasswordStrength = (
  password: string,
  username?: string,
  email?: string
): { score: number; feedback: string[] } => {
  const feedback: string[] = [];
  let score = 0;

  // Length
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  // Character variety
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  // Common patterns to avoid
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    score -= 2;
    feedback.push('Password should not contain your username');
  }

  if (email) {
    const emailPrefix = email.split('@')[0];
    if (emailPrefix && password.toLowerCase().includes(emailPrefix.toLowerCase())) {
      score -= 2;
      feedback.push('Password should not contain your email address');
    }
  }

  // Common weak passwords
  const commonPasswords = ['password', '12345678', 'qwerty', 'abc123', 'password123'];

  if (commonPasswords.includes(password.toLowerCase())) {
    score = 0;
    feedback.push('This password is too common');
  }

  // Sequential characters
  if (/(.)\1{2,}/.test(password)) {
    score -= 1;
    feedback.push('Avoid repeating characters');
  }

  // Provide feedback based on score
  if (score < 3) {
    feedback.push('Consider using a longer password with mixed characters');
  }

  return { score: Math.max(0, Math.min(10, score)), feedback };
};

/**
 * Rate limit validator
 */
export class RateLimitValidator {
  private attempts: Map<string, { count: number; resetAt: Date }> = new Map();

  constructor(
    private maxAttempts: number,
    private windowMs: number
  ) {}

  validate(identifier: string): void {
    const now = new Date();
    const attempt = this.attempts.get(identifier);

    if (!attempt || now > attempt.resetAt) {
      this.attempts.set(identifier, {
        count: 1,
        resetAt: new Date(now.getTime() + this.windowMs),
      });
      return;
    }

    if (attempt.count >= this.maxAttempts) {
      const retryAfter = Math.ceil((attempt.resetAt.getTime() - now.getTime()) / 1000);
      throw new ValidationError('Too many attempts. Please try again later.', undefined, {
        retryAfter,
        limit: this.maxAttempts,
        remaining: 0,
        reset: attempt.resetAt.toISOString(),
      });
    }

    attempt.count += 1;
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }
}

/**
 * Create a custom Zod refinement for async validation
 */
export const createAsyncValidator = <T>(
  schema: z.ZodSchema<T>,
  asyncValidation: (data: T) => Promise<boolean | { valid: false; message: string }>
) => {
  return schema.superRefine(async (data, ctx) => {
    const result = await asyncValidation(data);

    if (result === false || (typeof result === 'object' && !result.valid)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: typeof result === 'object' ? result.message : 'Validation failed',
      });
    }
  });
};

/**
 * File upload validation
 */
export const validateFileUpload = (
  file: { size: number; type: string; name: string },
  options: {
    maxSize?: number; // in bytes
    allowedTypes?: string[];
    allowedExtensions?: string[];
  } = {}
): void => {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  } = options;

  // Check file size
  if (file.size > maxSize) {
    throw new ValidationError(
      `File size exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`,
      [{ field: 'file', message: 'File too large' }]
    );
  }

  // Check file type
  if (!allowedTypes.includes(file.type)) {
    throw new ValidationError('Invalid file type', [
      { field: 'file', message: `Allowed types: ${allowedTypes.join(', ')}` },
    ]);
  }

  // Check file extension
  const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!allowedExtensions.includes(extension)) {
    throw new ValidationError('Invalid file extension', [
      { field: 'file', message: `Allowed extensions: ${allowedExtensions.join(', ')}` },
    ]);
  }
};
