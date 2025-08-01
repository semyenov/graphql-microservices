import 'reflect-metadata';

const COMMAND_HANDLER_METADATA = Symbol('__command_handler__');
const QUERY_HANDLER_METADATA = Symbol('__query_handler__');

/**
 * Decorator to mark a class as a command handler
 */
export function CommandHandler(commandType: string | { new (...args: unknown[]): unknown }) {
  return (target: object) => {
    const type = typeof commandType === 'string' ? commandType : commandType.name;

    Reflect.defineMetadata(COMMAND_HANDLER_METADATA, type, target);
    return target;
  };
}

/**
 * Decorator to mark a class as a query handler
 */
export function QueryHandler(queryType: string | { new (...args: unknown[]): unknown }) {
  return (target: object) => {
    const type = typeof queryType === 'string' ? queryType : queryType.name;

    Reflect.defineMetadata(QUERY_HANDLER_METADATA, type, target);
    return target;
  };
}

/**
 * Get the command type handled by a command handler class
 */
export function getCommandHandlerMetadata(target: object): string | undefined {
  return Reflect.getMetadata(COMMAND_HANDLER_METADATA, target);
}

/**
 * Get the query type handled by a query handler class
 */
export function getQueryHandlerMetadata(target: object): string | undefined {
  return Reflect.getMetadata(QUERY_HANDLER_METADATA, target);
}

/**
 * Check if a class is a command handler
 */
export function isCommandHandler(target: object): boolean {
  return Reflect.hasMetadata(COMMAND_HANDLER_METADATA, target);
}

/**
 * Check if a class is a query handler
 */
export function isQueryHandler(target: object): boolean {
  return Reflect.hasMetadata(QUERY_HANDLER_METADATA, target);
}
