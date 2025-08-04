import type { IDomainEvent } from '@graphql-microservices/event-sourcing';
import { z } from 'zod';

/**
 * Base command interface
 */
export interface Command {
  readonly type: string;
  readonly aggregateId: string;
  readonly metadata?: {
    correlationId?: string;
    userId?: string;
    source?: string;
    timestamp?: Date;
  };
}

/**
 * Create User Command
 */
export interface CreateUserCommand extends Command {
  type: 'CreateUser';
  payload: {
    username: string;
    email: string;
    password: string;
    name: string;
    phoneNumber?: string;
  };
}

export const createUserCommandSchema = z.object({
  type: z.literal('CreateUser'),
  aggregateId: z.uuid(),
  payload: z.object({
    username: z
      .string()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_]+$/),
    email: z.string().email(),
    password: z.string().min(8).max(128),
    name: z.string().min(1).max(100),
    phoneNumber: z.string().optional(),
  }),
  metadata: z
    .object({
      correlationId: z.string().optional(),
      userId: z.string().optional(),
      source: z.string().optional(),
      timestamp: z.date().optional(),
    })
    .optional(),
});

/**
 * Update User Profile Command
 */
export interface UpdateUserProfileCommand extends Command {
  type: 'UpdateUserProfile';
  payload: {
    name?: string;
    phoneNumber?: string;
  };
}

export const updateUserProfileCommandSchema = z.object({
  type: z.literal('UpdateUserProfile'),
  aggregateId: z.uuid(),
  payload: z.object({
    name: z.string().min(1).max(100).optional(),
    phoneNumber: z.string().optional(),
  }),
  metadata: z
    .object({
      correlationId: z.string().optional(),
      userId: z.string().optional(),
      source: z.string().optional(),
      timestamp: z.date().optional(),
    })
    .optional(),
});

/**
 * Update User Credentials Command
 */
export interface UpdateUserCredentialsCommand extends Command {
  type: 'UpdateUserCredentials';
  payload: {
    username?: string;
    email?: string;
  };
}

export const updateUserCredentialsCommandSchema = z.object({
  type: z.literal('UpdateUserCredentials'),
  aggregateId: z.uuid(),
  payload: z.object({
    username: z
      .string()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_]+$/)
      .optional(),
    email: z.string().email().optional(),
  }),
  metadata: z
    .object({
      correlationId: z.string().optional(),
      userId: z.string().optional(),
      source: z.string().optional(),
      timestamp: z.date().optional(),
    })
    .optional(),
});

/**
 * Change User Role Command
 */
export interface ChangeUserRoleCommand extends Command {
  type: 'ChangeUserRole';
  payload: {
    newRole: 'USER' | 'ADMIN' | 'MODERATOR';
    changedBy: string;
  };
}

export const changeUserRoleCommandSchema = z.object({
  type: z.literal('ChangeUserRole'),
  aggregateId: z.uuid(),
  payload: z.object({
    newRole: z.enum(['USER', 'ADMIN', 'MODERATOR']),
    changedBy: z.uuid(),
  }),
  metadata: z
    .object({
      correlationId: z.string().optional(),
      userId: z.string().optional(),
      source: z.string().optional(),
      timestamp: z.date().optional(),
    })
    .optional(),
});

/**
 * Change User Password Command
 */
export interface ChangeUserPasswordCommand extends Command {
  type: 'ChangeUserPassword';
  payload: {
    currentPassword: string;
    newPassword: string;
    changedBy: string;
  };
}

export const changeUserPasswordCommandSchema = z.object({
  type: z.literal('ChangeUserPassword'),
  aggregateId: z.uuid(),
  payload: z.object({
    currentPassword: z.string(),
    newPassword: z.string().min(8).max(128),
    changedBy: z.uuid(),
  }),
  metadata: z
    .object({
      correlationId: z.string().optional(),
      userId: z.string().optional(),
      source: z.string().optional(),
      timestamp: z.date().optional(),
    })
    .optional(),
});

