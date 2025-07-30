import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt, {
  type PrivateKey,
  type PublicKey,
  type SignOptions,
  type VerifyOptions,
} from 'jsonwebtoken';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
  jti: string; // JWT ID for token revocation
}

export interface KeyPair {
  privateKey: PrivateKey;
  publicKey: PublicKey;
}

export class AuthService {
  private jwtKeyPair: KeyPair;
  private refreshKeyPair: KeyPair;

  constructor(
    jwtKeyPair: KeyPair,
    refreshKeyPair: KeyPair,
    private signOptions: SignOptions = { algorithm: 'RS256' as const },
    private verifyOptions: VerifyOptions = { algorithms: ['RS256' as const] }
  ) {
    this.jwtKeyPair = jwtKeyPair;
    this.refreshKeyPair = refreshKeyPair;
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  generateAccessToken(payload: JWTPayload, options?: SignOptions): string {
    const tokenOptions: SignOptions = {
      ...this.signOptions,
      ...options,
      algorithm: 'RS256' as const,
      expiresIn: options?.expiresIn || '15m',
    };

    return jwt.sign(payload, this.jwtKeyPair.privateKey, tokenOptions);
  }

  generateRefreshToken(payload: Omit<RefreshTokenPayload, 'jti'>, options?: SignOptions): string {
    const tokenPayload: RefreshTokenPayload = {
      ...payload,
      jti: randomBytes(32).toString('hex'), // Generate unique token ID
    };

    const tokenOptions: SignOptions = {
      ...this.signOptions,
      ...options,
      algorithm: 'RS256' as const,
      expiresIn: options?.expiresIn || '7d',
    };

    return jwt.sign(tokenPayload, this.refreshKeyPair.privateKey, tokenOptions);
  }

  verifyAccessToken(token: string, options?: VerifyOptions): JWTPayload {
    const verifyOptions: VerifyOptions = {
      ...this.verifyOptions,
      ...options,
      algorithms: ['RS256' as const],
    };

    const result = jwt.verify(token, this.jwtKeyPair.publicKey, verifyOptions);
    return result as unknown as JWTPayload;
  }

  verifyRefreshToken(token: string, options?: VerifyOptions): RefreshTokenPayload {
    const verifyOptions: VerifyOptions = {
      ...this.verifyOptions,
      ...options,
      algorithms: ['RS256' as const],
    };

    const result = jwt.verify(token, this.refreshKeyPair.publicKey, verifyOptions);
    return result as unknown as RefreshTokenPayload;
  }

  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  // Utility method to generate key pairs (for development/testing)
  static generateKeyPair(): KeyPair {
    // In production, you should use proper key generation
    // For now, using a valid RSA key pair for development

    const privateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAwJw7jC0vaL4JcSmgYW8WHmFQ6a8p3WNhN5vKcT2SfCsltJTv
lKbeRR5xEgvYaUH/VCCcpGN3I2ynBxii6YoLsNQhUH5dCkK5N6EkEDp3Y9Boolzi
Z5RpOMQwvF1MJNypRalR3q+2TwXj9e3xZJCrzx1cXphKO0HdCZSeWnHIHDz8GIXZ
/Z6FaEVJWiSGXcSF1K9XN1F0LDcJ6fqzyPyR/pBMnWXevgSrPRCmOWx8S2lBJHPy
MQf0lLKKMEd5sJZJguEJ41i0D4RmJEGTO3c4ytGfGQNVCPb1SaLHQEfVLbWLQGNI
lYCNDQQnKYgNJfRD7mIE6yV9hnMvDOhy2Fo5UQIDAQABAoIBACPLHuCZJ1ZsPzOz
oQmfovtBv6FeH7Djv8G4LLabJZVO6FUe9TYD7K4oJ6s9xCdLqCWVAZ1FV49p2qRG
OMSGQiaHO1K7xMCRN8bgTrtXE8OwudF5J0V8sNWHTmQfJD7V8VM8eggLUFnUpKPa
O8mohOzi5wvwGa9sESQHnZcOLLgJon2x7VktmJMGO4rFYLZ7flJis6RRqLNXKNea
CAmgUbBCeCQsN6yOCkB2hMWlPs2xSt4GLLECqffrGW4+glyjS7sf4YhJedT9CQW5
53QWauyECSmNvfJ2yHdFqRHIx/wOqF8JF5T6agVa6k8Uy3ztJ8J9p8TYFDj9Ljjz
PZTZKAECgYEA4t8nK6SAU8AFn9cn0cUGXQY2Cq1UPh5s5LPJQW1PXKNsvLhqYNbY
eXYBRBByDpttTDDqPvj3BV3+3YvPRiG2j2DtVx8qXQj5FmhbACxqH+hXOoL6CR3O
CxcFAepQQ9w5qPXB3i0msUqtZbMGJ6Y9tLxMH0pYMstUNWkW5oXU6PECgYEA2ddr
5Mo6pH6wSNJMQx2fUkHEaLM6BJEuV9xKFiQXAIVHmdPTnR4/A4xmdg3ppGXxe8s1
HCk2fZn55WZD8jzP0TDgNJBcqMGFV8zN2YfBilZKmIvyqgCnZb5R5HNPBloRmkKm
MvYel2bPbG1pjXQRwGWJQ9wcZJPPgVLN5SZLUaECgYEAmrqH5c1YxD/4U3F7Ly9y
ViIx7kPatP2F8R2SPNHWYDa5fBfiXLvYRKOeWjbqvOjFqmXDQVwnX6J7soYbdIHR
sNd6xDYQPKvA5TT0dad8TqNqhXPVO4pHb0p1xWYx8TZrxmQQ28R6WhPrG6NSnL6g
X8L3SH9bC/sZBhZE5oO/FIECgYEAwxOW4mnVP5xYe0j+aEjQQp3DoYNhQBHoDrXy
kHUZf4/hlJmhDQINBRIV8O7xBpXpOMZg7cVZMYLKrX+dGlbVZNUQXALe2R1jqYyT
Ka5oiIYYj6keN3OEGrHqQQ4la/IcaOFBFUq48KnBo5JEiQvvHM2M1F5tKTGCqHD6
58O0OoECgYBHoVwoyi2RR4pIBX7cmI3SpMDGp5DPWdoF2hHeQGEaF6r/f1J4KI3j
lXPAYi3q8KPVpwmPl5FeQwlJ6xViG8RdJDp/Fzx0lMs4u/MjqTkmGVGNu7ZptQeR
Cpm1/VQphNP0dD0BlQh2TpvNy8HKGUNkCbQNTnmEur0rXDannxcE7Q==
-----END RSA PRIVATE KEY-----`;

    const publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwJw7jC0vaL4JcSmgYW8W
HmFQ6a8p3WNhN5vKcT2SfCsltJTvlKbeRR5xEgvYaUH/VCCcpGN3I2ynBxii6YoL
sNQhUH5dCkK5N6EkEDp3Y9BoolziZ5RpOMQwvF1MJNypRalR3q+2TwXj9e3xZJCr
zx1cXphKO0HdCZSeWnHIHDz8GIXZ/Z6FaEVJWiSGXcSF1K9XN1F0LDcJ6fqzyPyR
/pBMnWXevgSrPRCmOWx8S2lBJHPyMQf0lLKKMEd5sJZJguEJ41i0D4RmJEGTO3c4
ytGfGQNVCPb1SaLHQEfVLbWLQGNIlYCNDQQnKYgNJfRD7mIE6yV9hnMvDOhy2Fo5
UQIDAQAB
-----END PUBLIC KEY-----`;

    return {
      privateKey: privateKey as PrivateKey,
      publicKey: publicKey as PublicKey,
    };
  }

  // Load key pair from environment variables
  static loadKeyPairFromEnv(privateKeyEnv: string, publicKeyEnv: string): KeyPair {
    const privateKey = process.env[privateKeyEnv];
    const publicKey = process.env[publicKeyEnv];

    if (!privateKey || !publicKey) {
      console.warn(
        `Warning: ${privateKeyEnv} or ${publicKeyEnv} not found in environment. Using generated keys for development.`
      );
      return AuthService.generateKeyPair();
    }

    // Replace escaped newlines with actual newlines
    const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
    const formattedPublicKey = publicKey.replace(/\\n/g, '\n');

    return {
      privateKey: formattedPrivateKey as PrivateKey,
      publicKey: formattedPublicKey as PublicKey,
    };
  }

  // Method to create auth service with generated key pairs
  static createWithGeneratedKeys(): AuthService {
    const jwtKeyPair = AuthService.generateKeyPair();
    const refreshKeyPair = AuthService.generateKeyPair();

    return new AuthService(jwtKeyPair, refreshKeyPair);
  }
}

// GraphQL context interface
export interface AuthContext {
  user?: JWTPayload;
  isAuthenticated: boolean;
}

// Authentication directive
export const authDirective = `
  directive @auth(requires: Role = USER) on FIELD_DEFINITION | OBJECT
  directive @public on FIELD_DEFINITION | OBJECT
`;

// Role-based access control
export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
}

export function hasRole(userRole: string, requiredRole: Role): boolean {
  const roleHierarchy = {
    [Role.USER]: 0,
    [Role.MODERATOR]: 1,
    [Role.ADMIN]: 2,
  };

  return roleHierarchy[userRole as Role] >= roleHierarchy[requiredRole];
}

// Re-export middleware utilities
export * from './middleware';
