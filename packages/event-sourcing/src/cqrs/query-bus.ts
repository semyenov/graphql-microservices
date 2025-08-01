import type { IQuery, IQueryHandler } from './types';
import { HandlerNotFoundError, isQuery, QueryValidationError } from './types';

/**
 * Query bus for dispatching queries to their handlers
 */
export class QueryBus {
  private readonly handlers = new Map<string, IQueryHandler>();

  /**
   * Register a query handler
   */
  register<TQuery extends IQuery, TResult>(
    queryType: string | { new (...args: unknown[]): TQuery },
    handler: IQueryHandler<TQuery, TResult>
  ): void {
    const type = typeof queryType === 'string' ? queryType : queryType.name;

    if (this.handlers.has(type)) {
      throw new Error(`Handler already registered for query type: ${type}`);
    }

    this.handlers.set(type, handler);
  }

  /**
   * Execute a query
   */
  async execute<TResult = unknown>(query: IQuery): Promise<TResult> {
    if (!isQuery(query)) {
      throw new QueryValidationError('Invalid query structure');
    }

    const handler = this.handlers.get(query.type);

    if (!handler) {
      throw new HandlerNotFoundError(query.type);
    }

    try {
      return (await handler.execute(query)) as TResult;
    } catch (error) {
      // Re-throw known errors
      if (error instanceof QueryValidationError || error instanceof HandlerNotFoundError) {
        throw error;
      }

      // Wrap unknown errors
      throw new Error(
        `Query execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if a handler is registered for a query type
   */
  hasHandler(queryType: string): boolean {
    return this.handlers.has(queryType);
  }

  /**
   * Get all registered query types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clear all handlers (useful for testing)
   */
  clearHandlers(): void {
    this.handlers.clear();
  }
}
