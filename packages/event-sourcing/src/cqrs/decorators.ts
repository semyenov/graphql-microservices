import 'reflect-metadata';
import type { Class } from 'type-fest';

const COMMAND_HANDLER_METADATA = Symbol('__command_handler__');
const QUERY_HANDLER_METADATA = Symbol('__query_handler__');
const EVENT_HANDLER_METADATA = Symbol('__event_handler__');

/**
 * Decorator to mark a class as a command handler
 */
export function CommandHandler(commandType: string | Class<unknown>) {
  return <T extends { new (...args: unknown[]): unknown }>(target: T): T => {
    const type = typeof commandType === 'string' ? commandType : commandType.name;

    Reflect.defineMetadata(COMMAND_HANDLER_METADATA, type, target);
    return target;
  };
}

/**
 * Decorator to mark a class as a query handler
 */
export function QueryHandler(queryType: string | Class<unknown>) {
  return <T extends { new (...args: unknown[]): unknown }>(target: T): T => {
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

/**
 * Decorator to mark a class as an event handler
 */
export function EventHandler(eventType: string | Class<any>) {
  return <T extends { new (...args: unknown[]): unknown }>(target: T): T => {
    const type = typeof eventType === 'string' ? eventType : eventType.name;

    Reflect.defineMetadata(EVENT_HANDLER_METADATA, type, target);
    return target;
  };
}

/**
 * Get the event type handled by an event handler class
 */
export function getEventHandlerMetadata(target: object): string | undefined {
  return Reflect.getMetadata(EVENT_HANDLER_METADATA, target);
}

/**
 * Check if a class is an event handler
 */
export function isEventHandler(target: object): boolean {
  return Reflect.hasMetadata(EVENT_HANDLER_METADATA, target);
}
