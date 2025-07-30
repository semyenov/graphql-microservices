import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { AuthService, authDirective, type JWTPayload } from '@graphql-microservices/shared-auth';
import { CacheService, cacheKeys, cacheTTL } from '@graphql-microservices/shared-cache';
import { parseEnv, userServiceEnvSchema } from '@graphql-microservices/shared-config';
import {
  AlreadyExistsError,
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError,
  createErrorLogger,
  formatError,
  InternalServerError,
  NotFoundError,
  ValidationError,
} from '@graphql-microservices/shared-errors';
import { PubSubService } from '@graphql-microservices/shared-pubsub';
import DataLoader from 'dataloader';
import { GraphQLError } from 'graphql';
import gql from 'graphql-tag';
import type {
  Resolvers as GraphQLResolvers,
  Role as GraphQLRole,
  User as GraphQLUser,
} from '../generated/graphql';
import { type Prisma, PrismaClient, type User as PrismaUser } from '../generated/prisma';
import {
  publishUserCreated,
  publishUserDeactivated,
  publishUserUpdated,
  subscriptionResolvers,
} from './subscriptions';

// Parse and validate environment variables
const env = parseEnv(userServiceEnvSchema);

// Initialize services
const prisma = new PrismaClient();

// Load JWT key pairs from environment or use generated ones for development
const jwtKeyPair = AuthService.loadKeyPairFromEnv(
  'JWT_ACCESS_PRIVATE_KEY',
  'JWT_ACCESS_PUBLIC_KEY'
);
const refreshKeyPair = AuthService.loadKeyPairFromEnv(
  'JWT_REFRESH_PRIVATE_KEY',
  'JWT_REFRESH_PUBLIC_KEY'
);

const authService = new AuthService(jwtKeyPair, refreshKeyPair, {
  algorithm: 'RS256' as const,
  expiresIn: env.JWT_EXPIRES_IN,
});

const cacheService = new CacheService(env.REDIS_URL as string);
const pubSubService = new PubSubService({ redisUrl: env.REDIS_URL });
const pubsub = pubSubService.getPubSub();

// Create error logger for this service
const logError = createErrorLogger('users-service');

// GraphQL schema
const typeDefs = gql`
  extend schema @link(
    url: "https://specs.apollo.dev/federation/v2.0", 
    import: ["@key", "@shareable"]
  )

  ${authDirective}

  type User @key(fields: "id") {
    id: ID!
    username: String!
    email: String!
    name: String!
    phoneNumber: String
    role: Role!
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type AuthPayload {
    user: User!
    accessToken: String!
    refreshToken: String!
  }

  enum Role {
    USER
    ADMIN
    MODERATOR
  }

  type Query {
    user(id: ID!): User @auth
    users: [User!]! @auth(requires: ADMIN)
    me: User @auth
    userByUsername(username: String!): User @auth
    userByEmail(email: String!): User @auth(requires: ADMIN)
  }

  type Mutation {
    signUp(input: SignUpInput!): AuthPayload! @public
    signIn(input: SignInInput!): AuthPayload! @public
    refreshToken(refreshToken: String!): AuthPayload! @public
    signOut: Boolean! @auth
    updateUser(id: ID!, input: UpdateUserInput!): User! @auth
    updateProfile(input: UpdateProfileInput!): User! @auth
    changePassword(input: ChangePasswordInput!): Boolean! @auth
    deactivateUser(id: ID!): User! @auth(requires: ADMIN)
  }

  input SignUpInput {
    username: String!
    email: String!
    password: String!
    name: String!
    phoneNumber: String
  }

  input SignInInput {
    username: String!
    password: String!
  }

  input UpdateUserInput {
    username: String
    email: String
    name: String
    phoneNumber: String
    role: Role
  }

  input UpdateProfileInput {
    name: String
    phoneNumber: String
  }

  input ChangePasswordInput {
    currentPassword: String!
    newPassword: String!
  }

  type Subscription {
    userCreated: User! @auth(requires: ADMIN)
    userUpdated(userId: ID): User! @auth
    userDeactivated: User! @auth(requires: ADMIN)
  }
`;

// Helper function to transform Prisma user to GraphQL format
const transformUser = (user: PrismaUser): GraphQLUser => ({
  id: user.id,
  username: user.username,
  email: user.email,
  name: user.name,
  phoneNumber: user.phoneNumber,
  role: user.role as GraphQLRole,
  isActive: user.isActive,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
});

