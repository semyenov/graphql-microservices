import { ValidationError } from '@graphql-microservices/shared-errors';
import { type ZodError, type ZodSchema, z } from 'zod';

/**
 * Custom error formatter for Zod validation errors
 */
export const formatZodError = (error: ZodError): ValidationError => {
  const validationErrors = error.issues.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    value: (err as any).input,
  }));

  return new ValidationError('Validation failed', validationErrors);
};

/**
 * Validation middleware for GraphQL resolvers
 */
export const validateInput = <T>(
  schema: ZodSchema<T>,
  input: unknown,
  errorMessage = 'Invalid input'
): T => {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw formatZodError(error);
    }
    throw new ValidationError(errorMessage);
  }
};

/**
 * Common validation schemas
 */

// Email validation
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .trim()
  .toLowerCase()
  .min(5, 'Email must be at least 5 characters')
  .max(255, 'Email must not exceed 255 characters');

// Username validation
export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(50, 'Username must not exceed 50 characters')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'Username can only contain letters, numbers, underscores, and hyphens'
  );

// Password validation
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// Phone number validation (basic international format)
export const phoneNumberSchema = z
  .string()
  .trim()
  .regex(
    /^\+?[1-9]\d{1,14}$/,
    'Invalid phone number format. Use international format (e.g., +1234567890)'
  )
  .optional()
  .nullable();

// Name validation
export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Name must not exceed 100 characters')
  .regex(/^[a-zA-Z\s'-]+$/, 'Name can only contain letters, spaces, apostrophes, and hyphens');

// ID validation (UUID or custom format)
export const idSchema = z
  .string()
  .trim()
  .min(1, 'ID is required')
  .max(255, 'ID must not exceed 255 characters');

// UUID validation
export const uuidSchema = z.string().uuid('Invalid UUID format');

// Role enum
export const roleSchema = z.enum(['USER', 'ADMIN', 'MODERATOR']);

// Pagination schemas
export const paginationSchema = z.object({
  first: z.number().int().positive().max(100).optional(),
  after: z.string().optional(),
  last: z.number().int().positive().max(100).optional(),
  before: z.string().optional(),
});

// Date range schema
export const dateRangeSchema = z
  .object({
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
  })
  .refine(
    (data) => {
      if (data.dateFrom && data.dateTo) {
        return new Date(data.dateFrom) <= new Date(data.dateTo);
      }
      return true;
    },
    {
      message: 'dateFrom must be before or equal to dateTo',
      path: ['dateFrom'],
    }
  );

// Price validation
export const priceSchema = z
  .number()
  .positive('Price must be positive')
  .max(999999.99, 'Price must not exceed 999,999.99')
  .transform((val) => Math.round(val * 100) / 100); // Round to 2 decimal places

// Quantity validation
export const quantitySchema = z
  .number()
  .int('Quantity must be a whole number')
  .positive('Quantity must be positive')
  .max(10000, 'Quantity must not exceed 10,000');

// SKU validation
export const skuSchema = z
  .string()
  .trim()
  .min(1, 'SKU is required')
  .max(50, 'SKU must not exceed 50 characters')
  .regex(/^[A-Z0-9-]+$/, 'SKU can only contain uppercase letters, numbers, and hyphens');

// Category validation
export const categorySchema = z
  .string()
  .trim()
  .min(1, 'Category is required')
  .max(50, 'Category must not exceed 50 characters');

// Tags validation
export const tagsSchema = z
  .array(z.string().trim().min(1).max(30))
  .max(10, 'Cannot have more than 10 tags')
  .optional();

// URL validation
export const urlSchema = z
  .string()
  .url('Invalid URL format')
  .max(2048, 'URL must not exceed 2048 characters')
  .optional()
  .nullable();

// Search query validation
export const searchQuerySchema = z
  .string()
  .trim()
  .min(1, 'Search query is required')
  .max(100, 'Search query must not exceed 100 characters');

/**
 * User-specific validation schemas
 */

export const signUpInputSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  phoneNumber: phoneNumberSchema,
});

export const signInInputSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, 'Password is required'),
});

export const updateUserInputSchema = z.object({
  username: usernameSchema.optional(),
  email: emailSchema.optional(),
  name: nameSchema.optional(),
  phoneNumber: phoneNumberSchema,
  role: roleSchema.optional(),
});

