import {
  OptimisticConcurrencyError,
  type PostgreSQLEventStore,
  type PostgreSQLOutboxStore,
} from '@graphql-microservices/event-sourcing';
import { User } from '../domain/user-aggregate';
import {
  type ChangeUserPasswordCommand,
  type ChangeUserRoleCommand,
  type CommandFromType,
  type CommandResult,
  CommandType,
  type CreateUserCommand,
  type DeactivateUserCommand,
  type ReactivateUserCommand,
  type RecordUserSignInCommand,
  type RecordUserSignOutCommand,
  type UpdateUserCredentialsCommand,
  type UpdateUserProfileCommand,
  type UserCommand,
  validateCommand,
} from './commands';
import { type AggregateId, ok, err } from './types';

/**
 * Command handler interface with improved typing
 */
export interface CommandHandler<TCommand extends UserCommand = UserCommand> {
  readonly commandType: TCommand['type'];
  handle(command: TCommand): Promise<CommandResult>;
  canHandle(command: UserCommand): command is TCommand;
}

/**
 * Base command handler with common functionality
 */
abstract class BaseCommandHandler<TCommand extends UserCommand = UserCommand>
  implements CommandHandler<TCommand>
{
  abstract readonly commandType: TCommand['type'];

  constructor(
    protected readonly eventStore: PostgreSQLEventStore,
    protected readonly outboxStore: PostgreSQLOutboxStore
  ) {}

  abstract handle(command: TCommand): Promise<CommandResult>;

  canHandle(command: UserCommand): command is TCommand {
    return command.type === this.commandType;
  }

  /**
   * Load user aggregate from event store
   */
  protected async loadUser(aggregateId: string): Promise<User | null> {
    try {
      const events = await this.eventStore.readStream(aggregateId);
      if (events.length === 0) {
        return null;
      }

      return User.fromUserEvents(events);
    } catch (error) {
      console.error(`Failed to load user ${aggregateId}:`, error);
      throw new Error(`Failed to load user: ${error}`);
    }
  }

  /**
   * Save aggregate events to event store and outbox
   */
  protected async saveEvents(
    user: User,
    expectedVersion?: number,
    routingKey: string = 'user.events'
  ): Promise<void> {
    const uncommittedEvents = user.uncommittedEvents;
    if (uncommittedEvents.length === 0) {
      return;
    }

    try {
      // Save to event store with optimistic concurrency control
      await this.eventStore.appendToStream(user.id, uncommittedEvents.slice(), expectedVersion);

      // Add to outbox for reliable publishing
      await this.outboxStore.addEvents(uncommittedEvents.slice(), routingKey);

      // Mark events as committed
      user.markEventsAsCommitted();
    } catch (error) {
      if (error instanceof OptimisticConcurrencyError) {
        throw new Error(`Concurrency conflict: User was modified by another process`);
      }
      throw error;
    }
  }

  /**
   * Handle common command execution pattern with Result type
   */
  protected async executeCommand(
    command: UserCommand,
    businessLogicFn: (user: User) => Promise<void> | void
  ): Promise<CommandResult> {
    try {
      // Validate command
      validateCommand(command);

      // Load or create user
      const user = await this.loadUser(command.aggregateId);
      if (!user) {
        throw new Error(`User not found: ${command.aggregateId}`);
      }

      const initialVersion = user.version;

      // Execute business logic
      await businessLogicFn(user);

      // Save events
      await this.saveEvents(user, initialVersion);

      return ok({
        aggregateId: command.aggregateId as AggregateId,
        version: user.version,
        events: user.uncommittedEvents.slice(),
      });
    } catch (error) {
      console.error(`Command ${command.type} failed:`, error);

      let errorCode:
        | 'VALIDATION_ERROR'
        | 'CONCURRENCY_ERROR'
        | 'NOT_FOUND'
        | 'BUSINESS_RULE_VIOLATION'
        | 'INTERNAL_ERROR';

      if (error instanceof OptimisticConcurrencyError) {
        errorCode = 'CONCURRENCY_ERROR';
      } else if (error instanceof Error && error.message.includes('not found')) {
        errorCode = 'NOT_FOUND';
      } else {
        errorCode = 'INTERNAL_ERROR';
      }

      return err(new Error(error instanceof Error ? error.message : 'Unknown error'));
    }
  }
}

