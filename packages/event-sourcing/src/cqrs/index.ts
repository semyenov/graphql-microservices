/**
 * CQRS (Command Query Responsibility Segregation) Module
 */

// Export command bus
export {
  baseCommandSchema,
  CommandBus,
  type CommandBusOptions,
  type CommandContext,
  type CommandMapTypes,
  type CommandMapUnion,
  type CommandMiddleware,
  commandMetadataSchema,
  createCommandBus,
  createTestCommandBus,
  createValidatedCommand,
  type DefineCommandMap,
  type TypedCommandMap,
} from './command-bus';
// Export decorators
export * from './decorators';
// Export event bus
export {
  createEventBus,
  type DefineEventMap,
  EventBus,
  type EventBusOptions,
  type EventFromType,
  type EventTypes,
  HandlerRegistrationBuilder,
  type TypedEventMap,
} from './event-bus';
// Export query bus
export {
  baseQuerySchema,
  createQueryBus,
  createTestQueryBus,
  createValidatedQuery,
  type DefineQueryMap,
  type PaginatedResult,
  type PaginationParams,
  paginationSchema,
  QueryBus,
  type QueryBusOptions,
  type QueryCacheConfig,
  type QueryContext,
  type QueryMapTypes,
  type QueryMapUnion,
  type QueryMiddleware,
  queryMetadataSchema,
  type TypedQueryMap,
} from './query-bus';
// Export tracing utilities
export {
  addSpanAttributes,
  createSpan,
  createTracingContext,
  deserializeTracingContext,
  extractTraceContext,
  generateSpanId,
  generateTraceId,
  injectTraceContext,
  type MetricRecorder,
  metrics,
  recordCommandMetrics,
  recordEventMetrics,
  recordQueryMetrics,
  recordSpanException,
  serializeTracingContext,
  setSpanStatus,
  Trace,
  type TraceMetadata,
  type TracingContext,
} from './tracing-utils';
// Re-export specific types for convenience
export type {
  CommandMetadata,
  CommandResult,
  ICommand,
  ICommandHandler,
  IEventHandler,
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
