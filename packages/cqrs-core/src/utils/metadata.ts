import { generateId } from '@graphql-microservices/shared-errors';

/**
 * Create a correlation ID
 */
export function createCorrelationId(): string {
  return generateId();
}

/**
 * Create metadata with common fields
 */
export function createMetadata(options?: {
  correlationId?: string;
  causationId?: string;
  userId?: string;
  source?: string;
  [key: string]: unknown;
}): Record<string, unknown> {
  return {
    correlationId: options?.correlationId || createCorrelationId(),
    timestamp: new Date(),
    source: options?.source || 'unknown',
    ...options,
  };
}

/**
 * Extract metadata from request context
 */
export function extractMetadataFromContext(context: {
  headers?: Record<string, string | string[] | undefined>;
  user?: { id: string; [key: string]: unknown };
  [key: string]: unknown;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  // Extract correlation ID from headers
  if (context.headers) {
    const correlationId =
      context.headers['x-correlation-id'] ||
      context.headers['x-request-id'] ||
      context.headers['correlation-id'];

    if (correlationId) {
      metadata.correlationId = Array.isArray(correlationId) ? correlationId[0] : correlationId;
    }
  }

  // Extract user ID
  if (context.user?.id) {
    metadata.userId = context.user.id;
  }

  // Set source
  metadata.source = context.source || 'api';

  return createMetadata(metadata);
}

/**
 * Merge metadata objects
 */
export function mergeMetadata(
  ...metadataObjects: Array<Record<string, unknown> | undefined>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const metadata of metadataObjects) {
    if (metadata) {
      Object.assign(result, metadata);
    }
  }

  return result;
}

/**
 * Filter sensitive metadata fields
 */
export function filterSensitiveMetadata(
  metadata: Record<string, unknown>,
  sensitiveFields: string[] = ['password', 'token', 'secret', 'key']
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const isValueObject = value !== null && typeof value === 'object' && !Array.isArray(value);

    if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
      filtered[key] = '***';
    } else if (isValueObject) {
      filtered[key] = filterSensitiveMetadata(value as Record<string, unknown>, sensitiveFields);
    } else {
      filtered[key] = value;
    }
  }

  return filtered;
}