export const updateProfileInputSchema = z.object({
  name: nameSchema.optional(),
  phoneNumber: phoneNumberSchema,
});

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

/**
 * Product-specific validation schemas
 */

export const createProductInputSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(200),
  description: z.string().trim().min(1, 'Description is required').max(2000),
  price: priceSchema,
  stock: quantitySchema,
  sku: skuSchema,
  category: categorySchema,
  tags: tagsSchema,
  imageUrl: urlSchema,
});

export const updateProductInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  price: priceSchema.optional(),
  stock: quantitySchema.optional(),
  category: categorySchema.optional(),
  tags: tagsSchema,
  imageUrl: urlSchema,
});

export const stockUpdateSchema = z.object({
  productId: idSchema,
  quantity: quantitySchema,
});

export const bulkUpdateStockInputSchema = z.object({
  updates: z.array(stockUpdateSchema).min(1).max(100),
});

/**
 * Order-specific validation schemas
 */

export const shippingInfoSchema = z.object({
  address: z.string().trim().min(1, 'Address is required').max(200),
  city: z.string().trim().min(1, 'City is required').max(100),
  state: z.string().trim().min(1, 'State is required').max(100),
  zipCode: z.string().trim().min(1, 'Zip code is required').max(20),
  country: z.string().trim().min(1, 'Country is required').max(100),
  phone: phoneNumberSchema,
});

export const orderItemInputSchema = z.object({
  productId: idSchema,
  quantity: quantitySchema,
  price: priceSchema,
});

export const createOrderInputSchema = z.object({
  items: z.array(orderItemInputSchema).min(1, 'At least one item is required').max(50),
  shippingInfo: shippingInfoSchema,
  notes: z.string().trim().max(500).optional(),
});

export const orderStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
]);

/**
 * Query validation schemas
 */

export const getUsersQuerySchema = z.object({
  ...paginationSchema.shape,
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
  search: searchQuerySchema.optional(),
});

export const getProductsQuerySchema = z.object({
  ...paginationSchema.shape,
  category: categorySchema.optional(),
  tags: tagsSchema,
  isActive: z.boolean().optional(),
  search: searchQuerySchema.optional(),
});

export const getOrdersQuerySchema = z.object({
  ...paginationSchema.shape,
  userId: idSchema.optional(),
  status: orderStatusSchema.optional(),
  ...dateRangeSchema.shape,
});

/**
 * Utility functions
 */

// Sanitize string input (remove potentially harmful characters)
export const sanitizeString = (input: string): string => {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove basic HTML tags
    .replace(/\0/g, ''); // Remove null bytes
};

// Validate and sanitize input object
export const sanitizeInput = <T extends Record<string, unknown>>(input: T): T => {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === 'string' ? sanitizeString(item) : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
};

/**
 * Create a validation middleware function for a specific schema
 */
export const createValidator = <T>(schema: ZodSchema<T>) => {
  return (input: unknown): T => validateInput(schema, input);
};

/**
 * Async validation with custom error handling
 */
export const validateAsync = async <T>(
  schema: ZodSchema<T>,
  input: unknown,
  errorMessage?: string
): Promise<T> => {
  try {
    return await schema.parseAsync(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw formatZodError(error);
    }
    throw new ValidationError(errorMessage || 'Validation failed');
  }
};

/**
 * Type exports for better type inference
 */
export type SignUpInput = z.infer<typeof signUpInputSchema>;
export type SignInInput = z.infer<typeof signInInputSchema>;
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

export type CreateProductInput = z.infer<typeof createProductInputSchema>;
export type UpdateProductInput = z.infer<typeof updateProductInputSchema>;
export type StockUpdate = z.infer<typeof stockUpdateSchema>;
export type BulkUpdateStockInput = z.infer<typeof bulkUpdateStockInputSchema>;

export type ShippingInfo = z.infer<typeof shippingInfoSchema>;
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export type Pagination = z.infer<typeof paginationSchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;
export type Role = z.infer<typeof roleSchema>;

export * from './custom-validators';
// Re-export middleware and custom validators
export * from './middleware';
