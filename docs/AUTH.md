# Authentication & Authorization

This document describes the authentication and authorization implementation in the GraphQL microservices.

## Overview

The system uses JWT (JSON Web Tokens) for authentication with RSA signing for enhanced security.

## Architecture

```
┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Gateway   │
└─────────────┘     └──────┬──────┘
                           │
                    Authorization Header
                           │
                    ┌──────▼──────┐
                    │   Services  │
                    └─────────────┘
```

## JWT Implementation

### Token Types

1. **Access Token**
   - Short-lived (15 minutes default)
   - Used for API requests
   - Contains user ID, email, and role

2. **Refresh Token**
   - Long-lived (7 days default)
   - Used to obtain new access tokens
   - Stored in database for revocation

### Token Structure

```json
{
  "userId": "user-123",
  "email": "user@example.com",
  "role": "USER",
  "iat": 1234567890,
  "exp": 1234568790
}
```

## Authentication Flow

### Sign Up

```graphql
mutation SignUp {
  signUp(input: {
    username: "johndoe"
    email: "john@example.com"
    password: "SecurePass123!"
    name: "John Doe"
  }) {
    accessToken
    refreshToken
    user {
      id
      username
      email
      role
    }
  }
}
```

### Sign In

```graphql
mutation SignIn {
  signIn(input: {
    username: "johndoe"
    password: "SecurePass123!"
  }) {
    accessToken
    refreshToken
    user {
      id
      username
      email
      role
    }
  }
}
```

### Token Refresh

```graphql
mutation RefreshToken {
  refreshToken(refreshToken: "your-refresh-token") {
    accessToken
    refreshToken
  }
}
```

## Authorization

### Role-Based Access Control (RBAC)

Three roles are supported:
- `USER` - Standard user access
- `ADMIN` - Full administrative access
- `MODERATOR` - Limited administrative access

### GraphQL Directives

#### @auth Directive

Requires authentication:
```graphql
type Query {
  me: User @auth
}
```

With role requirement:
```graphql
type Mutation {
  deleteUser(id: ID!): Boolean @auth(requires: ADMIN)
}
```

#### @public Directive

Marks operations as publicly accessible:
```graphql
type Query {
  publicProducts: [Product!]! @public
}
```

## Implementation Details

### Password Security

- Passwords are hashed using bcrypt
- Minimum 8 characters required
- Salt rounds: 10

### Token Security

- RSA-256 signing algorithm
- Separate key pairs for access and refresh tokens
- Keys are generated at service startup

### Context Propagation

1. Client sends token in Authorization header
2. Gateway extracts and forwards token
3. Services verify token and extract user context
4. User context available in resolvers

## Security Best Practices

### Token Storage

**Client-side:**
- Store access token in memory
- Store refresh token in httpOnly cookie
- Never store tokens in localStorage

**Server-side:**
- Store refresh tokens in database
- Implement token revocation
- Track active sessions

### Token Expiration

- Access tokens: 15 minutes
- Refresh tokens: 7 days
- Implement sliding sessions

### Security Headers

```typescript
{
  'Authorization': 'Bearer YOUR_ACCESS_TOKEN',
  'X-CSRF-Token': 'csrf-token',
  'X-Request-ID': 'unique-request-id'
}
```

## Error Handling

### Authentication Errors

```json
{
  "errors": [{
    "message": "Invalid credentials",
    "extensions": {
      "code": "UNAUTHENTICATED"
    }
  }]
}
```

### Authorization Errors

```json
{
  "errors": [{
    "message": "Insufficient permissions",
    "extensions": {
      "code": "FORBIDDEN",
      "requiredRole": "ADMIN",
      "userRole": "USER"
    }
  }]
}
```

## Session Management

### Sign Out

```graphql
mutation SignOut {
  signOut
}
```

This will:
- Invalidate the refresh token
- Clear server-side session
- Return success boolean

### Password Change

```graphql
mutation ChangePassword {
  changePassword(input: {
    currentPassword: "OldPass123!"
    newPassword: "NewPass456!"
  })
}
```

## Multi-Factor Authentication (Future)

Planned implementation:
- TOTP support
- SMS verification
- Email verification
- Backup codes

## Audit Logging

All authentication events are logged:
- Successful logins
- Failed login attempts
- Token refreshes
- Password changes
- Account deactivations

## Testing Authentication

### Using GraphQL Playground

1. Sign in to get tokens
2. Set Authorization header:
   ```json
   {
     "Authorization": "Bearer YOUR_ACCESS_TOKEN"
   }
   ```
3. Execute authenticated queries

### Using cURL

```bash
# Sign in
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { signIn(input: { username: \"test\", password: \"test\" }) { accessToken } }"
  }'

# Use token
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"query": "{ me { id username } }"}'
```

## Troubleshooting

### Common Issues

1. **"Invalid token"**
   - Check token expiration
   - Verify token format
   - Ensure correct signing key

2. **"Insufficient permissions"**
   - Check user role
   - Verify directive configuration
   - Review role requirements

3. **"Token expired"**
   - Use refresh token to get new access token
   - Implement automatic token refresh

## Security Checklist

- [ ] Use HTTPS in production
- [ ] Implement rate limiting on auth endpoints
- [ ] Monitor failed login attempts
- [ ] Implement account lockout
- [ ] Use secure password requirements
- [ ] Implement CSRF protection
- [ ] Regular security audits
- [ ] Keep dependencies updated