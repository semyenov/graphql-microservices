import {
  type DomainEvent,
  type EventMetadata,
  eventMetadataSchema,
} from '@graphql-microservices/event-sourcing';
import { z } from 'zod';
import type {
  AggregateId,
  Result,
  UserId,
  UserRole,
} from './types';

/**
 * Command type literals
 */
export const CommandType = {
  CREATE_USER: 'CreateUser',
  UPDATE_USER_PROFILE: 'UpdateUserProfile',
  UPDATE_USER_CREDENTIALS: 'UpdateUserCredentials',
  CHANGE_USER_ROLE: 'ChangeUserRole',
  CHANGE_USER_PASSWORD: 'ChangeUserPassword',
  DEACTIVATE_USER: 'DeactivateUser',
  REACTIVATE_USER: 'ReactivateUser',
  RECORD_USER_SIGN_IN: 'RecordUserSignIn',
  RECORD_USER_SIGN_OUT: 'RecordUserSignOut',
} as const;

export type CommandType = (typeof CommandType)[keyof typeof CommandType];

/**
 * Command payloads
 */
export interface CreateUserPayload {
  username: string;
  email: string;
  password: string;
  name: string;
  phoneNumber?: string;
}

export interface UpdateUserProfilePayload {
  name?: string;
  phoneNumber?: string;
}

export interface UpdateUserCredentialsPayload {
  username?: string;
  email?: string;
}

export interface ChangeUserRolePayload {
  newRole: UserRole;
  changedBy: UserId;
}

export interface ChangeUserPasswordPayload {
  currentPassword: string;
  newPassword: string;
  changedBy: UserId;
}

export interface DeactivateUserPayload {
  reason: string;
  deactivatedBy: UserId;
}

export interface ReactivateUserPayload {
  reason: string;
  reactivatedBy: UserId;
}

export interface RecordUserSignInPayload {
  ipAddress?: string;
  userAgent?: string;
}

export interface RecordUserSignOutPayload {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Base command structure
 */
export interface BaseCommand<TType extends CommandType, TPayload> {
  readonly type: TType;
  readonly aggregateId: AggregateId;
  readonly payload: TPayload;
  readonly metadata?: EventMetadata;
}

/**
 * Command type definitions using discriminated unions
 */
export type CreateUserCommand = BaseCommand<typeof CommandType.CREATE_USER, CreateUserPayload>;
export type UpdateUserProfileCommand = BaseCommand<
  typeof CommandType.UPDATE_USER_PROFILE,
  UpdateUserProfilePayload
>;
export type UpdateUserCredentialsCommand = BaseCommand<
  typeof CommandType.UPDATE_USER_CREDENTIALS,
  UpdateUserCredentialsPayload
>;
export type ChangeUserRoleCommand = BaseCommand<
  typeof CommandType.CHANGE_USER_ROLE,
  ChangeUserRolePayload
>;
export type ChangeUserPasswordCommand = BaseCommand<
  typeof CommandType.CHANGE_USER_PASSWORD,
  ChangeUserPasswordPayload
>;
export type DeactivateUserCommand = BaseCommand<
  typeof CommandType.DEACTIVATE_USER,
  DeactivateUserPayload
>;
export type ReactivateUserCommand = BaseCommand<
  typeof CommandType.REACTIVATE_USER,
  ReactivateUserPayload
>;
export type RecordUserSignInCommand = BaseCommand<
  typeof CommandType.RECORD_USER_SIGN_IN,
  RecordUserSignInPayload
>;
export type RecordUserSignOutCommand = BaseCommand<
  typeof CommandType.RECORD_USER_SIGN_OUT,
  RecordUserSignOutPayload
>;

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
 * Command validation schemas
 */
export const createUserCommandSchema = z.object({
  type: z.literal(CommandType.CREATE_USER),
  aggregateId: z.uuid(),
  metadata: eventMetadataSchema.optional(),
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

export const updateUserProfileCommandSchema = z.object({
  type: z.literal(CommandType.UPDATE_USER_PROFILE),
  aggregateId: z.uuid(),
  metadata: eventMetadataSchema.optional(),
  payload: z.object({
    name: z.string().min(1).max(100).optional(),
    phoneNumber: z.string().optional(),
  }),
});

export const updateUserCredentialsCommandSchema = z.object({
  type: z.literal(CommandType.UPDATE_USER_CREDENTIALS),
  aggregateId: z.uuid(),
  metadata: eventMetadataSchema.optional(),
  payload: z.object({
    username: z
      .string()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_]+$/)
      .optional(),
    email: z.email().optional(),
  }),
});

export const changeUserRoleCommandSchema = z.object({
  type: z.literal(CommandType.CHANGE_USER_ROLE),
  aggregateId: z.uuid(),
  metadata: eventMetadataSchema.optional(),
  payload: z.object({
    newRole: z.enum(['USER', 'ADMIN', 'MODERATOR']),
    changedBy: z.uuid(),
  }),
});

export const changeUserPasswordCommandSchema = z.object({
  type: z.literal(CommandType.CHANGE_USER_PASSWORD),
  aggregateId: z.uuid(),
  metadata: eventMetadataSchema.optional(),
  payload: z.object({
    currentPassword: z.string(),
    newPassword: z.string().min(8).max(128),
    changedBy: z.uuid(),
  }),
});

export const deactivateUserCommandSchema = z.object({
  type: z.literal(CommandType.DEACTIVATE_USER),
  aggregateId: z.uuid(),
  metadata: eventMetadataSchema.optional(),
  payload: z.object({
    reason: z.string().min(1).max(500),
    deactivatedBy: z.uuid(),
  }),
});

export const reactivateUserCommandSchema = z.object({
  type: z.literal(CommandType.REACTIVATE_USER),
  aggregateId: z.uuid(),
  metadata: eventMetadataSchema.optional(),
  payload: z.object({
    reason: z.string().min(1).max(500),
    reactivatedBy: z.uuid(),
  }),
});

export const recordUserSignInCommandSchema = z.object({
  type: z.literal(CommandType.RECORD_USER_SIGN_IN),
  aggregateId: z.uuid(),
  metadata: eventMetadataSchema.optional(),
  payload: z.object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
  }),
});

