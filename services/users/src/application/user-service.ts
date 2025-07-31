import type { AuthService } from '@graphql-microservices/shared-auth';
import type { CacheService } from '@graphql-microservices/shared-cache';
import {
  AlreadyExistsError,
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError,
  InternalServerError,
  ValidationError,
} from '@graphql-microservices/shared-errors';
import { GraphQLError } from 'graphql';
import type { GraphQLRole, GraphQLUser } from '../types';
import type { UserCommandBus } from './command-handlers';
import type {
  ChangeUserPasswordCommand,
  ChangeUserRoleCommand,
  CreateUserCommand,
  DeactivateUserCommand,
  RecordUserSignInCommand,
  RecordUserSignOutCommand,
  UpdateUserCredentialsCommand,
  UpdateUserProfileCommand,
} from './commands';
import type {
  GetAllUsersQuery,
  GetUserByEmailQuery,
  GetUserByIdQuery,
  GetUserByUsernameQuery,
  GetUsersByIdsQuery,
  PaginatedResult,
  UserViewModel,
} from './queries';
import type { UserQueryBus } from './query-handlers';

/**
 * User service interface - bridges GraphQL resolvers with CQRS
 */
export interface UserServiceInterface {
  // Authentication operations
  signUp(input: SignUpInput, metadata?: CommandMetadata): Promise<AuthResult>;
  signIn(input: SignInInput, metadata?: CommandMetadata): Promise<AuthResult>;
  refreshToken(refreshToken: string): Promise<AuthResult>;
  signOut(userId: string): Promise<boolean>;

  // User operations
  getUserById(id: string): Promise<GraphQLUser | null>;
  getUserByUsername(username: string): Promise<GraphQLUser | null>;
  getUserByEmail(email: string): Promise<GraphQLUser | null>;
  getAllUsers(filter?: UserFilter, pagination?: Pagination): Promise<GraphQLUser[]>;
  getUsersByIds(ids: string[]): Promise<GraphQLUser[]>;

  // User mutations
  updateUserProfile(
    userId: string,
    input: UpdateProfileInput,
    metadata?: CommandMetadata
  ): Promise<GraphQLUser>;
  updateUser(
    userId: string,
    input: UpdateUserInput,
    currentUserId: string,
    currentUserRole: string,
    metadata?: CommandMetadata
  ): Promise<GraphQLUser>;
  changePassword(
    userId: string,
    input: ChangePasswordInput,
    metadata?: CommandMetadata
  ): Promise<boolean>;
  deactivateUser(
    userId: string,
    reason: string,
    deactivatedBy: string,
    metadata?: CommandMetadata
  ): Promise<GraphQLUser>;
}

// Input types
export interface SignUpInput {
  username: string;
  email: string;
  password: string;
  name: string;
  phoneNumber?: string;
}

export interface SignInInput {
  username: string;
  password: string;
}

export interface UpdateProfileInput {
  name?: string;
  phoneNumber?: string;
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
  name?: string;
  phoneNumber?: string;
  role?: GraphQLRole;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface AuthResult {
  user: GraphQLUser;
  accessToken: string;
  refreshToken: string;
}

export interface UserFilter {
  role?: GraphQLRole;
  isActive?: boolean;
}

export interface Pagination {
  offset?: number;
  limit?: number;
}

export interface CommandMetadata {
  correlationId?: string;
  userId?: string;
  source?: string;
}

/**
 * CQRS-based User Service implementation
 */
export class UserService implements UserServiceInterface {
  constructor(
    private readonly commandBus: UserCommandBus,
    private readonly queryBus: UserQueryBus,
    private readonly authService: AuthService,
    private readonly cacheService?: CacheService
  ) {}