/**
 * Deactivate User Command
 */
export interface DeactivateUserCommand extends Command {
  type: 'DeactivateUser';
  payload: {
    reason: string;
    deactivatedBy: string;
  };
}

export const deactivateUserCommandSchema = z.object({
  type: z.literal('DeactivateUser'),
  aggregateId: z.uuid(),
  payload: z.object({
    reason: z.string().min(1).max(500),
    deactivatedBy: z.uuid(),
  }),
  metadata: z
    .object({
      correlationId: z.string().optional(),
      userId: z.string().optional(),
      source: z.string().optional(),
      timestamp: z.date().optional(),
    })
    .optional(),
});

/**
 * Reactivate User Command
 */
export interface ReactivateUserCommand extends Command {
  type: 'ReactivateUser';
  payload: {
    reason: string;
    reactivatedBy: string;
  };
}

export const reactivateUserCommandSchema = z.object({
  type: z.literal('ReactivateUser'),
  aggregateId: z.uuid(),
  payload: z.object({
    reason: z.string().min(1).max(500),
    reactivatedBy: z.uuid(),
  }),
  metadata: z
    .object({
      correlationId: z.string().optional(),
      userId: z.string().optional(),
      source: z.string().optional(),
      timestamp: z.date().optional(),
    })
    .optional(),
});

/**
 * Record User Sign In Command
 */
export interface RecordUserSignInCommand extends Command {
  type: 'RecordUserSignIn';
  payload: {
    ipAddress?: string;
    userAgent?: string;
  };
}

export const recordUserSignInCommandSchema = z.object({
  type: z.literal('RecordUserSignIn'),
  aggregateId: z.uuid(),
  payload: z.object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
  }),
  metadata: z
    .object({
      correlationId: z.string().optional(),
      userId: z.string().optional(),
      source: z.string().optional(),
      timestamp: z.date().optional(),
    })
    .optional(),
});

/**
 * Record User Sign Out Command
 */
export interface RecordUserSignOutCommand extends Command {
  type: 'RecordUserSignOut';
}

export const recordUserSignOutCommandSchema = z.object({
  type: z.literal('RecordUserSignOut'),
  aggregateId: z.uuid(),
  metadata: z
    .object({
      correlationId: z.string().optional(),
      userId: z.string().optional(),
      source: z.string().optional(),
      timestamp: z.date().optional(),
    })
    .optional(),
});

/**
 * Union type for all user commands
 */
export type UserCommand =
  | CreateUserCommand
  | UpdateUserProfileCommand
  | UpdateUserCredentialsCommand
  | ChangeUserRoleCommand
  | ChangeUserPasswordCommand
  | DeactivateUserCommand
  | ReactivateUserCommand
  | RecordUserSignInCommand
  | RecordUserSignOutCommand;

/**
 * Command validation schemas map
 */
export const commandSchemas = {
  CreateUser: createUserCommandSchema,
  UpdateUserProfile: updateUserProfileCommandSchema,
  UpdateUserCredentials: updateUserCredentialsCommandSchema,
  ChangeUserRole: changeUserRoleCommandSchema,
  ChangeUserPassword: changeUserPasswordCommandSchema,
  DeactivateUser: deactivateUserCommandSchema,
  ReactivateUser: reactivateUserCommandSchema,
  RecordUserSignIn: recordUserSignInCommandSchema,
  RecordUserSignOut: recordUserSignOutCommandSchema,
} as const;

/**
 * Validate a command against its schema
 */
export function validateCommand<T extends Command>(command: T): T {
  const schema = commandSchemas[command.type as keyof typeof commandSchemas];

  if (!schema) {
    throw new Error(`Unknown command type: ${command.type}`);
  }

  try {
    return schema.parse(command) as T;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`Command validation failed: ${messages}`);
    }
    throw error;
  }
}

/**
 * Command result interface
 */
export interface CommandResult {
  success: boolean;
  aggregateId: string;
  version: number;
  events?: IDomainEvent[];
  error?: string;
}
