/**
 * Shared Domain Layer
 *
 * This module provides shared domain value objects, events, and utilities
 * that can be used across all microservices to ensure consistency and
 * reduce code duplication.
 */

// Re-export from event-sourcing package for convenience
export type {
  AggregateRoot,
  IDomainEvent,
  IEventStore,
  IStoredEvent,
} from '@graphql-microservices/event-sourcing';
// Domain Events
export {
  type DomainEventEnvelope,
  DomainEventFactory,
  type DomainEventHandler,
  type DomainEventMetadata,
  type DomainEventPublisher,
  type DomainEventQuery,
  type DomainEventSubscriber,
  type DomainEventType,
  DomainEventUtils,
  type EnhancedDomainEvent,
  type EventProcessingResult,
} from './events/domain-event';
// Value Objects
export { Email } from './value-objects/email';
export { Money } from './value-objects/money';
export { PhoneNumber } from './value-objects/phone-number';

/**
 * Common Domain Patterns and Utilities
 */

/**
 * Base specification interface for business rules
 */
export interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
  and(other: Specification<T>): Specification<T>;
  or(other: Specification<T>): Specification<T>;
  not(): Specification<T>;
}

/**
 * Abstract specification implementation
 */
export abstract class AbstractSpecification<T> implements Specification<T> {
  abstract isSatisfiedBy(candidate: T): boolean;

  and(other: Specification<T>): Specification<T> {
    return new AndSpecification(this, other);
  }

  or(other: Specification<T>): Specification<T> {
    return new OrSpecification(this, other);
  }

  not(): Specification<T> {
    return new NotSpecification(this);
  }
}

/**
 * And specification combinator
 */
export class AndSpecification<T> extends AbstractSpecification<T> {
  constructor(
    private left: Specification<T>,
    private right: Specification<T>
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.left.isSatisfiedBy(candidate) && this.right.isSatisfiedBy(candidate);
  }
}

/**
 * Or specification combinator
 */
export class OrSpecification<T> extends AbstractSpecification<T> {
  constructor(
    private left: Specification<T>,
    private right: Specification<T>
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.left.isSatisfiedBy(candidate) || this.right.isSatisfiedBy(candidate);
  }
}

/**
 * Not specification combinator
 */
export class NotSpecification<T> extends AbstractSpecification<T> {
  constructor(private spec: Specification<T>) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return !this.spec.isSatisfiedBy(candidate);
  }
}

/**
 * Modern Repository interface pattern with Result types
 */
export interface Repository<T, ID> {
  findById(
    id: ID
  ): Promise<
    import('@graphql-microservices/shared-result').Result<
      T | null,
      import('@graphql-microservices/shared-result').DomainError
    >
  >;
  save(
    entity: T
  ): Promise<
    import('@graphql-microservices/shared-result').Result<
      void,
      import('@graphql-microservices/shared-result').DomainError
    >
  >;
  delete(
    id: ID
  ): Promise<
    import('@graphql-microservices/shared-result').Result<
      void,
      import('@graphql-microservices/shared-result').DomainError
    >
  >;
  findAll(): Promise<
    import('@graphql-microservices/shared-result').Result<
      T[],
      import('@graphql-microservices/shared-result').DomainError
    >
  >;
  exists(
    id: ID
  ): Promise<
    import('@graphql-microservices/shared-result').Result<
      boolean,
      import('@graphql-microservices/shared-result').DomainError
    >
  >;
}

/**
 * Legacy Repository interface for backward compatibility
 * @deprecated Use Repository<T, ID> instead
 */
export interface LegacyRepository<T, ID> {
  findById(id: ID): Promise<T | null>;
  save(entity: T): Promise<void>;
  delete(id: ID): Promise<void>;
  findAll(): Promise<T[]>;
}

/**
 * Modern Unit of Work pattern interface with Result types
 */
export interface UnitOfWork {
  begin(): Promise<
    import('@graphql-microservices/shared-result').Result<
      void,
      import('@graphql-microservices/shared-result').DomainError
    >
  >;
  commit(): Promise<
    import('@graphql-microservices/shared-result').Result<
      void,
      import('@graphql-microservices/shared-result').DomainError
    >
  >;
  rollback(): Promise<
    import('@graphql-microservices/shared-result').Result<
      void,
      import('@graphql-microservices/shared-result').DomainError
    >
  >;
  isActive(): boolean;
  getTransactionId(): string;
}

/**
 * Legacy Unit of Work interface for backward compatibility
 * @deprecated Use UnitOfWork instead
 */
export interface LegacyUnitOfWork {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  isActive(): boolean;
}

/**
 * Domain Service interface
 */
export interface DomainService {
  readonly name: string;
}