export const recordUserSignOutCommandSchema = z.object({
  type: z.literal(CommandType.RECORD_USER_SIGN_OUT),
  aggregateId: z.uuid(),
  metadata: eventMetadataSchema.optional(),
  payload: z.object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
  }),
});

/**
 * Command validation schema map with proper inference
 */
export const commandSchemas = {
  [CommandType.CREATE_USER]: createUserCommandSchema,
  [CommandType.UPDATE_USER_PROFILE]: updateUserProfileCommandSchema,
  [CommandType.UPDATE_USER_CREDENTIALS]: updateUserCredentialsCommandSchema,
  [CommandType.CHANGE_USER_ROLE]: changeUserRoleCommandSchema,
  [CommandType.CHANGE_USER_PASSWORD]: changeUserPasswordCommandSchema,
  [CommandType.DEACTIVATE_USER]: deactivateUserCommandSchema,
  [CommandType.REACTIVATE_USER]: reactivateUserCommandSchema,
  [CommandType.RECORD_USER_SIGN_IN]: recordUserSignInCommandSchema,
  [CommandType.RECORD_USER_SIGN_OUT]: recordUserSignOutCommandSchema,
} as const satisfies Record<CommandType, z.ZodSchema>;

/**
 * Type helper to get command from type
 */
export type CommandFromType<T extends CommandType> = Extract<UserCommand, { type: T }>;

/**
 * Type-safe command validation
 */
