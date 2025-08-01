#!/usr/bin/env bun

import jwt from 'jsonwebtoken';

// Create a test JWT token
const payload = {
  userId: 'test-user-123',
  username: 'testuser',
  email: 'test@test.com',
  role: 'ADMIN'
};

// Use a simple secret for testing (the service will use its generated keys)
const token = jwt.sign(payload, 'test-secret', {
  expiresIn: '1h',
  algorithm: 'HS256'
});

console.log('Test JWT Token:');
console.log(token);
console.log('\nDecoded payload:');
console.log(jwt.decode(token));