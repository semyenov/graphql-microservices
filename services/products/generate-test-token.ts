#!/usr/bin/env bun

import { AuthService } from '@graphql-microservices/shared-auth';

// Load key pairs using AuthService helper
const jwtKeyPair = AuthService.loadKeyPairFromEnv(
  'JWT_ACCESS_PRIVATE_KEY',
  'JWT_ACCESS_PUBLIC_KEY'
);
const refreshKeyPair = AuthService.loadKeyPairFromEnv(
  'JWT_REFRESH_PRIVATE_KEY',
  'JWT_REFRESH_PUBLIC_KEY'
);

// Create auth service instance
const authService = new AuthService(jwtKeyPair, refreshKeyPair, {
  algorithm: 'RS256' as const,
});

// Generate test token
const testToken = authService.generateAccessToken({
  userId: 'test-user-123',
  email: 'test@test.com',
  role: 'ADMIN',
});

console.log('Generated Test JWT Token:');
console.log(testToken);
console.log('\nTo use this token, add the following header to your requests:');
console.log(`Authorization: Bearer ${testToken}`);

// Verify the token works
try {
  const decoded = authService.verifyAccessToken(testToken);
  console.log('\n✅ Token verified successfully!');
  console.log('Decoded payload:', decoded);
} catch (error) {
  console.error('\n❌ Token verification failed:', error);
}
