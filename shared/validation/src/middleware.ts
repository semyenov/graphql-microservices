import { ValidationError } from '@graphql-microservices/shared-errors';
import type { GraphQLFieldResolver } from 'graphql';
import type { ZodType } from 'zod';
import { validateInput } from './index';

/**
 * GraphQL resolver validation middleware
 * Validates resolver arguments against a Zod schema
 */
export const withValidation = <
  TArgs,
  TResult,
  TContext,
  // TInfo,
>(
  schema: ZodType<TArgs>,
  resolver: GraphQLFieldResolver<unknown, TContext, TArgs, TResult>
): GraphQLFieldResolver<unknown, TContext, TArgs, TResult> => {
  return (parent, args, context, info) => {
    // Validate the arguments
    const validatedArgs = validateInput(schema, args);

    // Call the original resolver with validated arguments
    return resolver(parent, validatedArgs, context, info);
  };
};

/**
 * Input validation middleware for specific argument fields
 */
export const withInputValidation = <
  TInput,
  TArgs extends { input: TInput },
  TResult,
  TContext,
  // TInfo,
>(
  schema: ZodType<TInput>,
  resolver: GraphQLFieldResolver<unknown, TContext, TArgs, TResult>
): GraphQLFieldResolver<unknown, TContext, TArgs, TResult> => {
  return (parent, args, context, info) => {
    // Validate only the input field
    const validatedInput = validateInput(schema, args.input);

    // Call the original resolver with validated input
    return resolver(parent, { ...args, input: validatedInput }, context, info);
  };
};

/**
 * Batch validation middleware for multiple inputs
 */
export const withBatchValidation = <
  TItem,
  TArgs extends { items: TItem[] },
  TResult,
  TContext,
  // TInfo,
>(
  itemSchema: ZodType<TItem>,
  resolver: GraphQLFieldResolver<unknown, TContext, TArgs, TResult>,
  maxItems = 100
): GraphQLFieldResolver<unknown, TContext, TArgs, TResult> => {
  return (parent, args, context, info) => {
    if (!Array.isArray(args.items)) {
      throw new ValidationError('Items must be an array');
    }

    if (args.items.length === 0) {
      throw new ValidationError('At least one item is required');
    }

    if (args.items.length > maxItems) {
      throw new ValidationError(`Cannot process more than ${maxItems} items at once`);
    }

    // Validate each item
    const validatedItems = args.items.map((item, index) => {
      try {
        return validateInput(itemSchema, item);
      } catch (error) {
        if (error instanceof ValidationError) {
          // Add index information to the error
          throw new ValidationError(
            `Validation failed for item at index ${index}`,
            (error.extensions?.validationErrors as {
              field: string;
              message: string;
              value?: unknown;
            }[]) || []
          );
        }
        throw error;
      }
    });

    // Call the original resolver with validated items
    return resolver(parent, { ...args, items: validatedItems }, context, info);
  };
};

/**
 * Query parameter validation middleware
 */
export const withQueryValidation = <TArgs, TResult, TContext, _TInfo>(
  schema: ZodType<TArgs>,
  resolver: GraphQLFieldResolver<unknown, TContext, TArgs, TResult>
): GraphQLFieldResolver<unknown, TContext, TArgs, TResult> => {
  return (parent, args, context, info) => {
    // Apply default values for pagination if not provided
    const argsWithDefaults = {
      first: 20,
      ...args,
    };

    // Validate the arguments
    const validatedArgs = validateInput(schema, argsWithDefaults);

    // Call the original resolver with validated arguments
    return resolver(parent, validatedArgs, context, info);
  };
};

/**
 * Custom validation middleware factory
 */
export const createValidationMiddleware = <TArgs, TResult, TContext, _TInfo>(
  validationFn: (args: TArgs, context: TContext) => void | Promise<void>
): ((
  resolver: GraphQLFieldResolver<unknown, TContext, TArgs, TResult>
) => GraphQLFieldResolver<unknown, TContext, TArgs, TResult>) => {
  return (resolver) => {
    return (parent, args, context, info) => {
      // Run custom validation
      validationFn(args, context);

      // Call the original resolver
      return resolver(parent, args, context, info);
    };
  };
};

/**
 * Combine multiple validation middlewares
 */
export const composeValidations = <TArgs, TResult, TContext, _TInfo>(
  ...middlewares: Array<
    (
      resolver: GraphQLFieldResolver<unknown, TContext, TArgs, TResult>
    ) => GraphQLFieldResolver<unknown, TContext, TArgs, TResult>
  >
): ((
  resolver: GraphQLFieldResolver<unknown, TContext, TArgs, TResult>
) => GraphQLFieldResolver<unknown, TContext, TArgs, TResult>) => {
  return (resolver) => {
    return middlewares.reduceRight((acc, middleware) => middleware(acc), resolver);
  };
};

/**
 * Context-aware validation middleware
 * Allows validation that depends on the context (e.g., user permissions)
 */
export const withContextValidation = <
  TArgs,
  TResult,
  TContext extends { user?: { role?: string } },
  _TInfo,
>(
  schema: ZodType<TArgs>,
  contextValidator?: (args: TArgs, context: TContext) => void,
  resolver?: GraphQLFieldResolver<unknown, TContext, TArgs, TResult>
): GraphQLFieldResolver<unknown, TContext, TArgs, TResult> => {
  return (parent, args, context, info) => {
    // Validate arguments with schema
    const validatedArgs = validateInput(schema, args);

    // Run context-based validation if provided
    if (contextValidator) {
      contextValidator(validatedArgs, context);
    }

    // Call the original resolver if provided
    if (resolver) {
      return resolver(parent, validatedArgs, context, info);
    }

    // Return validated args if no resolver provided (for testing)
    return validatedArgs as unknown as TResult;
  };
};

/**
 * Example usage with decorators (if using TypeScript decorators)
 */
export function Validate<T>(schema: ZodType<T>) {
  return (
    _target: object | null | undefined,
    _propertyKey: PropertyKey,
    descriptor: PropertyDescriptor
  ) => {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    if (!originalMethod) {
      throw new Error('Method not found');
    }

    if (typeof originalMethod !== 'function') {
      throw new Error('Method is not a function');
    }

    descriptor.value = function (...args: Parameters<typeof originalMethod>) {
      const [parent, resolverArgs, context, info] = args;
      const validatedArgs = validateInput(schema, resolverArgs);
      return originalMethod.call(this, parent, validatedArgs, context, info);
    };

    return descriptor;
  };
}
