import {
  OptimisticConcurrencyError,
  type PostgreSQLEventStore,
  type PostgreSQLOutboxStore,
} from '@graphql-microservices/event-sourcing';
import { User } from '../domain/user-aggregate';
import {
  type ChangeUserPasswordCommand,
  type ChangeUserRoleCommand,
  type CommandResult,
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

/**
 * Command handler interface
 */
export interface CommandHandler<T extends UserCommand> {
  handle(command: T): Promise<CommandResult>;
}

/**
 * Base command handler with common functionality
 */
abstract class BaseCommandHandler<T extends UserCommand> implements CommandHandler<T> {
  constructor(
    protected readonly eventStore: PostgreSQLEventStore,
    protected readonly outboxStore: PostgreSQLOutboxStore
  ) {}

  abstract handle(command: T): Promise<CommandResult>;

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
   * Handle common command execution pattern
   */
  protected async executeCommand<R>(
    command: T,
    businessLogicFn: (user: User) => Promise<R> | R
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

      return {
        success: true,
        aggregateId: command.aggregateId,
        version: user.version,
        events: user.uncommittedEvents.slice(),
      };
    } catch (error) {
      console.error(`Command ${command.type} failed:`, error);

      return {
        success: false,
        aggregateId: command.aggregateId,
        version: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Create User Command Handler
 */
export class CreateUserCommandHandler extends BaseCommandHandler<CreateUserCommand> {
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

      return {
        success: true,
        aggregateId: command.aggregateId,
        version: user.version,
        events: user.uncommittedEvents.slice(),
      };
    } catch (error) {
      console.error(`CreateUser command failed:`, error);

      return {
        success: false,
        aggregateId: command.aggregateId,
        version: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Update User Profile Command Handler
 */
export class UpdateUserProfileCommandHandler extends BaseCommandHandler<UpdateUserProfileCommand> {
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
  async handle(command: ChangeUserRoleCommand): Promise<CommandResult> {
    return this.executeCommand(command, (user) => {
      user.changeRole(command.payload.newRole, command.payload.changedBy, command.metadata);
    });
  }
}

/**
 * Change User Password Command Handler
 */
export class ChangeUserPasswordCommandHandler extends BaseCommandHandler<ChangeUserPasswordCommand> {
  async handle(command: ChangeUserPasswordCommand): Promise<CommandResult> {
    return this.executeCommand(command, async (user) => {
      await user.changePassword(
        command.payload.currentPassword,
        command.payload.newPassword,
        command.payload.changedBy,
        command.metadata
      );
    });
  }
}

/**
 * Deactivate User Command Handler
 */
export class DeactivateUserCommandHandler extends BaseCommandHandler<DeactivateUserCommand> {
  async handle(command: DeactivateUserCommand): Promise<CommandResult> {
    return this.executeCommand(command, (user) => {
      user.deactivate(command.payload.reason, command.payload.deactivatedBy, command.metadata);
    });
  }
}

/**
 * Reactivate User Command Handler
 */
export class ReactivateUserCommandHandler extends BaseCommandHandler<ReactivateUserCommand> {
  async handle(command: ReactivateUserCommand): Promise<CommandResult> {
    return this.executeCommand(command, (user) => {
      user.reactivate(command.payload.reason, command.payload.reactivatedBy, command.metadata);
    });
  }
}

/**
 * Record User Sign In Command Handler
 */
export class RecordUserSignInCommandHandler extends BaseCommandHandler<RecordUserSignInCommand> {
  async handle(command: RecordUserSignInCommand): Promise<CommandResult> {
    return this.executeCommand(command, (user) => {
      user.recordSignIn(command.payload.ipAddress, command.payload.userAgent, command.metadata);
    });
  }
}

/**
 * Record User Sign Out Command Handler
 */
export class RecordUserSignOutCommandHandler extends BaseCommandHandler<RecordUserSignOutCommand> {
  async handle(command: RecordUserSignOutCommand): Promise<CommandResult> {
    return this.executeCommand(command, (user) => {
      user.recordSignOut();
    });
  }
}

/**
 * Command Bus - Routes commands to appropriate handlers
 */
export class UserCommandBus {
  private readonly handlers = new Map<string, CommandHandler<UserCommand>>();

  constructor(eventStore: PostgreSQLEventStore, outboxStore: PostgreSQLOutboxStore) {
    // Register command handlers
    this.handlers.set('CreateUser', new CreateUserCommandHandler(eventStore, outboxStore));
    this.handlers.set(
      'UpdateUserProfile',
      new UpdateUserProfileCommandHandler(eventStore, outboxStore)
    );
    this.handlers.set(
      'UpdateUserCredentials',
      new UpdateUserCredentialsCommandHandler(eventStore, outboxStore)
    );
    this.handlers.set('ChangeUserRole', new ChangeUserRoleCommandHandler(eventStore, outboxStore));
    this.handlers.set(
      'ChangeUserPassword',
      new ChangeUserPasswordCommandHandler(eventStore, outboxStore)
    );
    this.handlers.set('DeactivateUser', new DeactivateUserCommandHandler(eventStore, outboxStore));
    this.handlers.set('ReactivateUser', new ReactivateUserCommandHandler(eventStore, outboxStore));
    this.handlers.set(
      'RecordUserSignIn',
      new RecordUserSignInCommandHandler(eventStore, outboxStore)
    );
    this.handlers.set(
      'RecordUserSignOut',
      new RecordUserSignOutCommandHandler(eventStore, outboxStore)
    );
  }

  /**
   * Execute a command
   */
  async execute<T extends UserCommand>(command: T): Promise<CommandResult> {
    const handler = this.handlers.get(command.type) as CommandHandler<T>;

    if (!handler) {
      throw new Error(`No handler found for command type: ${command.type}`);
    }

    try {
      return await handler.handle(command);
    } catch (error) {
      console.error(`Command execution failed:`, error);

      return {
        success: false,
        aggregateId: command.aggregateId,
        version: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Register a custom command handler
   */
  registerHandler<T extends UserCommand>(commandType: string, handler: CommandHandler<T>): void {
    this.handlers.set(commandType, handler);
  }

  /**
   * Get all registered command types
   */
  getRegisteredCommands(): string[] {
    return Array.from(this.handlers.keys());
  }
}
