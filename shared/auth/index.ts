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
    // This is a simplified example - you'd typically use:
    // openssl genrsa -out private.pem 2048
    // openssl rsa -in private.pem -pubout -out public.pem

    const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKB
gLuaT9bQqpskLclVgzxHvJcJPlYehcbXxf04SZnVuWjKBrMfeR5XQoHDb+1F1Cr+
VrdoFY2Q9HPx0RfFJeXeNlPfpnDE5ZimCBQgnuAIbf1M28M6xHc4lV9EpQyFQ8Q+
kpB4lbRguMvKfRcMOI4RGDHj1NAKjBIFlZROOBzOY6YyeWNkUDFgMiW5/Mye5mnp
2sXLpnqcbDc3TlqFSljOVxjnPqQPjHPxqXyfHbqntOV+TpLGGRHOGrpx3GhVv6K+
o1Q5bTMdaLs/OiQECbYyk+llPQZIUZ4QlB9KB7Xm5BGhmSHiL8GxwQj7ER0YfwAY
AgMBAAECggEBAKTmjaS6tkK8BlPXClTQ2vpz/N6uxDeS35mXpqasqskVlaUidmbg
wL2qRtoUSMS293g9Gd4naafDIU4HfdelZQzGhz4nqrXt1MlqOiDp5m+r4VkvzJ5B
kQSi6IezqC+GqBxxIdJwB29iA1wF/TXdQfV7jprPDL4lM1WqV8p5wMm/BOmlg6Sq
oUNomC4qVeP67IHtB1i2v2MqlqOOm8VjMzmRkkPgwwnBAMJ2Rt7r7B2Mya1lEoqE
oQ3bMv4gyaSb9081OPW9F5t2C9zNg0hS29m2JYJnmHuEht/3qEOqPIE7mG5KK5tY
jY2C3a1z3D2MLPQZJVbD5mGRwGxqQ5j/euPDYgFPiFzwR8LZQJECgYEA8KNThCO5
gsC7IuRenP1Ch7j7gS3NfUxMnH6L7u6yUt3mwRK6j1ESg1aKjivevs4u4gpXajFl
eCzV6l4qJb/4IKpDXQMZtMXfhY8aYhOwoIx0Mabt1B7rW5qS4BlS3JmIQx1IAyD6
0I59R4B1Uy4t5tbkQHS8FLaYzhqo2tZZMvz+2QqECgYEAx0oQs2reBQGMVZnUtDl
7jO2ZxEWG4uzgUMSJf2Keb2T8YzSkSxQmw1WSmSOZfD4gQbvSWIzvG+MI8VPbpWQ
n/9bl6iRK8tCHWsxJ5lj2L1HpmQWcVjBVJ+Hs1Id7D8Si0TfHkvLmk3VkzyXmukb
Ta6/r6JSERqt9j1FkBRt0Ytyqh1wIjkCgYAMV3a5iVYGuRt6gX3ktGZhdKt5waUf
EU1aFd6QMMjKYD3YWLkvei6XTHbI1EFGkqJ6j2j4EhVe+m6EL7voXJjI9S+S/WeW
PxIEPR9F6Rk6k4wsTi5rjUIb0hXMuCiiZf6ILXE1W7AZ3El9YPSAN9dy5ZQx8SlK
ZRFuhQvECgYAt8jJopFlwryPxvQpQSoiSfEsFd1pkbJIRDKlfY5hbl9eKfZX7yTG
/0Th1o5x2HpWmA2jWT1bNgC5Vd69xyVwM5AtXmR7BvGF9P+uJ+BNCNwok6dZQ1g6
vx7Emo1yX80gES0JssP1mi8fo5HsHpBZ8lNwGPxRLOvGvdxhQq0zXe5oQKBgQC8
xQb1jKevbhlqv4L22LpDmJ+GSt8zN844mend6ZXrCbcpB+WXbLP1betv07pCWZ4s
Nf0KXiP5Rj+ad9ltJ6iEvuaM9tQmQC71z9OWSiq5W8aRyz5UdS5cMC8oCu5vlpsI
F6v6KZJazrhOpxZbEHZ6GHCaKf/t1cTF/Mxicf1WqBvyQ==
-----END PRIVATE KEY-----`;

    const publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1LfVLPHCgYC7mk/W
0KqbJLDJVYM8R7yXCT5WHoXG18X9OEmZ1bloygazH3keV0KBw2/tRdQq/la3aBWN
kPRz8dEXxSXl3jZT36ZwxOWZpggUIJ7gCG39TNvDOsR3OJVfRKUMhUPEPpKQeJW0
YLjLyn0XDDiOERgx49TQCowSBZWUTjgcTmOmMnljZFAxYDIlufzMnuZp6drFy6Z6
nGw3N05ahUpYzlcY5z6kD4xz8al8nx26p7Tlfk6SxhkRzhq6cdxoVb+ivqNUOW0z
HWizPzokBAm2MpPpZT0GSFGeEJQfSge15uQRoZkh4i/BscEI+xEdGH8AGAIBAQID
AQAB
-----END PUBLIC KEY-----`;

    return { 
      privateKey: privateKey as PrivateKey, 
      publicKey: publicKey as PublicKey 
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
