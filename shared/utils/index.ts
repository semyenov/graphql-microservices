// Re-export all utilities
import { createLogger } from '@graphql-microservices/logger';

export * from './docker';
export * from './schema';
export * from './service-discovery';

// Create logger instance for shared utils
const logger = createLogger({ service: 'shared-utils' });

// Common utility functions
export function formatServiceName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function logSuccess(message: string): void {
  logger.info(`✅ ${message}`);
}

export function logError(message: string, error?: Error): void {
  if (error) {
    logger.error(`❌ ${message}`, error);
  } else {
    logger.error(`❌ ${message}`);
  }
}

export function logWarning(message: string): void {
  logger.warn(`⚠️  ${message}`);
}

export function logInfo(message: string): void {
  logger.info(`ℹ️  ${message}`);
}

export function logStep(message: string): void {
  logger.info(`📦 ${message}`);
}
