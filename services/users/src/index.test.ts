import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { ApolloServer } from '@apollo/server';
import { buildSubgraphSchema } from '@apollo/subgraph';
import type { AuthService } from '@graphql-microservices/shared-auth';
import type { CacheService } from '@graphql-microservices/shared-cache';
import type { PubSubService } from '@graphql-microservices/shared-pubsub';
import DataLoader from 'dataloader';
import type { GraphQLSchema } from 'graphql';
import { graphql } from 'graphql';
import gql from 'graphql-tag';
import type { Context } from './index';
import type { PrismaClient, PrismaUser } from './types';

// Mock implementations
const mockPrisma = {
  user: {
    findUnique: mock(),
    findMany: mock(),
    create: mock(),
    update: mock(),
    delete: mock(),
    count: mock(),
  },
  $disconnect: mock(),
} as unknown as PrismaClient;

const mockCacheService = {
  get: mock(),
  set: mock(),
  delete: mock(),
  invalidatePattern: mock(),
  disconnect: mock(),
} as unknown as CacheService;

const mockAuthService = {
  hashPassword: mock(),
  verifyPassword: mock(),
  generateAccessToken: mock(),
  generateRefreshToken: mock(),
  verifyAccessToken: mock(),
  verifyRefreshToken: mock(),
  extractTokenFromHeader: mock(),
} as unknown as AuthService;

const mockPubSubService = {
  getPubSub: () => ({
    publish: mock(),
    subscribe: mock(),
    asyncIterator: mock(),
  }),
} as unknown as PubSubService;

import { resolvers } from './resolvers';
// Import the actual typeDefs and resolvers
import { typeDefs } from './schema';

