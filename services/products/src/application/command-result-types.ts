import type { CommandResult } from './commands';

/**
 * Type-safe command result types for Products Service
 */

/**
 * Type guard to check if command result is successful
 */
export function isSuccessCommandResult(result: CommandResult): result is CommandResult & { success: true; aggregateId: string } {
  return result.success === true && result.aggregateId !== undefined;
}

/**
 * Extract aggregate ID from command result or throw error
 */
export function extractAggregateId(result: CommandResult, errorMessage?: string): string {
  if (!isSuccessCommandResult(result)) {
    throw new Error(result.error || errorMessage || 'Command failed');
  }
  return result.aggregateId;
}