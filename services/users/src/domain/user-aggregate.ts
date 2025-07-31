import {
  AggregateRoot,
  type DomainEvent,
  EventFactory,
} from '@graphql-microservices/event-sourcing';
import { hashPassword, verifyPassword } from './auth-helpers';

/**
 * User domain events
 */
export interface UserCreatedEvent extends DomainEvent {
  type: 'UserCreated';
  data: {
    username: string;
    email: string;
    name: string;
    phoneNumber?: string;
    role: 'USER' | 'ADMIN' | 'MODERATOR';
  };
}

export interface UserProfileUpdatedEvent extends DomainEvent {
  type: 'UserProfileUpdated';
  data: {
    name?: string;
    phoneNumber?: string;
    previousName?: string;
    previousPhoneNumber?: string;
  };
}

export interface UserCredentialsUpdatedEvent extends DomainEvent {
  type: 'UserCredentialsUpdated';
  data: {
    username?: string;
    email?: string;
    previousUsername?: string;
    previousEmail?: string;
  };
}

export interface UserRoleChangedEvent extends DomainEvent {
  type: 'UserRoleChanged';
  data: {
    newRole: 'USER' | 'ADMIN' | 'MODERATOR';
    previousRole: 'USER' | 'ADMIN' | 'MODERATOR';
    changedBy: string;
  };
}

export interface UserPasswordChangedEvent extends DomainEvent {
  type: 'UserPasswordChanged';
  data: {
    changedBy: string;
  };
}

export interface UserDeactivatedEvent extends DomainEvent {
  type: 'UserDeactivated';
  data: {
    reason: string;
    deactivatedBy: string;
  };
}

export interface UserReactivatedEvent extends DomainEvent {
  type: 'UserReactivated';
  data: {
    reason: string;
    reactivatedBy: string;
  };
}

export interface UserSignedInEvent extends DomainEvent {
  type: 'UserSignedIn';
  data: {
    timestamp: Date;
    ipAddress?: string;
    userAgent?: string;
  };
}

export interface UserSignedOutEvent extends DomainEvent {
  type: 'UserSignedOut';
  data: {
    timestamp: Date;
  };
}

export type UserDomainEvent =
  | UserCreatedEvent
  | UserProfileUpdatedEvent
  | UserCredentialsUpdatedEvent
  | UserRoleChangedEvent
  | UserPasswordChangedEvent
  | UserDeactivatedEvent
  | UserReactivatedEvent
  | UserSignedInEvent
  | UserSignedOutEvent;

/**
 * User aggregate errors
 */
export class UserDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'UserDomainError';
  }
}

export class UserAlreadyExistsError extends UserDomainError {
  constructor(field: string, value: string) {
    super(`User with ${field} '${value}' already exists`, 'USER_ALREADY_EXISTS');
  }
}

export class UserNotFoundError extends UserDomainError {
  constructor(id: string) {
    super(`User with id '${id}' not found`, 'USER_NOT_FOUND');
  }
}

export class UserDeactivatedError extends UserDomainError {
  constructor() {
    super('User account is deactivated', 'USER_DEACTIVATED');
  }
}

export class InvalidCredentialsError extends UserDomainError {
  constructor() {
    super('Invalid credentials provided', 'INVALID_CREDENTIALS');
  }
}

export class UnauthorizedOperationError extends UserDomainError {
  constructor(operation: string) {
    super(`Unauthorized to perform operation: ${operation}`, 'UNAUTHORIZED_OPERATION');
  }
}

/**
 * User aggregate root
 */
export class User extends AggregateRoot {
  private username: string = '';
  private email: string = '';
  private name: string = '';
  private phoneNumber?: string;
  private role: 'USER' | 'ADMIN' | 'MODERATOR' = 'USER';
  private isActive: boolean = true;
  private passwordHash: string = '';
  private refreshToken?: string;
  private createdAt: Date = new Date();
  private updatedAt: Date = new Date();

  /**
   * Create a new user
   */
  static async create(
    id: string,
    username: string,
    email: string,
    password: string,
    name: string,
    phoneNumber?: string,
    metadata?: { correlationId?: string; source?: string }
  ): Promise<User> {
    const user = new User(id);

    // Hash password
    const passwordHash = await hashPassword(password);

    const event = EventFactory.create(
      'UserCreated',
      id,
      'User',
      {
        username,
        email,
        name,
        phoneNumber,
        role: 'USER',
      },
      {
        source: metadata?.source || 'users-service',
        correlationId: metadata?.correlationId,
      },
      1
    );

    user.applyEvent(event);
    user.passwordHash = passwordHash;

    return user;
  }

