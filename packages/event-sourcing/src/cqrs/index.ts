/**
 * CQRS (Command Query Responsibility Segregation) Module
 */

// Export command bus
export { CommandBus } from './command-bus';
// Export decorators
export * from './decorators';

// Export query bus
export { QueryBus } from './query-bus';
// Re-export specific types for convenience
export type {
  CommandMetadata,
  CommandResult,
  ICommand,
  ICommandHandler,
  IQuery,
  IQueryHandler,
  QueryMetadata,
} from './types';
// Export types
export * from './types';

// Re-export errors
export {
  CommandValidationError,
  HandlerNotFoundError,
  QueryValidationError,
} from './types';
