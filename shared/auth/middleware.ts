import type { AuthService, JWTPayload } from './index';

/**
 * Extract and verify JWT token from request headers
 * Used by all services to authenticate requests forwarded from the gateway
 */
export async function extractAndVerifyUser(
  authService: AuthService,
  authHeader: string | undefined
): Promise<JWTPayload | null> {
  const token = authService.extractTokenFromHeader(authHeader);

  if (!token) {
    return null;
  }

  try {
    return authService.verifyAccessToken(token);
  } catch (_error) {
    // Token verification failed - don't throw, just return null
    // The resolvers will handle authentication requirements
    return null;
  }
}

/**
 * Create context with authentication for Apollo Server
 */
export function createAuthContext(authService: AuthService) {
  return async ({ req }: { req: { headers: { authorization?: string } } }) => {
    const user = await extractAndVerifyUser(authService, req.headers.authorization);
    return { user, isAuthenticated: !!user };
  };
}