  /**
   * Create user from events (for event sourcing reconstruction)
   */
  static fromUserEvents(events: DomainEvent[]): User {
    if (events.length === 0) {
      throw new Error('Cannot create user from empty event stream');
    }

    const firstEvent = events[0];
    const user = new User(firstEvent?.aggregateId ?? '');

    // Apply all events to reconstruct state
    for (const event of events) {
      user.applyEventData(event);
    }

    user.markEventsAsCommitted();
    return user;
  }

  /**
   * Update user profile
   */
  updateProfile(
    name?: string,
    phoneNumber?: string,
    metadata?: { correlationId?: string; userId?: string }
  ): void {
    if (!this.isActive) {
      throw new UserDeactivatedError();
    }

    const previousName = this.name;
    const previousPhoneNumber = this.phoneNumber;

    // Only create event if there are actual changes
    if (
      (name !== undefined && name !== this.name) ||
      (phoneNumber !== undefined && phoneNumber !== this.phoneNumber)
    ) {
      const event = EventFactory.create(
        'UserProfileUpdated',
        this.id,
        'User',
        {
          name,
          phoneNumber,
          previousName,
          previousPhoneNumber,
        },
        {
          source: 'users-service',
          correlationId: metadata?.correlationId,
          userId: metadata?.userId,
        },
        this.version + 1
      );

      this.applyEvent(event);
    }
  }

  /**
   * Update user credentials (username/email)
   */
  updateCredentials(
    username?: string,
    email?: string,
    metadata?: { correlationId?: string; userId?: string }
  ): void {
    if (!this.isActive) {
      throw new UserDeactivatedError();
    }

    const previousUsername = this.username;
    const previousEmail = this.email;

    // Only create event if there are actual changes
    if (
      (username !== undefined && username !== this.username) ||
      (email !== undefined && email !== this.email)
    ) {
      const event = EventFactory.create(
        'UserCredentialsUpdated',
        this.id,
        'User',
        {
          username,
          email,
          previousUsername,
          previousEmail,
        },
        {
          source: 'users-service',
          correlationId: metadata?.correlationId,
          userId: metadata?.userId,
        },
        this.version + 1
      );

      this.applyEvent(event);
    }
  }

