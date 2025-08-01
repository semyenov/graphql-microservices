import type { ICommand, ICommandHandler, CommandResult } from './types';
import { HandlerNotFoundError, CommandValidationError, isCommand } from './types';

/**
 * Command bus for dispatching commands to their handlers
 */
export class CommandBus {
  private readonly handlers = new Map<string, ICommandHandler>();

  /**
   * Register a command handler
   */
  register<TCommand extends ICommand>(
    commandType: string | { new(...args: any[]): TCommand },
    handler: ICommandHandler<TCommand>
  ): void {
    const type = typeof commandType === 'string'
      ? commandType
      : commandType.name;

    if (this.handlers.has(type)) {
      throw new Error(`Handler already registered for command type: ${type}`);
    }

    this.handlers.set(type, handler);
  }

  /**
   * Execute a command  
   */
  async execute<TResult = any>(command: ICommand): Promise<TResult> {
    if (!isCommand(command)) {
      throw new CommandValidationError('Invalid command structure');
    }

    const handler = this.handlers.get(command.type);

    if (!handler) {
      throw new HandlerNotFoundError(command.type);
    }

    try {
      return await handler.execute(command);
    } catch (error) {
      // Re-throw known errors
      if (error instanceof CommandValidationError ||
        error instanceof HandlerNotFoundError) {
        throw error;
      }

      // Wrap unknown errors
      throw new Error(
        `Command execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Execute a command and return a standardized result
   */
  async executeWithResult<TData = any>(
    command: ICommand
  ): Promise<CommandResult<TData>> {
    try {
      const data = await this.execute<TData>(command);
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if a handler is registered for a command type
   */
  hasHandler(commandType: string): boolean {
    return this.handlers.has(commandType);
  }

  /**
   * Get all registered command types
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