/**
 * Create User Command Handler
 */
export class CreateUserCommandHandler extends BaseCommandHandler<CreateUserCommand> {
  readonly commandType = CommandType.CREATE_USER;
  async handle(command: CreateUserCommand): Promise<CommandResult> {
    try {
      // Validate command
      validateCommand(command);

      // Check if user already exists
      const existingUser = await this.loadUser(command.aggregateId);
      if (existingUser) {
        throw new Error(`User already exists: ${command.aggregateId}`);
      }

      // Create new user aggregate
      const user = await User.create(
        command.aggregateId,
        command.payload.username,
        command.payload.email,
        command.payload.password,
        command.payload.name,
        command.payload.phoneNumber,
        command.metadata
      );

      // Save events
      await this.saveEvents(user, 0); // New aggregate, expected version is 0

      return ok({
        aggregateId: command.aggregateId,
        version: user.version,
        events: user.uncommittedEvents.slice(),
      });
    } catch (error) {
      console.error(`CreateUser command failed:`, error);

      return err(new Error(error instanceof Error ? error.message : 'Unknown error'));
    }
  }
}

/**
 * Update User Profile Command Handler
 */
export class UpdateUserProfileCommandHandler extends BaseCommandHandler<UpdateUserProfileCommand> {
  readonly commandType = CommandType.UPDATE_USER_PROFILE;
  async handle(command: UpdateUserProfileCommand): Promise<CommandResult> {
    return this.executeCommand(command, (user) => {
      user.updateProfile(command.payload.name, command.payload.phoneNumber, command.metadata);
    });
  }
}

/**
 * Update User Credentials Command Handler
 */
export class UpdateUserCredentialsCommandHandler extends BaseCommandHandler<UpdateUserCredentialsCommand> {
  readonly commandType = CommandType.UPDATE_USER_CREDENTIALS;
  async handle(command: UpdateUserCredentialsCommand): Promise<CommandResult> {
    return this.executeCommand(command, (user) => {
      user.updateCredentials(command.payload.username, command.payload.email, command.metadata);
    });
  }
}

/**
 * Change User Role Command Handler
 */
export class ChangeUserRoleCommandHandler extends BaseCommandHandler<ChangeUserRoleCommand> {
  readonly commandType = CommandType.CHANGE_USER_ROLE;
  async handle(command: ChangeUserRoleCommand): Promise<CommandResult> {
    return this.executeCommand(command, (user) => {
      user.changeRole(
        {
          newRole: command.payload.newRole,
          changedBy: command.payload.changedBy,
        },
        command.metadata
      );
    });
  }
}

/**
 * Change User Password Command Handler
 */
export class ChangeUserPasswordCommandHandler extends BaseCommandHandler<ChangeUserPasswordCommand> {
  readonly commandType = CommandType.CHANGE_USER_PASSWORD;
  async handle(command: ChangeUserPasswordCommand): Promise<CommandResult> {
    return this.executeCommand(command, async (user) => {
      await user.changePassword(
        {
          currentPassword: command.payload.currentPassword,
          newPassword: command.payload.newPassword,
          changedBy: command.payload.changedBy,
        },
        command.metadata
      );
    });
  }
}

/**
 * Deactivate User Command Handler
 */
