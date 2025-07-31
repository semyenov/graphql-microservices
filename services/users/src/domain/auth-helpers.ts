import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

/**
 * Hash a password with a random salt
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    // Generate a random salt
    const salt = randomBytes(16).toString('hex');

    // Hash the password with the salt
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;

    // Combine salt and hash
    return `${salt}:${derivedKey.toString('hex')}`;
  } catch (error) {
    throw new Error(`Password hashing failed: ${error}`);
  }
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    // Split the hash to extract salt and key
    const [salt, key] = hash.split(':');

    if (!salt || !key) {
      return false;
    }

    // Hash the provided password with the same salt
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;

    // Compare the keys using timing-safe comparison
    const keyBuffer = Buffer.from(key, 'hex');
    return timingSafeEqual(derivedKey, keyBuffer);
  } catch (error) {
    console.error('Password verification failed:', error);
    return false;
  }
}

/**
 * Generate a secure random password
 */
export function generatePassword(length: number = 16): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = randomBytes(1)[0] % charset.length;
    password += charset[randomIndex];
  }

  return password;
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  // Length check
  if (password.length >= 8) {
    score += 1;
  } else {
    feedback.push('Password should be at least 8 characters long');
  }

  if (password.length >= 12) {
    score += 1;
  }

  // Character variety checks
  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Password should contain lowercase letters');
  }

  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Password should contain uppercase letters');
  }

  if (/\d/.test(password)) {
    score += 1;
  } else {
    feedback.push('Password should contain numbers');
  }

  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Password should contain special characters');
  }

  // Common patterns to avoid
  if (/(.)\1{2,}/.test(password)) {
    score -= 1;
    feedback.push('Avoid repeating characters');
  }

  if (/012|123|234|345|456|567|678|789|890|abc|bcd|cde|def/.test(password.toLowerCase())) {
    score -= 1;
    feedback.push('Avoid sequential characters');
  }

  const isValid = score >= 4 && feedback.length === 0;

  return {
    isValid,
    score: Math.max(0, score),
    feedback,
  };
}

/**
 * Check if a password has been commonly breached
 * This is a simplified version - in production you'd use a service like HaveIBeenPwned
 */
export function isPasswordBreached(password: string): boolean {
  const commonPasswords = [
    'password',
    '123456',
    '123456789',
    'qwerty',
    'abc123',
    'password123',
    'admin',
    'letmein',
    'welcome',
    'monkey',
  ];

  return commonPasswords.includes(password.toLowerCase());
}

/**
 * Generate password hash suitable for testing
 */
export async function createTestPasswordHash(password: string = 'testpassword'): Promise<string> {
  return hashPassword(password);
}
