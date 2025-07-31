import {
  type DomainEvent,
  type EventMetadata,
  eventMetadataSchema,
} from '@graphql-microservices/event-sourcing';
import { z } from 'zod';

/**
 * Base command interface
 */
export interface Command<
  TType extends UserCommandType = UserCommandType,
  TData extends Record<string, unknown> = Record<string, unknown>,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
> {
  readonly type: TType;
  readonly aggregateId: string;
  readonly payload: TData;
  readonly metadata?: TMetadata;
}

/**
 * Create User Command
 */
export interface CreateUserCommand<
  TType extends UserCommandType = 'CreateUser',
  TData extends Record<string, unknown> = {
    username: string;
    email: string;
    password: string;
    name: string;
    phoneNumber?: string;
  },
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
> extends Command<TType, TData, TContext, TMetadata> {
  readonly type: TType;
  readonly metadata?: TMetadata;
  readonly payload: TData;
}

export const createUserCommandSchema: z.ZodType<CreateUserCommand> = z.object({
  type: z.literal('CreateUser'),
  aggregateId: z.uuid(),
  metadata: eventMetadataSchema,
  payload: z.object({
    username: z
      .string()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_]+$/),
    email: z.email(),
    password: z.string().min(8).max(128),
    name: z.string().min(1).max(100),
    phoneNumber: z.string().optional(),
  }),
});

/**
 * Update User Profile Command
 */
export interface UpdateUserProfileCommand<
  TType extends UserCommandType = 'UpdateUserProfile',
  TData extends Record<string, unknown> = {
    name?: string;
    phoneNumber?: string;
  },
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
> extends Command<TType, TData, TContext, TMetadata> {
  readonly type: TType;
  readonly metadata?: TMetadata;
  readonly payload: TData;
}

export const updateUserProfileCommandSchema: z.ZodType<UpdateUserProfileCommand> = z.object({
  type: z.literal('UpdateUserProfile'),
  aggregateId: z.uuid(),
  metadata: eventMetadataSchema,
  payload: z.object({
    name: z.string().min(1).max(100).optional(),
    phoneNumber: z.string().optional(),
  }),
});

/**
 * Update User Credentials Command
 */
export interface UpdateUserCredentialsCommand<
  TType extends UserCommandType = 'UpdateUserCredentials',
  TData extends Record<string, unknown> = {
    username?: string;
    email?: string;
  },
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
> extends Command<TType, TData, TContext, TMetadata> {
  readonly type: TType;
  readonly metadata?: TMetadata;
  readonly payload: TData;
}

export const updateUserCredentialsCommandSchema: z.ZodType<UpdateUserCredentialsCommand> = z.object(
  {
    type: z.literal('UpdateUserCredentials'),
    aggregateId: z.uuid(),
    payload: z.object({
      username: z
        .string()
        .min(3)
        .max(50)
        .regex(/^[a-zA-Z0-9_]+$/)
        .optional(),
      email: z.email().optional(),
    }),
    metadata: eventMetadataSchema,
  }
);

/**
 * Change User Role Command
 */
export interface ChangeUserRoleCommand<
  TType extends UserCommandType = 'ChangeUserRole',
  TData extends Record<string, unknown> = {
    newRole: 'USER' | 'ADMIN' | 'MODERATOR';
    changedBy: string;
  },
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
> extends Command<TType, TData, TContext, TMetadata> {
  readonly type: TType;
  readonly metadata?: TMetadata;
  readonly payload: TData;
}

export const changeUserRoleCommandSchema: z.ZodType<ChangeUserRoleCommand> = z.object({
  type: z.literal('ChangeUserRole'),
  aggregateId: z.uuid(),
  metadata: eventMetadataSchema,
  payload: z.object({
    newRole: z.enum(['USER', 'ADMIN', 'MODERATOR']),
    changedBy: z.uuid(),
  }),
});

/**
 * Change User Password Command
 */