/**
 * Entity base class
 */
export abstract class Entity<ID> {
  protected constructor(protected readonly id: ID) {}

  getId(): ID {
    return this.id;
  }

  equals(other: Entity<ID>): boolean {
    if (this === other) return true;
    if (other === null || other === undefined) return false;
    if (this.constructor !== other.constructor) return false;
    return this.id === other.getId();
  }

  hashCode(): string {
    return `${this.constructor.name}:${String(this.id)}`;
  }
}

/**
 * Value Object base class
 */
export abstract class ValueObject {
  abstract equals(other: ValueObject): boolean;

  hashCode(): string {
    return JSON.stringify(this);
  }
}

/**
 * Common domain exceptions
 */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class BusinessRuleViolationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'BUSINESS_RULE_VIOLATION', details);
    this.name = 'BusinessRuleViolationError';
  }
}

export class ConcurrencyError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONCURRENCY_ERROR', details);
    this.name = 'ConcurrencyError';
  }
}

/**
 * Domain utilities
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Generate a domain event ID
 */
export function generateEventId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a correlation ID
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Create a timestamp
 */
export function now(): Date {
  return new Date();
}

/**
 * Check if date is in the past
 */
export function isInPast(date: Date): boolean {
  return date < new Date();
}

/**
 * Check if date is in the future
 */
export function isInFuture(date: Date): boolean {
  return date > new Date();
}

/**
 * Calculate age in years
 */
export function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

/**
 * Sanitize string for domain use
 */
export function sanitizeString(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

/**
 * Validate required string
 */
export function validateRequiredString(value: string, fieldName: string): void {
  if (isEmpty(value)) {
    throw new BusinessRuleViolationError(`${fieldName} is required`);
  }
}

/**
 * Validate string length
 */
export function validateStringLength(
  value: string,
  fieldName: string,
  minLength: number,
  maxLength: number
): void {
  if (value.length < minLength || value.length > maxLength) {
    throw new BusinessRuleViolationError(
      `${fieldName} must be between ${minLength} and ${maxLength} characters`,
      { actualLength: value.length, minLength, maxLength }
    );
  }
}

/**
 * Validate numeric range
 */
export function validateNumericRange(
  value: number,
  fieldName: string,
  min: number,
  max: number
): void {
  if (value < min || value > max) {
    throw new BusinessRuleViolationError(`${fieldName} must be between ${min} and ${max}`, {
      actualValue: value,
      min,
      max,
    });
  }
}

/**
 * Deep clone object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Generate slug from string
 */
export function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

/**
 * Normalize email address
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Extract domain from email
 */
export function extractEmailDomain(email: string): string {
  const normalized = normalizeEmail(email);
  const parts = normalized.split('@');
  return parts[1] || '';
}

/**
 * Common business rule specifications
 */
export class EmailFormatSpecification extends AbstractSpecification<string> {
  isSatisfiedBy(email: string): boolean {
    // Note: Email.isValid is not available, using basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

export class PhoneNumberFormatSpecification extends AbstractSpecification<string> {
  constructor(private defaultCountryCode: string = 'US') {
    super();
  }

  isSatisfiedBy(phoneNumber: string): boolean {
    // Note: PhoneNumber.isValid is not available, using basic validation
    const phoneRegex = /^[+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phoneNumber.replace(/\D/g, ''));
  }
}

export class NonEmptyStringSpecification extends AbstractSpecification<string> {
  isSatisfiedBy(value: string): boolean {
    return !isEmpty(value);
  }
}

export class StringLengthSpecification extends AbstractSpecification<string> {
  constructor(
    private minLength: number,
    private maxLength: number
  ) {
    super();
  }

  isSatisfiedBy(value: string): boolean {
    return value.length >= this.minLength && value.length <= this.maxLength;
  }
}

export class PositiveNumberSpecification extends AbstractSpecification<number> {
  isSatisfiedBy(value: number): boolean {
    return value > 0;
  }
}

export class NonNegativeNumberSpecification extends AbstractSpecification<number> {
  isSatisfiedBy(value: number): boolean {
    return value >= 0;
  }
}

export class NumericRangeSpecification extends AbstractSpecification<number> {
  constructor(
    private min: number,
    private max: number
  ) {
    super();
  }

  isSatisfiedBy(value: number): boolean {
    return value >= this.min && value <= this.max;
  }
}

/**
 * Export types for TypeScript
 */
export type DomainEntity<ID = string> = Entity<ID>;
export type DomainValueObject = ValueObject;
export type DomainSpecification<T> = Specification<T>;
export type DomainRepository<T, ID = string> = Repository<T, ID>;
export type DomainUnitOfWork = UnitOfWork;
