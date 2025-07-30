// Re-export all utilities

export * from './docker';
export * from './schema';
export * from './service-discovery';

// Common utility functions
export function formatServiceName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function logSuccess(message: string): void {
  console.log(`✅ ${message}`);
}

export function logError(message: string): void {
  console.error(`❌ ${message}`);
}

export function logWarning(message: string): void {
  console.warn(`⚠️  ${message}`);
}

export function logInfo(message: string): void {
  console.log(`ℹ️  ${message}`);
}

export function logStep(message: string): void {
  console.log(`📦 ${message}`);
}