export function validateCommand<T extends UserCommand>(command: T): T {
  const schema = commandSchemas[command.type];
  if (!schema) {
    throw new Error(`Unknown command type: ${command.type}`);
  }

  const result = schema.safeParse(command);

  if (!result.success) {
    const messages = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Command validation failed: ${messages}`);
  }

  return result.data as T;
}

/**
 * Command factory functions for type-safe creation
 */
export const createCommand = {
  createUser: (
    aggregateId: AggregateId,
    payload: CreateUserPayload,
    metadata?: EventMetadata
  ): CreateUserCommand => ({
    type: CommandType.CREATE_USER,
    aggregateId,
    payload,
    metadata,
  }),

  updateUserProfile: (
    aggregateId: AggregateId,
    payload: UpdateUserProfilePayload,
    metadata?: EventMetadata
  ): UpdateUserProfileCommand => ({
    type: CommandType.UPDATE_USER_PROFILE,
    aggregateId,
    payload,
    metadata,
  }),

  updateUserCredentials: (
    aggregateId: AggregateId,
    payload: UpdateUserCredentialsPayload,
    metadata?: EventMetadata
  ): UpdateUserCredentialsCommand => ({
    type: CommandType.UPDATE_USER_CREDENTIALS,
    aggregateId,
    payload,
    metadata,
  }),

  changeUserRole: (
    aggregateId: AggregateId,
    payload: ChangeUserRolePayload,
    metadata?: EventMetadata
  ): ChangeUserRoleCommand => ({
    type: CommandType.CHANGE_USER_ROLE,
    aggregateId,
    payload,
    metadata,
  }),

  changeUserPassword: (
    aggregateId: AggregateId,
    payload: ChangeUserPasswordPayload,
    metadata?: EventMetadata
  ): ChangeUserPasswordCommand => ({
    type: CommandType.CHANGE_USER_PASSWORD,
    aggregateId,
    payload,
    metadata,
  }),

  deactivateUser: (
    aggregateId: AggregateId,
    payload: DeactivateUserPayload,
    metadata?: EventMetadata
  ): DeactivateUserCommand => ({
    type: CommandType.DEACTIVATE_USER,
    aggregateId,
    payload,
    metadata,
  }),

  reactivateUser: (
    aggregateId: AggregateId,
    payload: ReactivateUserPayload,
    metadata?: EventMetadata
  ): ReactivateUserCommand => ({
    type: CommandType.REACTIVATE_USER,
    aggregateId,
    payload,
    metadata,
  }),

  recordUserSignIn: (
    aggregateId: AggregateId,
    payload: RecordUserSignInPayload,
    metadata?: EventMetadata
  ): RecordUserSignInCommand => ({
    type: CommandType.RECORD_USER_SIGN_IN,
    aggregateId,
    payload,
    metadata,
  }),

  recordUserSignOut: (
    aggregateId: AggregateId,
    payload: RecordUserSignOutPayload,
    metadata?: EventMetadata
  ): RecordUserSignOutCommand => ({
    type: CommandType.RECORD_USER_SIGN_OUT,
    aggregateId,
    payload,
    metadata,
  }),
} as const;

/**
 * Command result with proper error types
 */
export type CommandResult<T = unknown> =
  | Result<T, never>
  | Result<never, Error>;

/**
 * Type guard for command types
 */
export const isCommand = {
  createUser: (command: UserCommand): command is CreateUserCommand =>
    command.type === CommandType.CREATE_USER,
  updateUserProfile: (command: UserCommand): command is UpdateUserProfileCommand =>
    command.type === CommandType.UPDATE_USER_PROFILE,
  updateUserCredentials: (command: UserCommand): command is UpdateUserCredentialsCommand =>
    command.type === CommandType.UPDATE_USER_CREDENTIALS,
  changeUserRole: (command: UserCommand): command is ChangeUserRoleCommand =>
    command.type === CommandType.CHANGE_USER_ROLE,
  changeUserPassword: (command: UserCommand): command is ChangeUserPasswordCommand =>
    command.type === CommandType.CHANGE_USER_PASSWORD,
  deactivateUser: (command: UserCommand): command is DeactivateUserCommand =>
    command.type === CommandType.DEACTIVATE_USER,
  reactivateUser: (command: UserCommand): command is ReactivateUserCommand =>
    command.type === CommandType.REACTIVATE_USER,
  recordUserSignIn: (command: UserCommand): command is RecordUserSignInCommand =>
    command.type === CommandType.RECORD_USER_SIGN_IN,
  recordUserSignOut: (command: UserCommand): command is RecordUserSignOutCommand =>
    command.type === CommandType.RECORD_USER_SIGN_OUT,
} as const;
