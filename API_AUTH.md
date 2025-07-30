# Authentication & Authorization API Documentation

## Overview

The GraphQL API uses JWT-based authentication with role-based access control (RBAC).

## Authentication Flow

### 1. Sign Up

```graphql
mutation SignUp {
  signUp(input: {
    username: "johndoe"
    email: "john@example.com"
    password: "SecurePass123"
    name: "John Doe"
    phoneNumber: "+1234567890"
  }) {
    user {
      id
      username
      email
      role
    }
    accessToken
    refreshToken
  }
}
```

### 2. Sign In

```graphql
mutation SignIn {
  signIn(input: {
    username: "johndoe"
    password: "SecurePass123"
  }) {
    user {
      id
      username
      email
      role
    }
    accessToken
    refreshToken
  }
}
```

### 3. Refresh Token

```graphql
mutation RefreshToken {
  refreshToken(refreshToken: "your-refresh-token-here") {
    user {
      id
      username
    }
    accessToken
    refreshToken
  }
}
```

### 4. Sign Out

```graphql
mutation SignOut {
  signOut
}
```

## Authorization Headers

Include the access token in the Authorization header:

```
Authorization: Bearer <your-access-token>
```

## Role-Based Access Control

### Roles

- `USER` - Basic user access
- `MODERATOR` - Moderate content and users
- `ADMIN` - Full system access

### Protected Queries

```graphql
# Requires authentication
query GetMe {
  me {
    id
    username
    email
    role
  }
}

# Requires ADMIN role
query GetAllUsers {
  users {
    id
    username
    email
    role
    isActive
  }
}

# Requires ADMIN role
query GetUserByEmail {
  userByEmail(email: "user@example.com") {
    id
    username
    role
  }
}
```

### Protected Mutations

```graphql
# Update your own profile (requires authentication)
mutation UpdateProfile {
  updateProfile(input: {
    name: "John Updated"
    phoneNumber: "+9876543210"
  }) {
    id
    name
    phoneNumber
  }
}

# Change password (requires authentication)
mutation ChangePassword {
  changePassword(input: {
    currentPassword: "OldPass123"
    newPassword: "NewSecurePass456"
  })
}

# Update any user (requires ADMIN role)
mutation UpdateUser {
  updateUser(id: "user-id", input: {
    role: MODERATOR
    name: "Updated Name"
  }) {
    id
    role
    name
  }
}

# Deactivate user (requires ADMIN role)
mutation DeactivateUser {
  deactivateUser(id: "user-id") {
    id
    isActive
  }
}
```

## Error Responses

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
      "code": "FORBIDDEN"
    }
  }]
}
```

## Token Expiration

- Access Token: 7 days (configurable)
- Refresh Token: 30 days (configurable)

## Security Best Practices

1. **Store tokens securely** - Use httpOnly cookies or secure storage
2. **Refresh tokens regularly** - Implement automatic token refresh
3. **Handle token expiration** - Gracefully handle 401 errors
4. **Logout on security events** - Clear tokens on password change
5. **Use HTTPS** - Always use encrypted connections in production

## Example: Authenticated Request Flow

```javascript
// 1. Sign in
const { data } = await client.mutate({
  mutation: SIGN_IN,
  variables: {
    input: { username: "johndoe", password: "password" }
  }
});

const { accessToken } = data.signIn;

// 2. Set authorization header
client.setHeaders({
  authorization: `Bearer ${accessToken}`
});

// 3. Make authenticated requests
const { data: userData } = await client.query({
  query: GET_ME
});
```