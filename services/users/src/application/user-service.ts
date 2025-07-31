import type { AuthService } from '@graphql-microservices/shared-auth';
import type { CacheService } from '@graphql-microservices/shared-cache';
import type { GraphQLRole, GraphQLUser } from '../types';
import type { UserCommandBus } from './command-handlers';
import { createCommand } from './commands';
import { createQuery, type PaginatedResult, type UserViewModel } from './queries';
import type { UserQueryBus } from './query-handlers';
import { isOk, isErr } from '@graphql-microservices/shared-type-utils';
import {
  type AccessToken,
  type AggregateId,
  type CommandMetadata,
  type Email,
  type Pagination,
  type RefreshToken,
  ok,
  err,
  type UserFilter,
  type UserId,
  type Username,
  type UserRole,
} from './types';

/**
 * Service error types
 */
export interface ServiceError {
  code: 'VALIDATION' | 'NOT_FOUND' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'CONFLICT' | 'INTERNAL';
  message: string;
  details?: unknown;
}

/**
 * User service interface - bridges GraphQL resolvers with CQRS
 */
export interface IUserService {
  // Authentication operations
  signUp(input: SignUpInput, metadata?: CommandMetadata): Promise<Result<AuthResult, ServiceError>>;
  signIn(input: SignInInput, metadata?: CommandMetadata): Promise<Result<AuthResult, ServiceError>>;
  refreshToken(refreshToken: RefreshToken): Promise<Result<AuthResult, ServiceError>>;
  signOut(userId: UserId): Promise<Result<boolean, ServiceError>>;

  // User operations
  getUserById(id: UserId): Promise<Result<GraphQLUser | null, ServiceError>>;
  getUserByUsername(username: Username): Promise<Result<GraphQLUser | null, ServiceError>>;
  getUserByEmail(email: Email): Promise<Result<GraphQLUser | null, ServiceError>>;
  getAllUsers(
    filter?: UserFilter,
    pagination?: Pagination
  ): Promise<Result<PaginatedResult<GraphQLUser>, ServiceError>>;
  getUsersByIds(ids: UserId[]): Promise<Result<GraphQLUser[], ServiceError>>;

  // User mutations
  updateUserProfile(
    userId: UserId,
    input: UpdateProfileInput,
    metadata?: CommandMetadata
  ): Promise<Result<GraphQLUser, ServiceError>>;
  updateUser(
    userId: UserId,
    input: UpdateUserInput,
    currentUserId: UserId,
    currentUserRole: UserRole,
    metadata?: CommandMetadata
  ): Promise<Result<GraphQLUser, ServiceError>>;
  changePassword(
    userId: UserId,
    input: ChangePasswordInput,
    metadata?: CommandMetadata
  ): Promise<Result<boolean, ServiceError>>;
  deactivateUser(
    userId: UserId,
    reason: string,
    deactivatedBy: UserId,
    metadata?: CommandMetadata
  ): Promise<Result<GraphQLUser, ServiceError>>;
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
  role?: UserRole;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

// Result types
export interface AuthResult {
  user: GraphQLUser;
  accessToken: AccessToken;
  refreshToken: RefreshToken;
}

/**
 * CQRS-based User Service implementation
 */
export class UserService implements IUserService {
  constructor(
    private readonly commandBus: UserCommandBus,
    private readonly queryBus: UserQueryBus,
    private readonly authService: AuthService,
    private readonly cacheService?: CacheService
  ) {}

  /**
   * Sign up a new user
   */
  async signUp(
    input: SignUpInput,
    metadata?: CommandMetadata
  ): Promise<Result<AuthResult, ServiceError>> {
    try {
      // Check if user already exists
      const existingUserByUsername = await this.queryBus.execute(
        createQuery.getUserByUsername(input.username as Username)
      );

      if (isOk(existingUserByUsername) && existingUserByUsername.data.data) {
        return err({
          code: 'CONFLICT',
          message: 'Username already exists',
          details: { field: 'username' },
        });
      }

      const existingUserByEmail = await this.queryBus.execute(
        createQuery.getUserByEmail(input.email as Email)
      );

      if (isOk(existingUserByEmail) && existingUserByEmail.data.data) {
        return err({
          code: 'CONFLICT',
          message: 'Email already exists',
          details: { field: 'email' },
        });
      }

      // Hash password
      const hashedPassword = await this.authService.hashPassword(input.password);

      // Create user command
      const userId = crypto.randomUUID() as AggregateId;
      const userCommand = createCommand.createUser(
        userId,
        {
          username: input.username,
          email: input.email,
          password: hashedPassword,
          name: input.name,
          phoneNumber: input.phoneNumber,
        },
        metadata
      );

      const commandResult = await this.commandBus.execute(userCommand);

      if (!isOk(commandResult)) {
        return err({
          code: 'INTERNAL',
          message: commandResult.error.message,
          details: commandResult.error.details,
        });
      }

      // Get created user
      const userResult = await this.queryBus.execute(createQuery.getUserById(userId as UserId));

      if (!isOk(userResult) || !userResult.data.data) {
        return err({
          code: 'INTERNAL',
          message: 'Failed to retrieve created user',
        });
      }

      const user = this.transformToGraphQLUser(userResult.data.data);

      // Generate tokens
      const accessToken = this.authService.signAccessToken({
        userId: user.id,
        username: user.username,
        role: user.role,
      }) as AccessToken;

      const refreshToken = this.authService.signRefreshToken({
        userId: user.id,
        username: user.username,
      }) as RefreshToken;

      // Store refresh token
      await this.storeRefreshToken(user.id as UserId, refreshToken);

      return ok({
        user,
        accessToken,
        refreshToken,
      });
    } catch (error) {
      console.error('SignUp failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'An unexpected error occurred during sign up',
        details: error,
      });
    }
  }

