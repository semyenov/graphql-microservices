import { ValidationError } from '@graphql-microservices/shared-errors';

/**
 * Phone Number value object with international format support
 */
export class PhoneNumber {
  private readonly value: string; // Stored in E.164 format (+1234567890)
  private readonly countryCode: string;
  private readonly nationalNumber: string;

  constructor(phoneNumber: string, defaultCountryCode: string = 'US') {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      throw new ValidationError('Phone number is required', [
        { field: 'phoneNumber', message: 'Must be a non-empty string', value: phoneNumber },
      ]);
    }

    const cleaned = this.cleanPhoneNumber(phoneNumber);
    const parsed = this.parsePhoneNumber(cleaned, defaultCountryCode);

    this.validatePhoneNumber(parsed.fullNumber);

    this.value = parsed.fullNumber;
    this.countryCode = parsed.countryCode;
    this.nationalNumber = parsed.nationalNumber;
  }

  /**
   * Clean phone number by removing non-digit characters except +
   */
  private cleanPhoneNumber(phoneNumber: string): string {
    return phoneNumber.replace(/[^\d+]/g, '');
  }

  /**
   * Parse phone number into components
   */
  private parsePhoneNumber(
    cleaned: string,
    defaultCountryCode: string
  ): {
    fullNumber: string;
    countryCode: string;
    nationalNumber: string;
  } {
    // If starts with +, it's already in international format
    if (cleaned.startsWith('+')) {
      const withoutPlus = cleaned.slice(1);

      // Determine country code based on length and patterns
      for (const [code, info] of this.getCountryCodes()) {
        if (withoutPlus.startsWith(code)) {
          const nationalNumber = withoutPlus.slice(code.length);
          const totalExpectedLength = code.length + info.nationalLength;

          if (withoutPlus.length === totalExpectedLength) {
            return {
              fullNumber: cleaned,
              countryCode: code,
              nationalNumber: nationalNumber,
            };
          }
        }
      }

      throw new ValidationError('Invalid international phone number format');
    }

    // Handle numbers without country code
    const countryInfo = this.getCountryInfo(defaultCountryCode);
    if (!countryInfo) {
      throw new ValidationError(`Unsupported default country code: ${defaultCountryCode}`);
    }

    // If number length matches national format
    if (cleaned.length === countryInfo.nationalLength) {
      return {
        fullNumber: `+${countryInfo.code}${cleaned}`,
        countryCode: countryInfo.code,
        nationalNumber: cleaned,
      };
    }

    // If number includes country code but no +
    if (
      cleaned.startsWith(countryInfo.code) &&
      cleaned.length === countryInfo.code.length + countryInfo.nationalLength
    ) {
      const nationalNumber = cleaned.slice(countryInfo.code.length);
      return {
        fullNumber: `+${cleaned}`,
        countryCode: countryInfo.code,
        nationalNumber: nationalNumber,
      };
    }

    throw new ValidationError('Invalid phone number format', [
      { field: 'phoneNumber', message: 'Must be a valid phone number', value: cleaned },
    ]);
  }

  /**
   * Validate the complete phone number
   */
  private validatePhoneNumber(fullNumber: string): void {
    // Must be in E.164 format: + followed by up to 15 digits
    if (!/^\+\d{7,15}$/.test(fullNumber)) {
      throw new ValidationError('Invalid phone number format', [
        {
          field: 'phoneNumber',
          message: 'Must be in valid international format',
          value: fullNumber,
        },
      ]);
    }

    // Check minimum and maximum lengths
    if (fullNumber.length < 8) {
      // + and at least 7 digits
      throw new ValidationError('Phone number too short', [
        { field: 'phoneNumber', message: 'Must be at least 7 digits', value: fullNumber },
      ]);
    }

    if (fullNumber.length > 16) {
      // + and at most 15 digits
      throw new ValidationError('Phone number too long', [
        { field: 'phoneNumber', message: 'Must be at most 15 digits', value: fullNumber },
      ]);
    }
  }

  /**
   * Get country codes and their info
   */
  private getCountryCodes(): Map<string, { nationalLength: number; countryName: string }> {
    return new Map([
      ['1', { nationalLength: 10, countryName: 'United States/Canada' }],
      ['44', { nationalLength: 10, countryName: 'United Kingdom' }],
      ['49', { nationalLength: 11, countryName: 'Germany' }],
      ['33', { nationalLength: 9, countryName: 'France' }],
      ['39', { nationalLength: 10, countryName: 'Italy' }],
      ['34', { nationalLength: 9, countryName: 'Spain' }],
      ['31', { nationalLength: 9, countryName: 'Netherlands' }],
      ['32', { nationalLength: 9, countryName: 'Belgium' }],
      ['41', { nationalLength: 9, countryName: 'Switzerland' }],
      ['43', { nationalLength: 11, countryName: 'Austria' }],
      ['45', { nationalLength: 8, countryName: 'Denmark' }],
      ['46', { nationalLength: 9, countryName: 'Sweden' }],
      ['47', { nationalLength: 8, countryName: 'Norway' }],
      ['358', { nationalLength: 9, countryName: 'Finland' }],
      ['61', { nationalLength: 9, countryName: 'Australia' }],
      ['64', { nationalLength: 9, countryName: 'New Zealand' }],
      ['81', { nationalLength: 10, countryName: 'Japan' }],
      ['82', { nationalLength: 10, countryName: 'South Korea' }],
      ['86', { nationalLength: 11, countryName: 'China' }],
      ['91', { nationalLength: 10, countryName: 'India' }],
      ['55', { nationalLength: 11, countryName: 'Brazil' }],
      ['52', { nationalLength: 10, countryName: 'Mexico' }],
      ['7', { nationalLength: 10, countryName: 'Russia' }],
    ]);
  }

  /**
   * Get country info by country code
   */
  private getCountryInfo(
    countryCode: string
  ): { code: string; nationalLength: number; countryName: string } | null {
    const countryMap = new Map([
      ['US', { code: '1', nationalLength: 10, countryName: 'United States' }],
      ['CA', { code: '1', nationalLength: 10, countryName: 'Canada' }],
      ['GB', { code: '44', nationalLength: 10, countryName: 'United Kingdom' }],
      ['DE', { code: '49', nationalLength: 11, countryName: 'Germany' }],
      ['FR', { code: '33', nationalLength: 9, countryName: 'France' }],
      ['IT', { code: '39', nationalLength: 10, countryName: 'Italy' }],
      ['ES', { code: '34', nationalLength: 9, countryName: 'Spain' }],
      ['NL', { code: '31', nationalLength: 9, countryName: 'Netherlands' }],
      ['BE', { code: '32', nationalLength: 9, countryName: 'Belgium' }],
      ['CH', { code: '41', nationalLength: 9, countryName: 'Switzerland' }],
      ['AT', { code: '43', nationalLength: 11, countryName: 'Austria' }],
      ['DK', { code: '45', nationalLength: 8, countryName: 'Denmark' }],
      ['SE', { code: '46', nationalLength: 9, countryName: 'Sweden' }],
      ['NO', { code: '47', nationalLength: 8, countryName: 'Norway' }],
      ['FI', { code: '358', nationalLength: 9, countryName: 'Finland' }],
      ['AU', { code: '61', nationalLength: 9, countryName: 'Australia' }],
      ['NZ', { code: '64', nationalLength: 9, countryName: 'New Zealand' }],
      ['JP', { code: '81', nationalLength: 10, countryName: 'Japan' }],
      ['KR', { code: '82', nationalLength: 10, countryName: 'South Korea' }],
      ['CN', { code: '86', nationalLength: 11, countryName: 'China' }],
      ['IN', { code: '91', nationalLength: 10, countryName: 'India' }],
      ['BR', { code: '55', nationalLength: 11, countryName: 'Brazil' }],
      ['MX', { code: '52', nationalLength: 10, countryName: 'Mexico' }],
      ['RU', { code: '7', nationalLength: 10, countryName: 'Russia' }],
    ]);

    return countryMap.get(countryCode.toUpperCase()) || null;
  }

  /**
   * Get phone number in E.164 format (+1234567890)
   */
  getValue(): string {
    return this.value;
  }

  /**
   * Get country code (without +)
   */
  getCountryCode(): string {
    return this.countryCode;
  }

  /**
   * Get national number (without country code)
   */
  getNationalNumber(): string {
    return this.nationalNumber;
  }

  /**
   * Get country name
   */
  getCountryName(): string {
    const countryCodes = this.getCountryCodes();
    return countryCodes.get(this.countryCode)?.countryName || 'Unknown';
  }

  /**
   * Format for display in national format
   */
  toNationalFormat(): string {
    switch (this.countryCode) {
      case '1': // US/Canada
        if (this.nationalNumber.length === 10) {
          return `(${this.nationalNumber.slice(0, 3)}) ${this.nationalNumber.slice(3, 6)}-${this.nationalNumber.slice(6)}`;
        }
        break;
      case '44': // UK
        if (this.nationalNumber.length === 10) {
          return `${this.nationalNumber.slice(0, 4)} ${this.nationalNumber.slice(4, 7)} ${this.nationalNumber.slice(7)}`;
        }
        break;
      case '49': // Germany
        if (this.nationalNumber.length === 11) {
          return `${this.nationalNumber.slice(0, 3)} ${this.nationalNumber.slice(3, 6)} ${this.nationalNumber.slice(6)}`;
        }
        break;
      case '33': // France
        if (this.nationalNumber.length === 9) {
          return `${this.nationalNumber.slice(0, 2)} ${this.nationalNumber.slice(2, 4)} ${this.nationalNumber.slice(4, 6)} ${this.nationalNumber.slice(6, 8)} ${this.nationalNumber.slice(8)}`;
        }
        break;
    }

    // Default formatting for unsupported formats
    return this.nationalNumber.replace(/(\d{3})(\d{3})(\d+)/, '$1 $2 $3');
  }

  /**
   * Format for display in international format
   */
  toInternationalFormat(): string {
    return `+${this.countryCode} ${this.toNationalFormat()}`;
  }

  /**
   * Get masked version for display
   */
  getMasked(): string {
    const national = this.toNationalFormat();
    const length = national.length;

    if (length <= 4) {
      return '*'.repeat(length);
    }

    // Show first 2 and last 2 characters, mask the middle
    const start = national.slice(0, 2);
    const end = national.slice(-2);
    const middle = '*'.repeat(length - 4);

    return `${start}${middle}${end}`;
  }

  /**
   * Check if this phone number equals another
   */
  equals(other: PhoneNumber): boolean {
    return this.value === other.value;
  }

  /**
   * Check if phone number is mobile (basic heuristic)
   */
  isMobile(): boolean {
    // This is a simplified implementation
    // In practice, you'd use a more comprehensive mobile number database
    switch (this.countryCode) {
      case '1': {
        // US/Canada - very simplified
        const firstDigit = this.nationalNumber[0];
        return ['2', '3', '4', '5', '6', '7', '8', '9'].includes(firstDigit || '');
      }
      case '44': // UK
        return this.nationalNumber.startsWith('7');
      case '49': // Germany
        return ['15', '16', '17'].some((prefix) => this.nationalNumber.startsWith(prefix));
      case '33': // France
        return this.nationalNumber.startsWith('6') || this.nationalNumber.startsWith('7');
      default:
        return false; // Unknown, assume landline
    }
  }

  /**
   * Check if phone number is landline
   */
  isLandline(): boolean {
    return !this.isMobile();
  }

  /**
   * Get timezone info (basic implementation)
   */
  getTimezoneInfo(): { timezone: string; offset: string } | null {
    const timezoneMap = new Map([
      ['1', { timezone: 'America/New_York', offset: 'UTC-5/-4' }],
      ['44', { timezone: 'Europe/London', offset: 'UTC+0/+1' }],
      ['49', { timezone: 'Europe/Berlin', offset: 'UTC+1/+2' }],
      ['33', { timezone: 'Europe/Paris', offset: 'UTC+1/+2' }],
      ['39', { timezone: 'Europe/Rome', offset: 'UTC+1/+2' }],
      ['81', { timezone: 'Asia/Tokyo', offset: 'UTC+9' }],
      ['86', { timezone: 'Asia/Shanghai', offset: 'UTC+8' }],
      ['61', { timezone: 'Australia/Sydney', offset: 'UTC+10/+11' }],
    ]);

    return timezoneMap.get(this.countryCode) || null;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }

  /**
   * Create PhoneNumber from string
   */
  static fromString(phoneNumber: string, defaultCountryCode: string = 'US'): PhoneNumber {
    return new PhoneNumber(phoneNumber, defaultCountryCode);
  }

  /**
   * Validate phone number string without creating instance
   */
  static isValid(phoneNumber: string, defaultCountryCode: string = 'US'): boolean {
    try {
      new PhoneNumber(phoneNumber, defaultCountryCode);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse and format phone number string
   */
  static format(
    phoneNumber: string,
    format: 'international' | 'national' | 'e164' = 'national',
    defaultCountryCode: string = 'US'
  ): string {
    try {
      const phone = new PhoneNumber(phoneNumber, defaultCountryCode);

      switch (format) {
        case 'international':
          return phone.toInternationalFormat();
        case 'national':
          return phone.toNationalFormat();
        case 'e164':
          return phone.getValue();
        default:
          return phone.toNationalFormat();
      }
    } catch {
      return phoneNumber; // Return original if parsing fails
    }
  }

  /**
   * Extract country code from phone number
   */
  static extractCountryCode(phoneNumber: string): string {
    try {
      const phone = new PhoneNumber(phoneNumber);
      return phone.getCountryCode();
    } catch {
      return '';
    }
  }

  /**
   * Check if two phone numbers are the same
   */
  static areEqual(phone1: string, phone2: string, defaultCountryCode: string = 'US'): boolean {
    try {
      const p1 = new PhoneNumber(phone1, defaultCountryCode);
      const p2 = new PhoneNumber(phone2, defaultCountryCode);
      return p1.equals(p2);
    } catch {
      return false;
    }
  }

  /**
   * Generate SMS-friendly format
   */
  toSMSFormat(): string {
    return this.value; // E.164 format is best for SMS
  }

  /**
   * Generate tel: URI for click-to-call
   */
  toTelURI(): string {
    return `tel:${this.value}`;
  }
}
