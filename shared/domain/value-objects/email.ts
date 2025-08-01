import { ValidationError } from '@graphql-microservices/shared-errors';

/**
 * Email value object with validation and normalization
 */
export class Email {
  private readonly value: string;

  constructor(email: string) {
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required', [
        { field: 'email', message: 'Must be a non-empty string', value: email },
      ]);
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedEmail.length === 0) {
      throw new ValidationError('Email cannot be empty', [
        { field: 'email', message: 'Must not be empty after trimming', value: email },
      ]);
    }

    if (normalizedEmail.length > 254) {
      throw new ValidationError('Email is too long', [
        { field: 'email', message: 'Must be 254 characters or less', value: email },
      ]);
    }

    // RFC 5322 compliant email regex (simplified but comprehensive)
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    if (!emailRegex.test(normalizedEmail)) {
      throw new ValidationError('Invalid email format', [
        { field: 'email', message: 'Must be a valid email address', value: email },
      ]);
    }

    // Additional business rules
    this.validateBusinessRules(normalizedEmail);

    this.value = normalizedEmail;
  }

  /**
   * Additional business validation rules
   */
  private validateBusinessRules(email: string): void {
    const [localPart, domain] = email.split('@');

    // Check local part length (before @)
    if (localPart && localPart.length > 64) {
      throw new ValidationError('Email local part is too long', [
        { field: 'email', message: 'Local part must be 64 characters or less', value: email },
      ]);
    }

    // Check for consecutive dots
    if (email.includes('..')) {
      throw new ValidationError('Email contains consecutive dots', [
        { field: 'email', message: 'Cannot contain consecutive dots', value: email },
      ]);
    }

    // Check for dots at start or end of local part
    if (localPart && (localPart.startsWith('.') || localPart.endsWith('.'))) {
      throw new ValidationError('Email local part cannot start or end with a dot', [
        { field: 'email', message: 'Local part cannot start or end with a dot', value: email },
      ]);
    }

    // Block common disposable email domains (optional business rule)
    if (domain && this.isDisposableEmailDomain(domain)) {
      throw new ValidationError('Disposable email addresses are not allowed', [
        { field: 'email', message: 'Please use a permanent email address', value: email },
      ]);
    }

    // Block certain domains (configurable business rule)
    if (domain && this.isBlockedDomain(domain)) {
      throw new ValidationError('Email domain is not allowed', [
        { field: 'email', message: 'This email domain is not permitted', value: email },
      ]);
    }
  }

  /**
   * Check if domain is a known disposable email provider
   */
  private isDisposableEmailDomain(domain: string): boolean {
    const disposableDomains = new Set([
      '10minutemail.com',
      'guerrillamail.com',
      'mailinator.com',
      'tempmail.org',
      'yopmail.com',
      'throwaway.email',
      'getnada.com',
      'temp-mail.org',
      'sharklasers.com',
      'maildrop.cc',
    ]);

    return disposableDomains.has(domain.toLowerCase());
  }

  /**
   * Check if domain is blocked by business rules
   */
  private isBlockedDomain(domain: string): boolean {
    // This could be configured externally in a real application
    const blockedDomains = new Set(['example.com', 'test.com', 'blocked.com']);

    return blockedDomains.has(domain.toLowerCase());
  }

  getValue(): string {
    return this.value;
  }

  /**
   * Get the local part (before @)
   */
  getLocalPart(): string {
    return this.value.split('@')[0] || '';
  }

  /**
   * Get the domain part (after @)
   */
  getDomain(): string {
    return this.value.split('@')[1] || '';
  }

  /**
   * Get domain without subdomains
   */
  getRootDomain(): string {
    const domain = this.getDomain();
    const parts = domain.split('.');

    if (parts.length >= 2) {
      // Return last two parts (e.g., "example.com" from "mail.example.com")
      return parts.slice(-2).join('.');
    }

    return domain;
  }

  /**
   * Check if email is from a specific domain
   */
  isFromDomain(domain: string): boolean {
    return this.getDomain() === domain.toLowerCase();
  }

  /**
   * Check if email is from any of the specified domains
   */
  isFromAnyDomain(domains: string[]): boolean {
    const emailDomain = this.getDomain();
    return domains.some((domain) => domain.toLowerCase() === emailDomain);
  }

  /**
   * Get a masked version for display (e.g., "j***@example.com")
   */
  getMasked(): string {
    const localPart = this.getLocalPart();
    const domain = this.getDomain();

    if (localPart.length <= 1) {
      return `${localPart}***@${domain}`;
    }

    const firstChar = localPart[0];
    const maskedLocal = `${firstChar}${'*'.repeat(Math.min(localPart.length - 1, 3))}`;

    return `${maskedLocal}@${domain}`;
  }

  /**
   * Check if this email equals another email
   */
  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }

  /**
   * Create Email from string
   */
  static fromString(email: string): Email {
    return new Email(email);
  }

  /**
   * Validate email string without creating instance
   */
  static isValid(email: string): boolean {
    try {
      new Email(email);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Normalize email string (lowercase, trim)
   */
  static normalize(email: string): string {
    if (!email || typeof email !== 'string') {
      return '';
    }
    return email.trim().toLowerCase();
  }

  /**
   * Extract domain from email string
   */
  static extractDomain(email: string): string {
    const normalized = Email.normalize(email);
    const parts = normalized.split('@');
    return parts[1] || '';
  }

  /**
   * Check if two email strings are the same (after normalization)
   */
  static areEqual(email1: string, email2: string): boolean {
    return Email.normalize(email1) === Email.normalize(email2);
  }

  /**
   * Generate a hash for email (for privacy-preserving operations)
   */
  getHash(): string {
    // Simple hash implementation - in production, use a proper hashing library
    let hash = 0;
    const str = this.value;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36);
  }

  /**
   * Check if email is likely a personal email (vs corporate)
   */
  isPersonalEmail(): boolean {
    const personalDomains = new Set([
      'gmail.com',
      'yahoo.com',
      'hotmail.com',
      'outlook.com',
      'icloud.com',
      'protonmail.com',
      'aol.com',
      'mail.com',
      'yandex.com',
      'zoho.com',
    ]);

    return personalDomains.has(this.getDomain());
  }

  /**
   * Check if email is from a major email provider
   */
  isFromMajorProvider(): boolean {
    const majorProviders = new Set([
      'gmail.com',
      'yahoo.com',
      'hotmail.com',
      'outlook.com',
      'icloud.com',
      'live.com',
      'msn.com',
      'aol.com',
      'protonmail.com',
      'mail.com',
    ]);

    return majorProviders.has(this.getDomain());
  }

  /**
   * Suggest corrections for common typos
   */
  suggestCorrections(): string[] {
    const domain = this.getDomain();
    const suggestions: string[] = [];

    // Common domain typos
    const domainCorrections = new Map([
      ['gamil.com', 'gmail.com'],
      ['gmai.com', 'gmail.com'],
      ['gmial.com', 'gmail.com'],
      ['yahooo.com', 'yahoo.com'],
      ['yaho.com', 'yahoo.com'],
      ['hotmial.com', 'hotmail.com'],
      ['hotmil.com', 'hotmail.com'],
      ['outlok.com', 'outlook.com'],
      ['outloo.com', 'outlook.com'],
    ]);

    const correction = domainCorrections.get(domain);
    if (correction) {
      suggestions.push(`${this.getLocalPart()}@${correction}`);
    }

    return suggestions;
  }
}