  /**
   * Sign in an existing user
   */
  async signIn(
    input: SignInInput,
    metadata?: CommandMetadata
  ): Promise<Result<AuthResult, ServiceError>> {
    try {
      // Get user by username
      const userResult = await this.queryBus.execute(
        createQuery.getUserByUsername(input.username as Username)
      );

      if (!isOk(userResult) || !userResult.data.data) {
        return err({
          code: 'UNAUTHORIZED',
          message: 'Invalid credentials',
        });
      }

      const userViewModel = userResult.data.data;

      // Verify password
      const isValidPassword = await this.authService.verifyPassword(
        input.password,
        userViewModel.password // Note: This assumes password is included in the view model
      );

      if (!isValidPassword) {
        return err({
          code: 'UNAUTHORIZED',
          message: 'Invalid credentials',
        });
      }

      // Check if user is active
      if (!userViewModel.isActive) {
        return err({
          code: 'FORBIDDEN',
          message: 'Account is deactivated',
        });
      }

      // Record sign in
      const signInCommand = createCommand.recordUserSignIn(
        userViewModel.id as AggregateId,
        {
          ipAddress: metadata?.ipAddress,
          userAgent: metadata?.userAgent,
        },
        metadata
      );

      await this.commandBus.execute(signInCommand);

      const user = this.transformToGraphQLUser(userViewModel);

      // Generate tokens
      const accessToken = this.authService.signAccessToken({
        userId: user.id,
        username: user.username,
        role: user.role,
      }) as AccessToken;

      const refreshToken = this.authService.signRefreshToken({
        userId: user.id,
        username: user.username,
      }) as RefreshToken;

      // Store refresh token
      await this.storeRefreshToken(user.id as UserId, refreshToken);

      return ok({
        user,
        accessToken,
        refreshToken,
      });
    } catch (error) {
      console.error('SignIn failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'An unexpected error occurred during sign in',
        details: error,
      });
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: RefreshToken): Promise<Result<AuthResult, ServiceError>> {
    try {
      // Verify refresh token
      const payload = this.authService.verifyRefreshToken(refreshToken);

      if (!payload) {
        return err({
          code: 'UNAUTHORIZED',
          message: 'Invalid refresh token',
        });
      }

      // Get user
      const userResult = await this.queryBus.execute(
        createQuery.getUserById(payload.userId as UserId)
      );

      if (!isOk(userResult) || !userResult.data.data) {
        return err({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const userViewModel = userResult.data.data;

      // Check if user is active
      if (!userViewModel.isActive) {
        return err({
          code: 'FORBIDDEN',
          message: 'Account is deactivated',
        });
      }

      // Verify stored refresh token matches
      const storedToken = await this.getStoredRefreshToken(userViewModel.id as UserId);
      if (storedToken !== refreshToken) {
        return err({
          code: 'UNAUTHORIZED',
          message: 'Invalid refresh token',
        });
      }

      const user = this.transformToGraphQLUser(userViewModel);

      // Generate new tokens
      const newAccessToken = this.authService.signAccessToken({
        userId: user.id,
        username: user.username,
        role: user.role,
      }) as AccessToken;

      const newRefreshToken = this.authService.signRefreshToken({
        userId: user.id,
        username: user.username,
      }) as RefreshToken;

      // Store new refresh token
      await this.storeRefreshToken(user.id as UserId, newRefreshToken);

      return ok({
        user,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    } catch (error) {
      console.error('RefreshToken failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'An unexpected error occurred during token refresh',
        details: error,
      });
    }
  }

  /**
   * Sign out user
   */
  async signOut(userId: UserId): Promise<Result<boolean, ServiceError>> {
    try {
      // Record sign out
      const signOutCommand = createCommand.recordUserSignOut(userId as AggregateId, {});

      const commandResult = await this.commandBus.execute(signOutCommand);

      if (!isOk(commandResult)) {
        return err({
          code: 'INTERNAL',
          message: commandResult.error.message,
          details: commandResult.error.details,
        });
      }

      // Clear refresh token
      await this.clearRefreshToken(userId);

      return ok(true);
    } catch (error) {
      console.error('SignOut failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'An unexpected error occurred during sign out',
        details: error,
      });
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id: UserId): Promise<Result<GraphQLUser | null, ServiceError>> {
    try {
      const result = await this.queryBus.execute(createQuery.getUserById(id));

      if (!isOk(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      if (!result.data.data) {
        return ok(null);
      }

      return ok(this.transformToGraphQLUser(result.data.data));
    } catch (error) {
      console.error('GetUserById failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'An unexpected error occurred',
        details: error,
      });
    }
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: Username): Promise<Result<GraphQLUser | null, ServiceError>> {
    try {
      const result = await this.queryBus.execute(createQuery.getUserByUsername(username));

      if (!isOk(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      if (!result.data.data) {
        return ok(null);
      }

      return ok(this.transformToGraphQLUser(result.data.data));
    } catch (error) {
      console.error('GetUserByUsername failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'An unexpected error occurred',
        details: error,
      });
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: Email): Promise<Result<GraphQLUser | null, ServiceError>> {
    try {
      const result = await this.queryBus.execute(createQuery.getUserByEmail(email));

      if (!isOk(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      if (!result.data.data) {
        return ok(null);
      }

      return ok(this.transformToGraphQLUser(result.data.data));
    } catch (error) {
      console.error('GetUserByEmail failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'An unexpected error occurred',
        details: error,
      });
    }
  }

  /**
   * Get all users with filtering and pagination
   */
  async getAllUsers(
    filter?: UserFilter,
    pagination?: Pagination
  ): Promise<Result<PaginatedResult<GraphQLUser>, ServiceError>> {
    try {
      const result = await this.queryBus.execute(createQuery.getAllUsers({ filter, pagination }));

      if (!isOk(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      const paginatedResult = result.data.data;

      return ok({
        ...paginatedResult,
        items: paginatedResult.items.map((user) => this.transformToGraphQLUser(user)),
      });
    } catch (error) {
      console.error('GetAllUsers failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'An unexpected error occurred',
        details: error,
      });
    }
  }

  /**
   * Get users by IDs
   */
  async getUsersByIds(ids: UserId[]): Promise<Result<GraphQLUser[], ServiceError>> {
    try {
      const result = await this.queryBus.execute(createQuery.getUsersByIds(ids));

      if (!isOk(result)) {
        return err({
          code: 'INTERNAL',
          message: result.error.message,
          details: result.error.details,
        });
      }

      const users = result.data.data.map((user) => this.transformToGraphQLUser(user));

      return ok(users);
    } catch (error) {
      console.error('GetUsersByIds failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'An unexpected error occurred',
        details: error,
      });
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(
    userId: UserId,
    input: UpdateProfileInput,
    metadata?: CommandMetadata
  ): Promise<Result<GraphQLUser, ServiceError>> {
    try {
      const command = createCommand.updateUserProfile(userId as AggregateId, input, metadata);

      const commandResult = await this.commandBus.execute(command);

      if (!isOk(commandResult)) {
        return err({
          code: 'INTERNAL',
          message: commandResult.error.message,
          details: commandResult.error.details,
        });
      }

      // Get updated user
      const userResult = await this.getUserById(userId);

      if (!isOk(userResult) || !userResult.data) {
        return err({
          code: 'NOT_FOUND',
          message: 'User not found after update',
        });
      }

      return ok(userResult.data);
    } catch (error) {
      console.error('UpdateUserProfile failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'An unexpected error occurred',
        details: error,
      });
    }
  }

  /**
   * Update user (admin operation)
   */
  async updateUser(
    userId: UserId,
    input: UpdateUserInput,
    currentUserId: UserId,
    currentUserRole: UserRole,
    metadata?: CommandMetadata
  ): Promise<Result<GraphQLUser, ServiceError>> {
    try {
      // Check permissions
      if (currentUserRole !== 'ADMIN' && currentUserId !== userId) {
        return err({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        });
      }

      // Handle role change
      if (input.role && input.role !== undefined) {
        if (currentUserRole !== 'ADMIN') {
          return err({
            code: 'FORBIDDEN',
            message: 'Only admins can change user roles',
          });
        }

        const roleCommand = createCommand.changeUserRole(
          userId as AggregateId,
          {
            newRole: input.role,
            changedBy: currentUserId,
          },
          metadata
        );

        const roleResult = await this.commandBus.execute(roleCommand);

        if (!wrap(roleResult).isOk()) {
          return err({
            code: 'INTERNAL',
            message: roleerror.message,
            details: roleerror.details,
          });
        }
      }

      // Handle credentials update
      if (input.username || input.email) {
        const credentialsCommand = createCommand.updateUserCredentials(
          userId as AggregateId,
          {
            username: input.username,
            email: input.email,
          },
          metadata
        );

        const credentialsResult = await this.commandBus.execute(credentialsCommand);

        if (!wrap(credentialsResult).isOk()) {
          return err({
            code: 'INTERNAL',
            message: credentialserror.message,
            details: credentialserror.details,
          });
        }
      }

      // Handle profile update
      if (input.name !== undefined || input.phoneNumber !== undefined) {
        const profileCommand = createCommand.updateUserProfile(
          userId as AggregateId,
          {
            name: input.name,
            phoneNumber: input.phoneNumber,
          },
          metadata
        );

        const profileResult = await this.commandBus.execute(profileCommand);

        if (!wrap(profileResult).isOk()) {
          return err({
            code: 'INTERNAL',
            message: profileerror.message,
            details: profileerror.details,
          });
        }
      }

      // Get updated user
      const userResult = await this.getUserById(userId);

      if (!isOk(userResult) || !userResult.data) {
        return err({
          code: 'NOT_FOUND',
          message: 'User not found after update',
        });
      }

      return ok(userResult.data);
    } catch (error) {
      console.error('UpdateUser failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'An unexpected error occurred',
        details: error,
      });
    }
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: UserId,
    input: ChangePasswordInput,
    metadata?: CommandMetadata
  ): Promise<Result<boolean, ServiceError>> {
    try {
      // Get user to verify current password
      const userResult = await this.queryBus.execute(createQuery.getUserById(userId));

      if (!isOk(userResult) || !userResult.data.data) {
        return err({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Verify current password
      const isValidPassword = await this.authService.verifyPassword(
        input.currentPassword,
        userResult.data.data.password
      );

      if (!isValidPassword) {
        return err({
          code: 'UNAUTHORIZED',
          message: 'Current password is incorrect',
        });
      }

      // Hash new password
      const hashedPassword = await this.authService.hashPassword(input.newPassword);

      // Change password command
      const command = createCommand.changeUserPassword(
        userId as AggregateId,
        {
          currentPassword: input.currentPassword,
          newPassword: hashedPassword,
          changedBy: userId,
        },
        metadata
      );

      const commandResult = await this.commandBus.execute(command);

      if (!isOk(commandResult)) {
        return err({
          code: 'INTERNAL',
          message: commandResult.error.message,
          details: commandResult.error.details,
        });
      }

      // Clear refresh token to force re-authentication
      await this.clearRefreshToken(userId);

      return ok(true);
    } catch (error) {
      console.error('ChangePassword failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'An unexpected error occurred',
        details: error,
      });
    }
  }

  /**
   * Deactivate user
   */
  async deactivateUser(
    userId: UserId,
    reason: string,
    deactivatedBy: UserId,
    metadata?: CommandMetadata
  ): Promise<Result<GraphQLUser, ServiceError>> {
    try {
      const command = createCommand.deactivateUser(
        userId as AggregateId,
        {
          reason,
          deactivatedBy,
        },
        metadata
      );

      const commandResult = await this.commandBus.execute(command);

      if (!isOk(commandResult)) {
        return err({
          code: 'INTERNAL',
          message: commandResult.error.message,
          details: commandResult.error.details,
        });
      }

      // Clear refresh token
      await this.clearRefreshToken(userId);

      // Get updated user
      const userResult = await this.getUserById(userId);

      if (!isOk(userResult) || !userResult.data) {
        return err({
          code: 'NOT_FOUND',
          message: 'User not found after deactivation',
        });
      }

      return ok(userResult.data);
    } catch (error) {
      console.error('DeactivateUser failed:', error);
      return err({
        code: 'INTERNAL',
        message: 'An unexpected error occurred',
        details: error,
      });
    }
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

  /**
   * Store refresh token
   */
  private async storeRefreshToken(userId: UserId, refreshToken: RefreshToken): Promise<void> {
    if (this.cacheService) {
      await this.cacheService.set(
        `user:refresh:${userId}` as `${string}:${string}`,
        refreshToken,
        7 * 24 * 60 * 60 // 7 days
      );
    }
  }

  /**
   * Get stored refresh token
   */
  private async getStoredRefreshToken(userId: UserId): Promise<RefreshToken | null> {
    if (!this.cacheService) {
      return null;
    }

    return this.cacheService.get<RefreshToken>(`user:refresh:${userId}` as `${string}:${string}`);
  }

  /**
   * Clear refresh token
   */
  private async clearRefreshToken(userId: UserId): Promise<void> {
    if (this.cacheService) {
      await this.cacheService.delete(`user:refresh:${userId}` as `${string}:${string}`);
    }
  }
}