export interface ChangeUserPasswordCommand<
  TType extends UserCommandType = 'ChangeUserPassword',
  TData extends Record<string, unknown> = {
    currentPassword: string;
    newPassword: string;
    changedBy: string;
  },
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
> extends Command<TType, TData, TContext, TMetadata> {
  readonly type: TType;
  readonly metadata?: TMetadata;
  readonly payload: TData;
}

export const changeUserPasswordCommandSchema: z.ZodType<ChangeUserPasswordCommand> = z.object({
  type: z.literal('ChangeUserPassword'),
  aggregateId: z.uuid(),
  payload: z.object({
    currentPassword: z.string(),
    newPassword: z.string().min(8).max(128),
    changedBy: z.uuid(),
  }),
  metadata: eventMetadataSchema,
});

/**
 * Deactivate User Command
 */
export interface DeactivateUserCommand<
  TType extends UserCommandType = 'DeactivateUser',
  TData extends Record<string, unknown> = {
    reason: string;
    deactivatedBy: string;
  },
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
> extends Command<TType, TData, TContext, TMetadata> {
  readonly type: TType;
  readonly metadata?: TMetadata;
  readonly payload: TData;
}

export const deactivateUserCommandSchema: z.ZodType<DeactivateUserCommand> = z.object({
  type: z.literal('DeactivateUser'),
  aggregateId: z.uuid(),
  metadata: eventMetadataSchema,
  payload: z.object({
    reason: z.string().min(1).max(500),
    deactivatedBy: z.uuid(),
  }),
});

/**
 * Reactivate User Command
 */
export interface ReactivateUserCommand<
  TType extends UserCommandType = 'ReactivateUser',
  TData extends Record<string, unknown> = {
    reason: string;
    reactivatedBy: string;
  },
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
> extends Command<TType, TData, TContext, TMetadata> {
  readonly type: TType;
  readonly metadata?: TMetadata;
  readonly payload: TData;
}

export const reactivateUserCommandSchema: z.ZodType<ReactivateUserCommand> = z.object({
  type: z.literal('ReactivateUser'),
  aggregateId: z.uuid(),
  metadata: eventMetadataSchema,
  payload: z.object({
    reason: z.string().min(1).max(500),
    reactivatedBy: z.uuid(),
  }),
});

/**
 * Record User Sign In Command
 */
export interface RecordUserSignInCommand<
  TType extends UserCommandType = 'RecordUserSignIn',
  TData extends Record<string, unknown> = {
    ipAddress?: string;
    userAgent?: string;
  },
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
> extends Command<TType, TData, TContext, TMetadata> {
  readonly type: TType;
  readonly metadata?: TMetadata;
  readonly payload: TData;
}
export const recordUserSignInCommandSchema: z.ZodType<RecordUserSignInCommand> = z.object({
  type: z.literal('RecordUserSignIn'),
  aggregateId: z.uuid(),
  metadata: eventMetadataSchema,
  payload: z.object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
  }),
});

/**
 * Record User Sign Out Command
 */
export interface RecordUserSignOutCommand<
  TType extends UserCommandType = 'RecordUserSignOut',
  TData extends Record<string, unknown> = {
    ipAddress?: string;
    userAgent?: string;
  },
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends EventMetadata<TContext> = EventMetadata<TContext>,
> extends Command<TType, TData, TContext, TMetadata> {
  readonly type: TType;
  readonly metadata?: TMetadata;
  readonly payload: TData;
}

export const recordUserSignOutCommandSchema: z.ZodType<RecordUserSignOutCommand> = z.object({
  type: z.literal('RecordUserSignOut'),
  aggregateId: z.uuid(),
  metadata: eventMetadataSchema,
  payload: z.object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
  }),
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

export type UserCommandSchema = typeof commandSchemas;
export type UserCommandType = keyof UserCommandSchema;

/**
 * Validate a command against its schema
 */
export function validateCommand<T extends UserCommand>(command: T): T {
  const schema = commandSchemas[command.type] as z.ZodType<T>;
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
export interface CommandResult<TEvents extends DomainEvent[] = DomainEvent[]> {
  readonly success: boolean;
  readonly aggregateId: string;
  readonly version: number;
  readonly events?: TEvents;
  readonly error?: string;
}