  /**
   * Sign up a new user
   */
  async signUp(input: SignUpInput, metadata?: CommandMetadata): Promise<AuthResult> {
    try {
      const userId = crypto.randomUUID();

      // Create user command
      const command: CreateUserCommand = {
        type: 'CreateUser',
        aggregateId: userId,
        payload: {
          username: input.username,
          email: input.email,
          password: input.password,
          name: input.name,
          phoneNumber: input.phoneNumber,
        },
        metadata: {
          ...metadata,
          source: metadata?.source || 'graphql-api',
        },
      };

      // Execute command
      const result = await this.commandBus.execute(command);

      if (!result.success) {
        if (result.error?.includes('already exists')) {
          if (result.error.includes('username')) {
            throw new AlreadyExistsError('User', 'username', input.username);
          }
          if (result.error.includes('email')) {
            throw new AlreadyExistsError('User', 'email', input.email);
          }
        }
        throw new InternalServerError(result.error || 'Failed to create user');
      }

      // Get the created user
      const user = await this.getUserById(userId);
      if (!user) {
        throw new InternalServerError('User was created but could not be retrieved');
      }

      // Generate tokens
      const accessToken = this.authService.generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const refreshToken = this.authService.generateRefreshToken({
        userId: user.id,
        tokenId: user.id,
      });

      // Record sign in event
      await this.recordSignIn(userId, metadata);

      return {
        user,
        accessToken,
        refreshToken,
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new InternalServerError(`Sign up failed: ${error}`);
    }
  }

  /**
   * Sign in an existing user
   */
  async signIn(input: SignInInput, metadata?: CommandMetadata): Promise<AuthResult> {
    try {
      // Get user by username
      const user = await this.getUserByUsername(input.username);

      if (!user) {
        throw new AuthenticationError('Invalid credentials');
      }

      if (!user.isActive) {
        throw new BusinessRuleError('Account is deactivated');
      }

      // Verify password (this would need to be implemented in query handlers or a separate service)
      // For now, we'll create a specialized query or use the existing Prisma approach
      const isValidPassword = await this.verifyUserPassword(user.id, input.password);

      if (!isValidPassword) {
        throw new AuthenticationError('Invalid credentials');
      }

      // Generate tokens
      const accessToken = this.authService.generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const refreshToken = this.authService.generateRefreshToken({
        userId: user.id,
        tokenId: user.id,
      });

      // Record sign in event
      await this.recordSignIn(user.id, metadata);

      return {
        user,
        accessToken,
        refreshToken,
      };
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      throw new AuthenticationError('Sign in failed');
    }
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      const payload = this.authService.verifyRefreshToken(refreshToken);

      const user = await this.getUserById(payload.userId);

      if (!user || !user.isActive) {
        throw new AuthenticationError('Invalid refresh token');
      }

      // Generate new tokens
      const newAccessToken = this.authService.generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const newRefreshToken = this.authService.generateRefreshToken({
        userId: user.id,
        tokenId: user.id,
      });

      return {
        user,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (_error) {
      throw new AuthenticationError('Token refresh failed');
    }
  }

  /**
   * Sign out user
   */
  async signOut(userId: string): Promise<boolean> {
    try {
      const command: RecordUserSignOutCommand = {
        type: 'RecordUserSignOut',
        aggregateId: userId,
        metadata: {
          source: 'graphql-api',
        },
      };

      await this.commandBus.execute(command);

      // Clear cache
      if (this.cacheService) {
        await this.cacheService.delete(`user:${userId}`);
      }

      return true;
    } catch (error) {
      console.error('Sign out error:', error);
      return true; // Always return true for sign out
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<GraphQLUser | null> {
    const query: GetUserByIdQuery = {
      type: 'GetUserById',
      payload: { userId: id },
    };

    const result = await this.queryBus.execute<GetUserByIdQuery, UserViewModel | null>(query);

    if (!result.success || !result.data) {
      return null;
    }

    return this.transformToGraphQLUser(result.data as UserViewModel);
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<GraphQLUser | null> {
    const query: GetUserByUsernameQuery = {
      type: 'GetUserByUsername',
      payload: { username },
    };

    const result = await this.queryBus.execute<GetUserByUsernameQuery, UserViewModel | null>(query);

    if (!result.success || !result.data) {
      return null;
    }

    return this.transformToGraphQLUser(result.data as UserViewModel);
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<GraphQLUser | null> {
    const query: GetUserByEmailQuery = {
      type: 'GetUserByEmail',
      payload: { email },
    };

    const result = await this.queryBus.execute<GetUserByEmailQuery, UserViewModel | null>(query);

    if (!result.success || !result.data) {
      return null;
    }

    return this.transformToGraphQLUser(result.data);
  }

  /**
   * Get all users with filtering and pagination
   */
  async getAllUsers(filter?: UserFilter, pagination?: Pagination): Promise<GraphQLUser[]> {
    const query: GetAllUsersQuery = {
      type: 'GetAllUsers',
      payload: {
        filter: filter
          ? {
              role: filter.role,
              isActive: filter.isActive,
            }
          : undefined,
        pagination: pagination
          ? {
              offset: pagination.offset,
              limit: pagination.limit,
            }
          : undefined,
      },
    };

    const result = await this.queryBus.execute<GetAllUsersQuery, PaginatedResult<UserViewModel>>(
      query
    );

    if (!result.success || !result.data) {
      return [];
    }

    return result.data.items.map((user) => this.transformToGraphQLUser(user));
  }

  /**
   * Get users by IDs (for DataLoader)
   */
  async getUsersByIds(ids: string[]): Promise<GraphQLUser[]> {
    const query: GetUsersByIdsQuery = {
      type: 'GetUsersByIds',
      payload: { userIds: ids },
    };

    const result = await this.queryBus.execute<GetUsersByIdsQuery, UserViewModel[]>(query);

    if (!result.success || !result.data) {
      return [];
    }

    return result.data.map((user) => this.transformToGraphQLUser(user));
  }

  /**
   * Update user profile
   */
  async updateUserProfile(
    userId: string,
    input: UpdateProfileInput,
    metadata?: CommandMetadata
  ): Promise<GraphQLUser> {
    const command: UpdateUserProfileCommand = {
      type: 'UpdateUserProfile',
      aggregateId: userId,
      payload: {
        name: input.name,
        phoneNumber: input.phoneNumber,
      },
      metadata: {
        ...metadata,
        userId,
        source: metadata?.source || 'graphql-api',
      },
    };

    const result = await this.commandBus.execute(command);

    if (!result.success) {
      throw new InternalServerError(result.error || 'Failed to update user profile');
    }

    // Clear cache and return updated user
    if (this.cacheService) {
      await this.cacheService.delete(`user:${userId}`);
    }

    const updatedUser = await this.getUserById(userId);
    if (!updatedUser) {
      throw new InternalServerError('User was updated but could not be retrieved');
    }

    return updatedUser;
  }

  /**
   * Update user (admin operation)
   */
  async updateUser(
    userId: string,
    input: UpdateUserInput,
    currentUserId: string,
    currentUserRole: string,
    metadata?: CommandMetadata
  ): Promise<GraphQLUser> {
    // Authorization check
    if (currentUserRole !== 'ADMIN' && currentUserId !== userId) {
      throw new AuthorizationError('You can only update your own profile');
    }

    // Handle profile vs credentials updates
    if (input.name !== undefined || input.phoneNumber !== undefined) {
      await this.updateUserProfile(
        userId,
        {
          name: input.name,
          phoneNumber: input.phoneNumber,
        },
        metadata
      );
    }

    if (input.username !== undefined || input.email !== undefined) {
      const command: UpdateUserCredentialsCommand = {
        type: 'UpdateUserCredentials',
        aggregateId: userId,
        payload: {
          username: input.username,
          email: input.email,
        },
        metadata: {
          ...metadata,
          userId: currentUserId,
          source: metadata?.source || 'graphql-api',
        },
      };

      const result = await this.commandBus.execute(command);

      if (!result.success) {
        if (result.error?.includes('already exists')) {
          if (result.error.includes('username')) {
            throw new AlreadyExistsError('User', 'username', input.username || '');
          }
          if (result.error.includes('email')) {
            throw new AlreadyExistsError('User', 'email', input.email || '');
          }
        }
        throw new InternalServerError(result.error || 'Failed to update user credentials');
      }
    }

    if (input.role !== undefined && currentUserRole === 'ADMIN') {
      const command: ChangeUserRoleCommand = {
        type: 'ChangeUserRole',
        aggregateId: userId,
        payload: {
          newRole: input.role,
          changedBy: currentUserId,
        },
        metadata: {
          ...metadata,
          userId: currentUserId,
          source: metadata?.source || 'graphql-api',
        },
      };

      const result = await this.commandBus.execute(command);

      if (!result.success) {
        throw new InternalServerError(result.error || 'Failed to change user role');
      }
    }

    // Clear cache and return updated user
    if (this.cacheService) {
      await this.cacheService.delete(`user:${userId}`);
    }

    const updatedUser = await this.getUserById(userId);
    if (!updatedUser) {
      throw new InternalServerError('User was updated but could not be retrieved');
    }

    return updatedUser;
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    metadata?: CommandMetadata
  ): Promise<boolean> {
    const command: ChangeUserPasswordCommand = {
      type: 'ChangeUserPassword',
      aggregateId: userId,
      payload: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        changedBy: userId,
      },
      metadata: {
        ...metadata,
        userId,
        source: metadata?.source || 'graphql-api',
      },
    };

    const result = await this.commandBus.execute(command);

    if (!result.success) {
      if (result.error?.includes('Invalid credentials')) {
        throw new ValidationError('Invalid current password', [
          { field: 'currentPassword', message: 'Current password is incorrect' },
        ]);
      }
      throw new InternalServerError(result.error || 'Failed to change password');
    }

    return true;
  }

  /**
   * Deactivate user
   */
  async deactivateUser(
    userId: string,
    reason: string,
    deactivatedBy: string,
    metadata?: CommandMetadata
  ): Promise<GraphQLUser> {
    const command: DeactivateUserCommand = {
      type: 'DeactivateUser',
      aggregateId: userId,
      payload: {
        reason,
        deactivatedBy,
      },
      metadata: {
        ...metadata,
        userId: deactivatedBy,
        source: metadata?.source || 'graphql-api',
      },
    };

    const result = await this.commandBus.execute(command);

    if (!result.success) {
      throw new InternalServerError(result.error || 'Failed to deactivate user');
    }

    // Clear cache and return updated user
    if (this.cacheService) {
      await this.cacheService.delete(`user:${userId}`);
    }

    const deactivatedUser = await this.getUserById(userId);
    if (!deactivatedUser) {
      throw new InternalServerError('User was deactivated but could not be retrieved');
    }

    return deactivatedUser;
  }

  /**
   * Record user sign in event
   */
  private async recordSignIn(userId: string, metadata?: CommandMetadata): Promise<void> {
    const command: RecordUserSignInCommand = {
      type: 'RecordUserSignIn',
      aggregateId: userId,
      payload: {
        // These would typically come from request context
        ipAddress: metadata?.source,
        userAgent: 'GraphQL API',
      },
      metadata: {
        ...metadata,
        userId,
        source: metadata?.source || 'graphql-api',
      },
    };

    await this.commandBus.execute(command);
  }

  /**
   * Verify user password (temporary implementation - should be moved to proper place)
   */
  private async verifyUserPassword(_userId: string, _password: string): Promise<boolean> {
    // This is a placeholder - in a real implementation, this would either:
    // 1. Be handled by the User aggregate loaded from event store
    // 2. Be a specialized query that accesses the password hash securely
    // 3. Be part of the existing Prisma-based approach during transition

    // For now, return true (this should be implemented properly)
    console.warn('⚠️  Password verification is not properly implemented yet');
    return true;
  }

  /**
   * Transform UserViewModel to GraphQLUser
   */
  private transformToGraphQLUser(user: UserViewModel): GraphQLUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      phoneNumber: user.phoneNumber,
      role: user.role as GraphQLRole,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
