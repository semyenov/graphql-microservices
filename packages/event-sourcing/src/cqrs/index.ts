/**
 * CQRS (Command Query Responsibility Segregation) Module
 */

// Export types
export * from './types';

// Export command bus
export { CommandBus } from './command-bus';

// Export query bus
export { QueryBus } from './query-bus';

// Export decorators
export * from './decorators';

// Re-export specific types for convenience
export type {
  ICommand,
  IQuery,
  ICommandHandler,
  IQueryHandler,
  CommandResult,
  CommandMetadata,
  QueryMetadata,
} from './types';

// Re-export errors
export {
  HandlerNotFoundError,
  CommandValidationError,
  QueryValidationError,
} from './types';