export class DeactivateUserCommandHandler extends BaseCommandHandler<DeactivateUserCommand> {
  readonly commandType = CommandType.DEACTIVATE_USER;
  async handle(command: DeactivateUserCommand): Promise<CommandResult> {
    return this.executeCommand(command, (user) => {
      user.deactivate(
        {
          reason: command.payload.reason,
          deactivatedBy: command.payload.deactivatedBy,
        },
        command.metadata
      );
    });
  }
}

/**
 * Reactivate User Command Handler
 */
export class ReactivateUserCommandHandler extends BaseCommandHandler<ReactivateUserCommand> {
  readonly commandType = CommandType.REACTIVATE_USER;
  async handle(command: ReactivateUserCommand): Promise<CommandResult> {
    return this.executeCommand(command, (user) => {
      user.reactivate(
        {
          reason: command.payload.reason,
          reactivatedBy: command.payload.reactivatedBy,
        },
        command.metadata
      );
    });
  }
}

/**
 * Record User Sign In Command Handler
 */
export class RecordUserSignInCommandHandler extends BaseCommandHandler<RecordUserSignInCommand> {
  readonly commandType = CommandType.RECORD_USER_SIGN_IN;
  async handle(command: RecordUserSignInCommand): Promise<CommandResult> {
    return this.executeCommand(command, (user) => {
      user.recordSignIn(
        {
          ipAddress: command.payload.ipAddress,
          userAgent: command.payload.userAgent,
        },
        command.metadata
      );
    });
  }
}

/**
 * Record User Sign Out Command Handler
 */
export class RecordUserSignOutCommandHandler extends BaseCommandHandler<RecordUserSignOutCommand> {
  readonly commandType = CommandType.RECORD_USER_SIGN_OUT;
  async handle(command: RecordUserSignOutCommand) {
    return this.executeCommand(command, (user) => {
      user.recordSignOut();
    });
  }
}

/**
 * Command handler registry type
 */
export type CommandHandlerMap = {
  [K in CommandType]: CommandHandler<CommandFromType<K>>;
};

/**
 * Command Bus - Routes commands to appropriate handlers with type safety
 */
export class UserCommandBus {
  private readonly handlers: Map<CommandType, CommandHandler<any>> = new Map();

  constructor(eventStore: PostgreSQLEventStore, outboxStore: PostgreSQLOutboxStore) {
    // Register command handlers with type safety
    const handlers: CommandHandler<any>[] = [
      new CreateUserCommandHandler(eventStore, outboxStore),
      new UpdateUserProfileCommandHandler(eventStore, outboxStore),
      new UpdateUserCredentialsCommandHandler(eventStore, outboxStore),
      new ChangeUserRoleCommandHandler(eventStore, outboxStore),
      new ChangeUserPasswordCommandHandler(eventStore, outboxStore),
      new DeactivateUserCommandHandler(eventStore, outboxStore),
      new ReactivateUserCommandHandler(eventStore, outboxStore),
      new RecordUserSignInCommandHandler(eventStore, outboxStore),
      new RecordUserSignOutCommandHandler(eventStore, outboxStore),
    ];

    handlers.forEach((handler) => {
      this.handlers.set(handler.commandType, handler);
    });
  }

  /**
   * Execute a command
   */
  async execute<TCommand extends UserCommand = UserCommand>(
    command: TCommand
  ): Promise<CommandResult> {
    const handler = this.handlers.get(command.type) as CommandHandler<TCommand>;

    if (!handler) {
      throw new Error(`No handler found for command type: ${command.type}`);
    }

    try {
      return await handler.handle(command);
    } catch (error) {
      console.error(`Command execution failed:`, error);

      return err(new Error(error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Register a custom command handler
   */
  registerHandler<TCommand extends UserCommand = UserCommand>(
    commandType: TCommand['type'],
    handler: CommandHandler<TCommand>
  ): void {
    this.handlers.set(commandType, handler);
  }

  /**
   * Get all registered command types
   */
  getRegisteredCommands(): string[] {
    return Array.from(this.handlers.keys());
  }
}