// DataLoader for batch loading users
const createUserLoader = () =>
  new DataLoader<string, GraphQLUser | null>(async (ids) => {
    const users = await prisma.user.findMany({
      where: { id: { in: ids as string[] } },
    });
    const userMap = new Map(users.map((user) => [user.id, transformUser(user)]));
    return ids.map((id) => userMap.get(id) || null);
  });

// Context type
export interface Context {
  prisma: PrismaClient;
  authService: AuthService;
  cacheService: CacheService;
  pubsub: typeof pubsub;
  userLoader: DataLoader<string, GraphQLUser | null>;
  user?: JWTPayload;
}

// Resolvers
const resolvers: GraphQLResolvers<Context> = {
  Query: {
    user: async (_, { id }, context) => {
      // Check cache first
      const cached = await context.cacheService.get<GraphQLUser>(cacheKeys.user(id));
      if (cached) return cached;

      // Load from database
      const user = await context.userLoader.load(id);

      // Cache the result
      if (user) {
        await context.cacheService.set(cacheKeys.user(id), user, cacheTTL.user);
      }

      return user;
    },

    users: async (_, __, context) => {
      const users = await context.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return users.map((user) => transformUser(user));
    },

    me: async (_, __, context) => {
      if (!context.user) return null;
      return context.userLoader.load(context.user.userId);
    },

    userByUsername: async (_, { username }, context) => {
      const cached = await context.cacheService.get<GraphQLUser>(
        cacheKeys.userByUsername(username)
      );
      if (cached) return cached;

      const user = await context.prisma.user.findUnique({ where: { username } });

      if (user) {
        const transformedUser = transformUser(user);
        await context.cacheService.set(
          cacheKeys.userByUsername(username),
          transformedUser,
          cacheTTL.user
        );
        return transformedUser;
      }

      return null;
    },

    userByEmail: async (_, { email }, context) => {
      const cached = await context.cacheService.get<GraphQLUser>(cacheKeys.userByEmail(email));
      if (cached) return cached;

      const user = await context.prisma.user.findUnique({ where: { email } });

      if (user) {
        const transformedUser = transformUser(user);
        await context.cacheService.set(
          cacheKeys.userByEmail(email),
          transformedUser,
          cacheTTL.user
        );
        return transformedUser;
      }

      return null;
    },
  },

  Mutation: {
    signUp: async (_, { input }, context) => {
      try {
        // Validate input
        if (!input.email || !input.username || !input.password || !input.name) {
          throw new ValidationError(
            'Missing required fields',
            [
              input.email && { field: 'email', message: 'Email is required' },
              input.username && { field: 'username', message: 'Username is required' },
              input.password && { field: 'password', message: 'Password is required' },
              input.name && { field: 'name', message: 'Name is required' },
            ].filter(Boolean)
          );
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(input.email)) {
          throw new ValidationError('Invalid email format', [
            { field: 'email', message: 'Please provide a valid email address' },
          ]);
        }

        // Validate password strength
        if (input.password.length < 8) {
          throw new ValidationError('Password too weak', [
            { field: 'password', message: 'Password must be at least 8 characters long' },
          ]);
        }

        const hashedPassword = await context.authService.hashPassword(input.password);

        const user = await context.prisma.user.create({
          data: {
            username: input.username,
            email: input.email,
            password: hashedPassword,
            name: input.name,
            phoneNumber: input.phoneNumber || null,
          },
        });

        const accessToken = context.authService.generateAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role,
        });

        const refreshToken = context.authService.generateRefreshToken({
          userId: user.id,
          tokenId: user.id, // In production, use a separate token ID
        });

        // Update user with refresh token
        await context.prisma.user.update({
          where: { id: user.id },
          data: { refreshToken },
        });

        const transformedUser = transformUser(user);

        // Publish event
        await publishUserCreated(context, transformedUser);

        return {
          user: transformedUser,
          accessToken,
          refreshToken,
        };
      } catch (error) {
        // Handle Prisma unique constraint errors
        if (error instanceof Error && error.message.includes('Unique constraint failed')) {
          if (error.message.includes('username')) {
            throw new AlreadyExistsError('User', 'username', input.username);
          }
          if (error.message.includes('email')) {
            throw new AlreadyExistsError('User', 'email', input.email);
          }
        }

        // Re-throw GraphQL errors
        if (error instanceof GraphQLError) {
          throw error;
        }

        // Log and throw generic error for unexpected issues
        logError(error, { operation: 'signUp', userId: 'anonymous' });
        throw new InternalServerError('Failed to create user account');
      }
    },

    signIn: async (_, { input }, context) => {
      const user = await context.prisma.user.findUnique({
        where: { username: input.username },
      });

      if (!user || !(await context.authService.verifyPassword(input.password, user.password))) {
        throw new AuthenticationError('Invalid credentials');
      }

      if (!user.isActive) {
        throw new BusinessRuleError('Account is deactivated');
      }

      const accessToken = context.authService.generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const refreshToken = context.authService.generateRefreshToken({
        userId: user.id,
        tokenId: user.id,
      });

      // Update user with refresh token
      await context.prisma.user.update({
        where: { id: user.id },
        data: { refreshToken },
      });

      return { user: transformUser(user), accessToken, refreshToken };
    },

    refreshToken: async (_, { refreshToken }, context) => {
      try {
        const payload = context.authService.verifyRefreshToken(refreshToken);

        const user = await context.prisma.user.findUnique({
          where: { id: payload.userId },
        });

        if (!user || user.refreshToken !== refreshToken) {
          throw new AuthenticationError('Invalid refresh token');
        }

        if (!user.isActive) {
          throw new BusinessRuleError('Account is deactivated');
        }

        const newAccessToken = context.authService.generateAccessToken({
          userId: user.id,
          email: user.email,
          role: user.role,
        });

        const newRefreshToken = context.authService.generateRefreshToken({
          userId: user.id,
          tokenId: user.id,
        });

        await context.prisma.user.update({
          where: { id: user.id },
          data: { refreshToken: newRefreshToken },
        });

        return {
          user: transformUser(user),
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        };
      } catch (error) {
        // Re-throw GraphQL errors
        if (error instanceof AuthenticationError || error instanceof BusinessRuleError) {
          throw error;
        }
        // Log and convert other errors
        logError(error, { operation: 'refreshToken' });
        throw new AuthenticationError('Invalid refresh token');
      }
    },

    signOut: async (_, __, context) => {
      if (context.user) {
        await context.prisma.user.update({
          where: { id: context.user.userId },
          data: { refreshToken: null },
        });

        // Invalidate cache
        await context.cacheService.delete(cacheKeys.user(context.user.userId));
      }
      return true;
    },

    updateUser: async (_, { id, input }, context) => {
      if (!context.user) throw new AuthenticationError();

      try {
        // Check if user exists
        const existingUser = await context.prisma.user.findUnique({ where: { id } });
        if (!existingUser) {
          throw new NotFoundError('User', id);
        }

        // Authorization check - only admins or the user themselves can update
        if (context.user.role !== 'ADMIN' && context.user.userId !== id) {
          throw new AuthorizationError('You can only update your own profile');
        }

        // Validate email if provided
        if (input.email) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(input.email)) {
            throw new ValidationError('Invalid email format', [
              { field: 'email', message: 'Please provide a valid email address' },
            ]);
          }
        }

        // Convert InputMaybe fields to Prisma-compatible format
        const updateData: Prisma.UserUpdateInput = {};
        if (input.username !== undefined && input.username !== null)
          updateData.username = input.username;
        if (input.email !== undefined && input.email !== null) updateData.email = input.email;
        if (input.name !== undefined && input.name !== null) updateData.name = input.name;
        if (input.phoneNumber !== undefined) updateData.phoneNumber = input.phoneNumber;
        if (input.role !== undefined && input.role !== null) updateData.role = input.role;

        const user = await context.prisma.user.update({
          where: { id },
          data: updateData,
        });

        // Invalidate cache
        await context.cacheService.delete(cacheKeys.user(id));
        if (user.username) {
          await context.cacheService.delete(cacheKeys.userByUsername(user.username));
        }
        if (user.email) {
          await context.cacheService.delete(cacheKeys.userByEmail(user.email));
        }

        const transformedUser = transformUser(user);

        // Publish event
        await publishUserUpdated(context, transformedUser);

        return transformedUser;
      } catch (error) {
        // Handle Prisma unique constraint errors
        if (error instanceof Error && error.message.includes('Unique constraint failed')) {
          if (error.message.includes('username')) {
            throw new AlreadyExistsError('User', 'username', input.username || undefined);
          }
          if (error.message.includes('email')) {
            throw new AlreadyExistsError('User', 'email', input.email || undefined);
          }
        }

        // Re-throw GraphQL errors
        if (error instanceof GraphQLError) {
          throw error;
        }

        // Log and throw generic error
        logError(error, { operation: 'updateUser', userId: context.user?.userId });
        throw new InternalServerError('Failed to update user');
      }
    },

    updateProfile: async (_, { input }, context) => {
      if (!context.user) throw new AuthenticationError();

      // Convert InputMaybe fields to Prisma-compatible format
      const updateData: Prisma.UserUpdateInput = {};
      if (input.name !== undefined && input.name !== null) updateData.name = input.name;
      if (input.phoneNumber !== undefined) updateData.phoneNumber = input.phoneNumber;

      const user = await context.prisma.user.update({
        where: { id: context.user.userId },
        data: updateData,
      });

      // Invalidate cache
      await context.cacheService.delete(cacheKeys.user(context.user.userId));

      const transformedUser = transformUser(user);

      // Publish event
      await publishUserUpdated(context, transformedUser);

      return transformedUser;
    },

    changePassword: async (_, { input }, context) => {
      if (!context.user) throw new AuthenticationError();

      const user = await context.prisma.user.findUnique({
        where: { id: context.user.userId },
      });

      if (!user) {
        throw new NotFoundError('User', context.user.userId);
      }

      if (!(await context.authService.verifyPassword(input.currentPassword, user.password))) {
        throw new ValidationError('Invalid current password', [
          { field: 'currentPassword', message: 'Current password is incorrect' },
        ]);
      }

      const hashedPassword = await context.authService.hashPassword(input.newPassword);

      await context.prisma.user.update({
        where: { id: context.user.userId },
        data: { password: hashedPassword, refreshToken: null },
      });

      return true;
    },

    deactivateUser: async (_, { id }, context) => {
      if (!context.user) throw new AuthenticationError();

      // Only admins can deactivate users
      if (context.user.role !== 'ADMIN') {
        throw new AuthorizationError('Only administrators can deactivate users');
      }

      try {
        // Check if user exists
        const existingUser = await context.prisma.user.findUnique({ where: { id } });
        if (!existingUser) {
          throw new NotFoundError('User', id);
        }

        // Prevent deactivating self
        if (context.user.userId === id) {
          throw new BusinessRuleError('You cannot deactivate your own account');
        }

        const user = await context.prisma.user.update({
          where: { id },
          data: { isActive: false, refreshToken: null },
        });

        // Invalidate cache
        await context.cacheService.delete(cacheKeys.user(id));

        const transformedUser = transformUser(user);

        // Publish event
        await publishUserDeactivated(context, transformedUser);

        return transformedUser;
      } catch (error) {
        // Re-throw GraphQL errors
        if (error instanceof GraphQLError) {
          throw error;
        }

        // Log and throw generic error
        logError(error, { operation: 'deactivateUser', userId: context.user?.userId });
        throw new InternalServerError('Failed to deactivate user');
      }
    },
  },

  User: {
    __resolveReference: async (user: { id: string }, context: Context) => {
      return context.userLoader.load(user.id);
    },
  } as GraphQLResolvers<Context>['User'],

  ...subscriptionResolvers,
};

// Create Apollo Server with error formatting
const server = new ApolloServer({
  schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
  formatError: ({ message, locations, path, extensions }) =>
    formatError(
      { message, locations, path, extensions } as GraphQLError,
      env.NODE_ENV === 'development',
      'users-service'
    ),
});

// Start server
const { url } = await startStandaloneServer(server, {
  listen: { port: env.PORT },
  context: async ({ req }) => {
    const userLoader = createUserLoader();

    // Extract user from authorization header
    const token = authService.extractTokenFromHeader(req.headers.authorization);
    let user: JWTPayload | null = null;

    if (token) {
      try {
        user = authService.verifyAccessToken(token);
      } catch (error) {
        // Don't log auth failures as errors, they're expected
        if (env.NODE_ENV === 'development') {
          console.debug('Token verification failed:', error);
        }
      }
    }

    return {
      prisma,
      authService,
      cacheService,
      userLoader,
      user,
      pubsub,
    };
  },
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down Users service...');
  await prisma.$disconnect();
  await cacheService.disconnect();
  process.exit(0);
});

console.log(`🚀 Users service ready at ${url}`);