describe('Users Service', () => {
  let server: ApolloServer;
  let schema: GraphQLSchema;
  let context: Context;

  beforeAll(() => {
    // Build the schema
    schema = buildSubgraphSchema([{ typeDefs, resolvers }]);
    server = new ApolloServer({ schema });
  });

  beforeEach(() => {
    // Reset all mocks
    Object.values(mockPrisma.user).forEach((fn) => {
      if (typeof fn === 'function' && 'mockReset' in fn) {
        (fn as { mockReset: () => void }).mockReset();
      }
    });
    Object.values(mockCacheService).forEach((fn) => {
      if (typeof fn === 'function' && 'mockReset' in fn) {
        (fn as { mockReset: () => void }).mockReset();
      }
    });
    Object.values(mockAuthService).forEach((fn) => {
      if (typeof fn === 'function' && 'mockReset' in fn) {
        (fn as { mockReset: () => void }).mockReset();
      }
    });

    // Create a fresh context for each test
    context = {
      prisma: mockPrisma,
      authService: mockAuthService,
      cacheService: mockCacheService,
      pubsub: mockPubSubService.getPubSub(),
      userLoader: new DataLoader<string, PrismaUser | null>(async (ids) => {
        const users = await mockPrisma.user.findMany({
          where: { id: { in: ids as string[] } },
        });
        return ids.map((id) => users.find((u: PrismaUser) => u.id === id) || null);
      }),
    };
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('Query resolvers', () => {
    describe('user', () => {
      const userQuery = gql`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            username
            email
            name
            role
            isActive
          }
        }
      `;

      it('should return cached user if available', async () => {
        const cachedUser = {
          id: '1',
          username: 'john_doe',
          email: 'john@example.com',
          name: 'John Doe',
          role: 'USER',
          isActive: true,
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: '2023-01-01T00:00:00.000Z',
        };

        mockCacheService.get.mockResolvedValueOnce(cachedUser);
        context.user = { userId: '1', email: 'john@example.com', role: 'USER' };

        const result = await graphql({
          schema,
          source: userQuery.loc?.source.body ?? '',
          variableValues: { id: '1' },
          contextValue: context,
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.user).toEqual(cachedUser);
        expect(mockCacheService.get).toHaveBeenCalledWith('user:1');
        expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
      });

      it('should fetch user from database if not cached', async () => {
        const dbUser: PrismaUser = {
          id: '1',
          username: 'john_doe',
          email: 'john@example.com',
          password: 'hashed_password',
          name: 'John Doe',
          phoneNumber: '+1234567890',
          role: 'USER',
          isActive: true,
          refreshToken: null,
          createdAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
        };

        mockCacheService.get.mockResolvedValueOnce(null);
        mockPrisma.user.findMany.mockResolvedValueOnce([dbUser]);
        mockCacheService.set.mockResolvedValueOnce(undefined);
        context.user = { userId: '1', email: 'john@example.com', role: 'USER' };

        const result = await graphql({
          schema,
          source: userQuery.loc?.source.body ?? '',
          variableValues: { id: '1' },
          contextValue: context,
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.user).toMatchObject({
          id: '1',
          username: 'john_doe',
          email: 'john@example.com',
          name: 'John Doe',
          role: 'USER',
          isActive: true,
        });
        expect(mockCacheService.set).toHaveBeenCalled();
      });

      it('should return null for non-existent user', async () => {
        mockCacheService.get.mockResolvedValueOnce(null);
        mockPrisma.user.findMany.mockResolvedValueOnce([]);
        context.user = { userId: '1', email: 'john@example.com', role: 'USER' };

        const result = await graphql({
          schema,
          source: userQuery.loc?.source.body ?? '',
          variableValues: { id: 'non-existent' },
          contextValue: context,
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.user).toBeNull();
      });

      it('should require authentication', async () => {
        const result = await graphql({
          schema,
          source: userQuery.loc?.source.body ?? '',
          variableValues: { id: '1' },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].message).toContain('Authentication required');
      });
    });

    describe('users', () => {
      const usersQuery = gql`
        query GetUsers {
          users {
            id
            username
            email
            role
          }
        }
      `;

      it('should return all users for admin', async () => {
        const users = [
          {
            id: '1',
            username: 'user1',
            email: 'user1@example.com',
            password: 'hash',
            name: 'User 1',
            phoneNumber: null,
            role: 'USER',
            isActive: true,
            refreshToken: null,
            createdAt: new Date('2023-01-01'),
            updatedAt: new Date('2023-01-01'),
          },
          {
            id: '2',
            username: 'user2',
            email: 'user2@example.com',
            password: 'hash',
            name: 'User 2',
            phoneNumber: null,
            role: 'USER',
            isActive: true,
            refreshToken: null,
            createdAt: new Date('2023-01-02'),
            updatedAt: new Date('2023-01-02'),
          },
        ];

        mockPrisma.user.findMany.mockResolvedValueOnce(users);
        context.user = { userId: '3', email: 'admin@example.com', role: 'ADMIN' };

        const result = await graphql({
          schema,
          source: usersQuery.loc?.source.body ?? '',
          contextValue: context,
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.users).toHaveLength(2);
        expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
          orderBy: { createdAt: 'desc' },
        });
      });

      it('should require admin role', async () => {
        context.user = { userId: '1', email: 'user@example.com', role: 'USER' };

        const result = await graphql({
          schema,
          source: usersQuery.loc?.source.body ?? '',
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].message).toContain('Insufficient permissions');
      });
    });

    describe('me', () => {
      const meQuery = gql`
        query GetMe {
          me {
            id
            username
            email
            name
          }
        }
      `;

      it('should return current user', async () => {
        const currentUser = {
          id: '1',
          username: 'current_user',
          email: 'current@example.com',
          password: 'hash',
          name: 'Current User',
          phoneNumber: null,
          role: 'USER',
          isActive: true,
          refreshToken: null,
          createdAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-01-01'),
        };

        mockPrisma.user.findMany.mockResolvedValueOnce([currentUser]);
        context.user = { userId: '1', email: 'current@example.com', role: 'USER' };

        const result = await graphql({
          schema,
          source: meQuery.loc?.source.body ?? '',
          contextValue: context,
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.me).toMatchObject({
          id: '1',
          username: 'current_user',
          email: 'current@example.com',
          name: 'Current User',
        });
      });

      it('should return null when not authenticated', async () => {
        const result = await graphql({
          schema,
          source: meQuery.loc?.source.body ?? '',
          contextValue: context,
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.me).toBeNull();
      });
    });
  });

  describe('Mutation resolvers', () => {
    describe('signUp', () => {
      const signUpMutation = gql`
        mutation SignUp($input: SignUpInput!) {
          signUp(input: $input) {
            user {
              id
              username
              email
              name
            }
            accessToken
            refreshToken
          }
        }
      `;

      it('should create a new user successfully', async () => {
        const input = {
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'StrongPass123!',
          name: 'New User',
          phoneNumber: '+1234567890',
        };

        const createdUser = {
          id: 'new-id',
          username: input.username,
          email: input.email,
          password: 'hashed_password',
          name: input.name,
          phoneNumber: input.phoneNumber,
          role: 'USER',
          isActive: true,
          refreshToken: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockAuthService.hashPassword.mockResolvedValueOnce('hashed_password');
        mockPrisma.user.create.mockResolvedValueOnce(createdUser);
        mockAuthService.generateAccessToken.mockReturnValueOnce('access_token');
        mockAuthService.generateRefreshToken.mockReturnValueOnce('refresh_token');
        mockPrisma.user.update.mockResolvedValueOnce({
          ...createdUser,
          refreshToken: 'refresh_token',
        });

        const result = await graphql({
          schema,
          source: signUpMutation.loc?.source.body ?? '',
          variableValues: { input },
          contextValue: context,
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.signUp).toMatchObject({
          user: {
            id: 'new-id',
            username: input.username,
            email: input.email,
            name: input.name,
          },
          accessToken: 'access_token',
          refreshToken: 'refresh_token',
        });
        expect(mockAuthService.hashPassword).toHaveBeenCalledWith(input.password);
        expect(context.pubsub.publish).toHaveBeenCalledWith('USER_CREATED', expect.any(Object));
      });

      it('should validate required fields', async () => {
        const input = {
          username: '',
          email: '',
          password: '',
          name: '',
        };

        const result = await graphql({
          schema,
          source: signUpMutation.loc?.source.body ?? '',
          variableValues: { input },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        const error = result.errors?.[0];
        expect(error?.extensions?.code).toBe('VALIDATION_ERROR');
        expect(error?.extensions?.validationErrors).toBeDefined();
      });

      it('should validate email format', async () => {
        const input = {
          username: 'newuser',
          email: 'invalid-email',
          password: 'StrongPass123!',
          name: 'New User',
        };

        const result = await graphql({
          schema,
          source: signUpMutation.loc?.source.body ?? '',
          variableValues: { input },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        const error = result.errors?.[0];
        expect(error?.extensions?.code).toBe('VALIDATION_ERROR');
        expect(error?.message).toContain('Invalid email format');
      });

      it('should validate password strength', async () => {
        const input = {
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'weak',
          name: 'New User',
        };

        const result = await graphql({
          schema,
          source: signUpMutation.loc?.source.body ?? '',
          variableValues: { input },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        const error = result.errors?.[0];
        expect(error?.extensions?.code).toBe('VALIDATION_ERROR');
        expect(error?.message).toContain('Password too weak');
      });

      it('should handle duplicate username', async () => {
        const input = {
          username: 'existing',
          email: 'new@example.com',
          password: 'StrongPass123!',
          name: 'New User',
        };

        mockAuthService.hashPassword.mockResolvedValueOnce('hashed_password');
        mockPrisma.user.create.mockRejectedValueOnce(
          new Error('Unique constraint failed on the fields: (`username`)')
        );

        const result = await graphql({
          schema,
          source: signUpMutation.loc?.source.body ?? '',
          variableValues: { input },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        const error = result.errors?.[0];
        expect(error?.extensions?.code).toBe('ALREADY_EXISTS');
        expect(error?.message).toContain("User with username 'existing' already exists");
      });

      it('should handle duplicate email', async () => {
        const input = {
          username: 'newuser',
          email: 'existing@example.com',
          password: 'StrongPass123!',
          name: 'New User',
        };

        mockAuthService.hashPassword.mockResolvedValueOnce('hashed_password');
        mockPrisma.user.create.mockRejectedValueOnce(
          new Error('Unique constraint failed on the fields: (`email`)')
        );

        const result = await graphql({
          schema,
          source: signUpMutation.loc?.source.body ?? '',
          variableValues: { input },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        const error = result.errors?.[0];
        expect(error?.extensions?.code).toBe('ALREADY_EXISTS');
        expect(error?.message).toContain("User with email 'existing@example.com' already exists");
      });
    });

    describe('signIn', () => {
      const signInMutation = gql`
        mutation SignIn($input: SignInInput!) {
          signIn(input: $input) {
            user {
              id
              username
              email
            }
            accessToken
            refreshToken
          }
        }
      `;

      it('should sign in successfully with valid credentials', async () => {
        const input = {
          username: 'john_doe',
          password: 'correct_password',
        };

        const user = {
          id: '1',
          username: 'john_doe',
          email: 'john@example.com',
          password: 'hashed_password',
          name: 'John Doe',
          phoneNumber: null,
          role: 'USER',
          isActive: true,
          refreshToken: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrisma.user.findUnique.mockResolvedValueOnce(user);
        mockAuthService.verifyPassword.mockResolvedValueOnce(true);
        mockAuthService.generateAccessToken.mockReturnValueOnce('access_token');
        mockAuthService.generateRefreshToken.mockReturnValueOnce('refresh_token');
        mockPrisma.user.update.mockResolvedValueOnce({
          ...user,
          refreshToken: 'refresh_token',
        });

        const result = await graphql({
          schema,
          source: signInMutation.loc?.source.body ?? '',
          variableValues: { input },
          contextValue: context,
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.signIn).toMatchObject({
          user: {
            id: '1',
            username: 'john_doe',
            email: 'john@example.com',
          },
          accessToken: 'access_token',
          refreshToken: 'refresh_token',
        });
      });

      it('should reject invalid username', async () => {
        const input = {
          username: 'non_existent',
          password: 'password',
        };

        mockPrisma.user.findUnique.mockResolvedValueOnce(null);

        const result = await graphql({
          schema,
          source: signInMutation.loc?.source.body ?? '',
          variableValues: { input },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].extensions?.code).toBe('UNAUTHENTICATED');
        expect(result.errors?.[0].message).toBe('Invalid credentials');
      });

      it('should reject invalid password', async () => {
        const input = {
          username: 'john_doe',
          password: 'wrong_password',
        };

        const user = {
          id: '1',
          username: 'john_doe',
          email: 'john@example.com',
          password: 'hashed_password',
          name: 'John Doe',
          phoneNumber: null,
          role: 'USER',
          isActive: true,
          refreshToken: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrisma.user.findUnique.mockResolvedValueOnce(user);
        mockAuthService.verifyPassword.mockResolvedValueOnce(false);

        const result = await graphql({
          schema,
          source: signInMutation.loc?.source.body ?? '',
          variableValues: { input },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].extensions?.code).toBe('UNAUTHENTICATED');
        expect(result.errors?.[0].message).toBe('Invalid credentials');
      });

      it('should reject deactivated account', async () => {
        const input = {
          username: 'john_doe',
          password: 'correct_password',
        };

        const user = {
          id: '1',
          username: 'john_doe',
          email: 'john@example.com',
          password: 'hashed_password',
          name: 'John Doe',
          phoneNumber: null,
          role: 'USER',
          isActive: false,
          refreshToken: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrisma.user.findUnique.mockResolvedValueOnce(user);
        mockAuthService.verifyPassword.mockResolvedValueOnce(true);

        const result = await graphql({
          schema,
          source: signInMutation.loc?.source.body ?? '',
          variableValues: { input },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].extensions?.code).toBe('BUSINESS_RULE_VIOLATION');
        expect(result.errors?.[0].message).toBe('Account is deactivated');
      });
    });

    describe('updateUser', () => {
      const updateUserMutation = gql`
        mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
          updateUser(id: $id, input: $input) {
            id
            username
            email
            name
            role
          }
        }
      `;

      it('should allow admin to update any user', async () => {
        const input = {
          name: 'Updated Name',
          role: 'MODERATOR',
        };

        const existingUser = {
          id: '2',
          username: 'user2',
          email: 'user2@example.com',
          password: 'hash',
          name: 'Old Name',
          phoneNumber: null,
          role: 'USER',
          isActive: true,
          refreshToken: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const updatedUser = {
          ...existingUser,
          name: input.name,
          role: input.role,
          updatedAt: new Date(),
        };

        context.user = { userId: '1', email: 'admin@example.com', role: 'ADMIN' };
        mockPrisma.user.findUnique.mockResolvedValueOnce(existingUser);
        mockPrisma.user.update.mockResolvedValueOnce(updatedUser);
        mockCacheService.delete.mockResolvedValue(undefined);

        const result = await graphql({
          schema,
          source: updateUserMutation.loc?.source.body ?? '',
          variableValues: { id: '2', input },
          contextValue: context,
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.updateUser).toMatchObject({
          id: '2',
          name: 'Updated Name',
          role: 'MODERATOR',
        });
        expect(context.pubsub.publish).toHaveBeenCalledWith('USER_UPDATED', expect.any(Object));
      });

      it('should allow users to update their own profile', async () => {
        const input = {
          name: 'My New Name',
        };

        const existingUser = {
          id: '1',
          username: 'user1',
          email: 'user1@example.com',
          password: 'hash',
          name: 'Old Name',
          phoneNumber: null,
          role: 'USER',
          isActive: true,
          refreshToken: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const updatedUser = {
          ...existingUser,
          name: input.name,
          updatedAt: new Date(),
        };

        context.user = { userId: '1', email: 'user1@example.com', role: 'USER' };
        mockPrisma.user.findUnique.mockResolvedValueOnce(existingUser);
        mockPrisma.user.update.mockResolvedValueOnce(updatedUser);
        mockCacheService.delete.mockResolvedValue(undefined);

        const result = await graphql({
          schema,
          source: updateUserMutation.loc?.source.body ?? '',
          variableValues: { id: '1', input },
          contextValue: context,
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.updateUser).toMatchObject({
          id: '1',
          name: 'My New Name',
        });
      });

      it('should prevent users from updating other users', async () => {
        const input = {
          name: 'Hacked Name',
        };

        const existingUser = {
          id: '2',
          username: 'user2',
          email: 'user2@example.com',
          password: 'hash',
          name: 'Original Name',
          phoneNumber: null,
          role: 'USER',
          isActive: true,
          refreshToken: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        context.user = { userId: '1', email: 'user1@example.com', role: 'USER' };
        mockPrisma.user.findUnique.mockResolvedValueOnce(existingUser);

        const result = await graphql({
          schema,
          source: updateUserMutation.loc?.source.body ?? '',
          variableValues: { id: '2', input },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].extensions?.code).toBe('UNAUTHORIZED');
        expect(result.errors?.[0].message).toBe('You can only update your own profile');
      });

      it('should validate email format when updating', async () => {
        const input = {
          email: 'invalid-email',
        };

        const existingUser = {
          id: '1',
          username: 'user1',
          email: 'user1@example.com',
          password: 'hash',
          name: 'User 1',
          phoneNumber: null,
          role: 'USER',
          isActive: true,
          refreshToken: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        context.user = { userId: '1', email: 'user1@example.com', role: 'USER' };
        mockPrisma.user.findUnique.mockResolvedValueOnce(existingUser);

        const result = await graphql({
          schema,
          source: updateUserMutation.loc?.source.body ?? '',
          variableValues: { id: '1', input },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].extensions?.code).toBe('VALIDATION_ERROR');
        expect(result.errors?.[0].message).toContain('Invalid email format');
      });

      it('should handle non-existent user', async () => {
        const input = {
          name: 'New Name',
        };

        context.user = { userId: '1', email: 'admin@example.com', role: 'ADMIN' };
        mockPrisma.user.findUnique.mockResolvedValueOnce(null);

        const result = await graphql({
          schema,
          source: updateUserMutation.loc?.source.body ?? '',
          variableValues: { id: 'non-existent', input },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].extensions?.code).toBe('NOT_FOUND');
        expect(result.errors?.[0].message).toContain(
          "User with identifier 'non-existent' not found"
        );
      });

      it('should handle unique constraint violations', async () => {
        const input = {
          username: 'taken_username',
        };

        const existingUser = {
          id: '1',
          username: 'user1',
          email: 'user1@example.com',
          password: 'hash',
          name: 'User 1',
          phoneNumber: null,
          role: 'USER',
          isActive: true,
          refreshToken: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        context.user = { userId: '1', email: 'user1@example.com', role: 'USER' };
        mockPrisma.user.findUnique.mockResolvedValueOnce(existingUser);
        mockPrisma.user.update.mockRejectedValueOnce(
          new Error('Unique constraint failed on the fields: (`username`)')
        );

        const result = await graphql({
          schema,
          source: updateUserMutation.loc?.source.body ?? '',
          variableValues: { id: '1', input },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].extensions?.code).toBe('ALREADY_EXISTS');
        expect(result.errors?.[0].message).toContain(
          "User with username 'taken_username' already exists"
        );
      });
    });

    describe('changePassword', () => {
      const changePasswordMutation = gql`
        mutation ChangePassword($input: ChangePasswordInput!) {
          changePassword(input: $input)
        }
      `;

      it('should change password successfully', async () => {
        const input = {
          currentPassword: 'old_password',
          newPassword: 'NewStrongPass123!',
        };

        const user = {
          id: '1',
          username: 'user1',
          email: 'user1@example.com',
          password: 'old_hashed_password',
          name: 'User 1',
          phoneNumber: null,
          role: 'USER',
          isActive: true,
          refreshToken: 'old_refresh_token',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        context.user = { userId: '1', email: 'user1@example.com', role: 'USER' };
        mockPrisma.user.findUnique.mockResolvedValueOnce(user);
        mockAuthService.verifyPassword.mockResolvedValueOnce(true);
        mockAuthService.hashPassword.mockResolvedValueOnce('new_hashed_password');
        mockPrisma.user.update.mockResolvedValueOnce({
          ...user,
          password: 'new_hashed_password',
          refreshToken: null,
        });

        const result = await graphql({
          schema,
          source: changePasswordMutation.loc?.source.body ?? '',
          variableValues: { input },
          contextValue: context,
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.changePassword).toBe(true);
        expect(mockPrisma.user.update).toHaveBeenCalledWith({
          where: { id: '1' },
          data: { password: 'new_hashed_password', refreshToken: null },
        });
      });

      it('should reject incorrect current password', async () => {
        const input = {
          currentPassword: 'wrong_password',
          newPassword: 'NewStrongPass123!',
        };

        const user = {
          id: '1',
          username: 'user1',
          email: 'user1@example.com',
          password: 'hashed_password',
          name: 'User 1',
          phoneNumber: null,
          role: 'USER',
          isActive: true,
          refreshToken: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        context.user = { userId: '1', email: 'user1@example.com', role: 'USER' };
        mockPrisma.user.findUnique.mockResolvedValueOnce(user);
        mockAuthService.verifyPassword.mockResolvedValueOnce(false);

        const result = await graphql({
          schema,
          source: changePasswordMutation.loc?.source.body ?? '',
          variableValues: { input },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].extensions?.code).toBe('VALIDATION_ERROR');
        expect(result.errors?.[0].message).toContain('Invalid current password');
      });

      it('should require authentication', async () => {
        const input = {
          currentPassword: 'old_password',
          newPassword: 'NewStrongPass123!',
        };

        const result = await graphql({
          schema,
          source: changePasswordMutation.loc?.source.body ?? '',
          variableValues: { input },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].message).toContain('Authentication required');
      });
    });

    describe('deactivateUser', () => {
      const deactivateUserMutation = gql`
        mutation DeactivateUser($id: ID!) {
          deactivateUser(id: $id) {
            id
            isActive
          }
        }
      `;

      it('should deactivate user successfully as admin', async () => {
        const targetUser = {
          id: '2',
          username: 'user2',
          email: 'user2@example.com',
          password: 'hash',
          name: 'User 2',
          phoneNumber: null,
          role: 'USER',
          isActive: true,
          refreshToken: 'some_token',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const deactivatedUser = {
          ...targetUser,
          isActive: false,
          refreshToken: null,
        };

        context.user = { userId: '1', email: 'admin@example.com', role: 'ADMIN' };
        mockPrisma.user.findUnique.mockResolvedValueOnce(targetUser);
        mockPrisma.user.update.mockResolvedValueOnce(deactivatedUser);
        mockCacheService.delete.mockResolvedValue(undefined);

        const result = await graphql({
          schema,
          source: deactivateUserMutation.loc?.source.body ?? '',
          variableValues: { id: '2' },
          contextValue: context,
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.deactivateUser).toMatchObject({
          id: '2',
          isActive: false,
        });
        expect(context.pubsub.publish).toHaveBeenCalledWith('USER_DEACTIVATED', expect.any(Object));
      });

      it('should prevent non-admins from deactivating users', async () => {
        context.user = { userId: '1', email: 'user@example.com', role: 'USER' };

        const result = await graphql({
          schema,
          source: deactivateUserMutation.loc?.source.body ?? '',
          variableValues: { id: '2' },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].extensions?.code).toBe('UNAUTHORIZED');
        expect(result.errors?.[0].message).toBe('Only administrators can deactivate users');
      });

      it('should prevent admin from deactivating themselves', async () => {
        const adminUser = {
          id: '1',
          username: 'admin',
          email: 'admin@example.com',
          password: 'hash',
          name: 'Admin',
          phoneNumber: null,
          role: 'ADMIN',
          isActive: true,
          refreshToken: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        context.user = { userId: '1', email: 'admin@example.com', role: 'ADMIN' };
        mockPrisma.user.findUnique.mockResolvedValueOnce(adminUser);

        const result = await graphql({
          schema,
          source: deactivateUserMutation.loc?.source.body ?? '',
          variableValues: { id: '1' },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].extensions?.code).toBe('BUSINESS_RULE_VIOLATION');
        expect(result.errors?.[0].message).toBe('You cannot deactivate your own account');
      });

      it('should handle non-existent user', async () => {
        context.user = { userId: '1', email: 'admin@example.com', role: 'ADMIN' };
        mockPrisma.user.findUnique.mockResolvedValueOnce(null);

        const result = await graphql({
          schema,
          source: deactivateUserMutation.loc?.source.body ?? '',
          variableValues: { id: 'non-existent' },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].extensions?.code).toBe('NOT_FOUND');
        expect(result.errors?.[0].message).toContain(
          "User with identifier 'non-existent' not found"
        );
      });
    });

    describe('refreshToken', () => {
      const refreshTokenMutation = gql`
        mutation RefreshToken($refreshToken: String!) {
          refreshToken(refreshToken: $refreshToken) {
            user {
              id
              username
            }
            accessToken
            refreshToken
          }
        }
      `;

      it('should refresh tokens successfully', async () => {
        const user = {
          id: '1',
          username: 'user1',
          email: 'user1@example.com',
          password: 'hash',
          name: 'User 1',
          phoneNumber: null,
          role: 'USER',
          isActive: true,
          refreshToken: 'valid_refresh_token',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockAuthService.verifyRefreshToken.mockReturnValueOnce({
          userId: '1',
          tokenId: '1',
        });
        mockPrisma.user.findUnique.mockResolvedValueOnce(user);
        mockAuthService.generateAccessToken.mockReturnValueOnce('new_access_token');
        mockAuthService.generateRefreshToken.mockReturnValueOnce('new_refresh_token');
        mockPrisma.user.update.mockResolvedValueOnce({
          ...user,
          refreshToken: 'new_refresh_token',
        });

        const result = await graphql({
          schema,
          source: refreshTokenMutation.loc?.source.body ?? '',
          variableValues: { refreshToken: 'valid_refresh_token' },
          contextValue: context,
        });

        expect(result.errors).toBeUndefined();
        expect(result.data?.refreshToken).toMatchObject({
          user: {
            id: '1',
            username: 'user1',
          },
          accessToken: 'new_access_token',
          refreshToken: 'new_refresh_token',
        });
      });

      it('should reject invalid refresh token', async () => {
        mockAuthService.verifyRefreshToken.mockImplementationOnce(() => {
          throw new Error('Invalid token');
        });

        const result = await graphql({
          schema,
          source: refreshTokenMutation.loc?.source.body ?? '',
          variableValues: { refreshToken: 'invalid_token' },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].extensions?.code).toBe('UNAUTHENTICATED');
        expect(result.errors?.[0].message).toBe('Invalid refresh token');
      });

      it('should reject mismatched refresh token', async () => {
        const user = {
          id: '1',
          username: 'user1',
          email: 'user1@example.com',
          password: 'hash',
          name: 'User 1',
          phoneNumber: null,
          role: 'USER',
          isActive: true,
          refreshToken: 'different_token',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockAuthService.verifyRefreshToken.mockReturnValueOnce({
          userId: '1',
          tokenId: '1',
        });
        mockPrisma.user.findUnique.mockResolvedValueOnce(user);

        const result = await graphql({
          schema,
          source: refreshTokenMutation.loc?.source.body ?? '',
          variableValues: { refreshToken: 'some_other_token' },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].extensions?.code).toBe('UNAUTHENTICATED');
        expect(result.errors?.[0].message).toBe('Invalid refresh token');
      });

      it('should reject refresh for deactivated account', async () => {
        const user = {
          id: '1',
          username: 'user1',
          email: 'user1@example.com',
          password: 'hash',
          name: 'User 1',
          phoneNumber: null,
          role: 'USER',
          isActive: false,
          refreshToken: 'valid_refresh_token',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockAuthService.verifyRefreshToken.mockReturnValueOnce({
          userId: '1',
          tokenId: '1',
        });
        mockPrisma.user.findUnique.mockResolvedValueOnce(user);

        const result = await graphql({
          schema,
          source: refreshTokenMutation.loc?.source.body ?? '',
          variableValues: { refreshToken: 'valid_refresh_token' },
          contextValue: context,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors?.[0].extensions?.code).toBe('BUSINESS_RULE_VIOLATION');
        expect(result.errors?.[0].message).toBe('Account is deactivated');
      });
    });
  });

  describe('Federation resolvers', () => {
    it('should resolve user by id for federation', async () => {
      const user = {
        id: '1',
        username: 'federated_user',
        email: 'federated@example.com',
        password: 'hash',
        name: 'Federated User',
        phoneNumber: null,
        role: 'USER',
        isActive: true,
        refreshToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.findMany.mockResolvedValueOnce([user]);

      const result = await resolvers.User.__resolveReference({ id: '1' }, context);

      expect(result).toMatchObject({
        id: '1',
        username: 'federated_user',
        email: 'federated@example.com',
        name: 'Federated User',
      });
    });
  });

  describe('Error handling', () => {
    it('should format errors correctly', async () => {
      const signInMutation = gql`
        mutation SignIn($input: SignInInput!) {
          signIn(input: $input) {
            user {
              id
            }
            accessToken
          }
        }
      `;

      mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('Database connection failed'));

      const result = await graphql({
        schema,
        source: signInMutation.loc?.source.body ?? '',
        variableValues: {
          input: { username: 'test', password: 'test' },
        },
        contextValue: context,
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].extensions?.timestamp).toBeDefined();
      expect(result.errors?.[0].extensions?.service).toBe('users-service');
    });
  });
});