  /**
   * Change user role (admin only)
   */
  changeRole(
    input: {
      newRole: 'USER' | 'ADMIN' | 'MODERATOR';
      changedBy: string;
    },
    metadata?: { correlationId?: string }
  ): void {
    if (!this.isActive) {
      throw new UserDeactivatedError();
    }

    if (input.newRole === this.role) {
      return; // No change needed
    }

    const event = EventFactory.create(
      'UserRoleChanged',
      this.id,
      'User',
      {
        newRole: input.newRole,
        previousRole: this.role,
        changedBy: input.changedBy,
      },
      {
        source: 'users-service',
        correlationId: metadata?.correlationId,
        userId: input.changedBy,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Change password
   */
  async changePassword(
    input: {
      currentPassword: string;
      newPassword: string;
      changedBy: string;
    },
    metadata?: { correlationId?: string }
  ): Promise<void> {
    if (!this.isActive) {
      throw new UserDeactivatedError();
    }

    // Verify current password
    const isValid = await verifyPassword(input.currentPassword, this.passwordHash);
    if (!isValid) {
      throw new InvalidCredentialsError();
    }

    // Hash new password
    const newPasswordHash = await hashPassword(input.newPassword);

    const event = EventFactory.create(
      'UserPasswordChanged',
      this.id,
      'User',
      {
        changedBy: input.changedBy,
      },
      {
        source: 'users-service',
        correlationId: metadata?.correlationId,
        userId: input.changedBy,
      },
      this.version + 1
    );

    this.applyEvent(event);
    this.passwordHash = newPasswordHash;
    this.refreshToken = undefined; // Invalidate refresh token
  }

  /**
   * Deactivate user
   */
  deactivate(
    input: {
      reason: string;
      deactivatedBy: string;
    },
    metadata?: { correlationId?: string }
  ): void {
    if (!this.isActive) {
      return; // Already deactivated
    }

    const event = EventFactory.create(
      'UserDeactivated',
      this.id,
      'User',
      {
        reason: input.reason,
        deactivatedBy: input.deactivatedBy,
      },
      {
        source: 'users-service',
        correlationId: metadata?.correlationId,
        userId: input.deactivatedBy,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Reactivate user
   */
  reactivate(
    input: {
      reason: string;
      reactivatedBy: string;
    },
    metadata?: { correlationId?: string }
  ): void {
    if (this.isActive) {
      return; // Already active
    }

    const event = EventFactory.create(
      'UserReactivated',
      this.id,
      'User',
      {
        reason: input.reason,
        reactivatedBy: input.reactivatedBy,
      },
      {
        source: 'users-service',
        correlationId: metadata?.correlationId,
        userId: input.reactivatedBy,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Record sign in event
   */
  recordSignIn(
    input: {
      ipAddress?: string;
      userAgent?: string;
    },
    metadata?: { correlationId?: string }
  ): void {
    if (!this.isActive) {
      throw new UserDeactivatedError();
    }

    const event = EventFactory.create(
      'UserSignedIn',
      this.id,
      'User',
      {
        timestamp: new Date(),
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
      {
        source: 'users-service',
        correlationId: metadata?.correlationId,
      },
      this.version + 1
    );

    this.applyEvent(event);
  }

  /**
   * Record sign out event
   */
  recordSignOut(): void {
    const event = EventFactory.create(
      'UserSignedOut',
      this.id,
      'User',
      { timestamp: new Date() },
      { source: 'users-service' },
      this.version + 1
    );

    this.applyEvent(event);
    this.refreshToken = undefined;
  }

  /**
   * Set refresh token
   */
  setRefreshToken(input: { refreshToken: string }): void {
    this.refreshToken = input.refreshToken;
  }

  /**
   * Verify credentials
   */
  async verifyPassword(input: { password: string }): Promise<boolean> {
    return verifyPassword(input.password, this.passwordHash);
  }

  /**
   * Apply event data to aggregate state
   */
  protected applyEventData(event: DomainEvent): void {
    switch (event.type) {
      case 'UserCreated': {
        const createdData = event.data as UserCreatedEvent['data'];
        this.username = createdData.username;
        this.email = createdData.email;
        this.name = createdData.name;
        this.phoneNumber = createdData.phoneNumber;
        this.role = createdData.role;
        this.isActive = true;
        this.createdAt = event.occurredAt;
        this.updatedAt = event.occurredAt;
        break;
      }

      case 'UserProfileUpdated': {
        const profileData = event.data as UserProfileUpdatedEvent['data'];
        if (profileData.name !== undefined) {
          this.name = profileData.name;
        }
        if (profileData.phoneNumber !== undefined) {
          this.phoneNumber = profileData.phoneNumber;
        }
        this.updatedAt = event.occurredAt;
        break;
      }

      case 'UserCredentialsUpdated': {
        const credentialsData = event.data as UserCredentialsUpdatedEvent['data'];
        if (credentialsData.username !== undefined) {
          this.username = credentialsData.username;
        }
        if (credentialsData.email !== undefined) {
          this.email = credentialsData.email;
        }
        this.updatedAt = event.occurredAt;
        break;
      }

      case 'UserRoleChanged': {
        const roleData = event.data as UserRoleChangedEvent['data'];
        this.role = roleData.newRole;
        this.updatedAt = event.occurredAt;
        break;
      }

      case 'UserPasswordChanged':
        this.updatedAt = event.occurredAt;
        // Password hash is updated separately in the business method
        break;

      case 'UserDeactivated':
        this.isActive = false;
        this.refreshToken = undefined;
        this.updatedAt = event.occurredAt;
        break;

      case 'UserReactivated':
        this.isActive = true;
        this.updatedAt = event.occurredAt;
        break;

      case 'UserSignedIn':
        // Sign-in events don't change aggregate state
        break;

      case 'UserSignedOut':
        this.refreshToken = undefined;
        break;

      default:
        throw new Error(`Unknown event type: ${(event as { type: string }).type}`);
    }
  }

  // Getters
  getUsername(): string {
    return this.username;
  }
  getEmail(): string {
    return this.email;
  }
  getName(): string {
    return this.name;
  }
  getPhoneNumber(): string | undefined {
    return this.phoneNumber;
  }
  getRole(): 'USER' | 'ADMIN' | 'MODERATOR' {
    return this.role;
  }
  getIsActive(): boolean {
    return this.isActive;
  }
  getPasswordHash(): string {
    return this.passwordHash;
  }
  getRefreshToken(): string | undefined {
    return this.refreshToken;
  }
  getCreatedAt(): Date {
    return this.createdAt;
  }
  getUpdatedAt(): Date {
    return this.updatedAt;
  }
}
