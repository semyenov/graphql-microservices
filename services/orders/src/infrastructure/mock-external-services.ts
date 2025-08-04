import { createLogger } from '@graphql-microservices/logger';
import { generateId } from '@graphql-microservices/shared-errors';
import type {
  ExternalServices,
  InventoryCommand,
  PaymentCommand,
  ShippingCommand,
} from '../application/sagas/saga-manager';

// Create logger for this module
const logger = createLogger({ service: 'mock-external-services' });

/**
 * Mock inventory service for development/testing
 */
class MockInventoryService implements ExternalServices['inventoryService'] {
  private reservations = new Map<string, { orderId: string; items: any[] }>();

  async reserveInventory(command: InventoryCommand): Promise<{ reservationId: string }> {
    logger.info('Mock: Reserving inventory', { 
      orderId: command.payload.orderId,
      items: command.payload.items,
    });

    // Simulate some processing delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Simulate occasional failure (10% chance)
    if (Math.random() < 0.1) {
      throw new Error('Insufficient inventory');
    }

    const reservationId = generateId();
    this.reservations.set(reservationId, {
      orderId: command.payload.orderId,
      items: command.payload.items || [],
    });

    logger.info('Mock: Inventory reserved successfully', { 
      orderId: command.payload.orderId,
      reservationId,
    });

    return { reservationId };
  }

  async releaseReservation(command: InventoryCommand): Promise<void> {
    logger.info('Mock: Releasing inventory reservation', {
      orderId: command.payload.orderId,
      reservationId: command.payload.reservationId,
    });

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 50));

    if (command.payload.reservationId) {
      this.reservations.delete(command.payload.reservationId);
    }

    logger.info('Mock: Inventory reservation released', {
      orderId: command.payload.orderId,
    });
  }

  async confirmReservation(command: InventoryCommand): Promise<void> {
    logger.info('Mock: Confirming inventory reservation', {
      orderId: command.payload.orderId,
      reservationId: command.payload.reservationId,
    });

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 75));

    // Move from reservation to confirmed status
    if (command.payload.reservationId) {
      const reservation = this.reservations.get(command.payload.reservationId);
      if (reservation) {
        // In a real system, this would update inventory levels
        this.reservations.delete(command.payload.reservationId);
      }
    }

    logger.info('Mock: Inventory reservation confirmed', {
      orderId: command.payload.orderId,
    });
  }
}

/**
 * Mock payment service for development/testing
 */
class MockPaymentService implements ExternalServices['paymentService'] {
  private transactions = new Map<string, { orderId: string; amount: any; status: string }>();

  async processPayment(command: PaymentCommand): Promise<{ transactionId: string }> {
    logger.info('Mock: Processing payment', {
      orderId: command.payload.orderId,
      amount: command.payload.amount,
      method: command.payload.paymentMethod,
    });

    // Simulate processing delay (longer for payment)
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

    // Simulate occasional payment failure (5% chance)
    if (Math.random() < 0.05) {
      throw new Error('Payment declined');
    }

    const transactionId = `txn_${generateId()}`;
    this.transactions.set(transactionId, {
      orderId: command.payload.orderId,
      amount: command.payload.amount,
      status: 'captured',
    });

    logger.info('Mock: Payment processed successfully', {
      orderId: command.payload.orderId,
      transactionId,
      amount: command.payload.amount.amount,
    });

    return { transactionId };
  }

  async refundPayment(command: PaymentCommand): Promise<{ refundId: string }> {
    logger.info('Mock: Processing refund', {
      orderId: command.payload.orderId,
      amount: command.payload.amount,
      transactionId: command.payload.transactionId,
    });

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 150));

    // Simulate occasional refund failure (2% chance)
    if (Math.random() < 0.02) {
      throw new Error('Refund processing failed');
    }

    const refundId = `ref_${generateId()}`;
    
    // Update transaction status
    if (command.payload.transactionId) {
      const transaction = this.transactions.get(command.payload.transactionId);
      if (transaction) {
        transaction.status = 'refunded';
      }
    }

    logger.info('Mock: Refund processed successfully', {
      orderId: command.payload.orderId,
      refundId,
      amount: command.payload.amount.amount,
    });

    return { refundId };
  }
}

/**
 * Mock shipping service for development/testing
 */
class MockShippingService implements ExternalServices['shippingService'] {
  private shipments = new Map<string, { orderId: string; items: any[]; status: string }>();

  async createShipment(command: ShippingCommand): Promise<{ trackingNumber: string }> {
    logger.info('Mock: Creating shipment', {
      orderId: command.payload.orderId,
      items: command.payload.items,
    });

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // Simulate occasional shipping failure (3% chance)
    if (Math.random() < 0.03) {
      throw new Error('Shipping label creation failed');
    }

    const trackingNumber = `TRK${Date.now()}${Math.floor(Math.random() * 1000)}`;
    
    this.shipments.set(trackingNumber, {
      orderId: command.payload.orderId,
      items: command.payload.items,
      status: 'shipped',
    });

    logger.info('Mock: Shipment created successfully', {
      orderId: command.payload.orderId,
      trackingNumber,
    });

    return { trackingNumber };
  }

  async cancelShipment(command: ShippingCommand): Promise<void> {
    logger.info('Mock: Cancelling shipment', {
      orderId: command.payload.orderId,
      shipmentId: command.payload.shipmentId,
    });

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 50));

    // Find and cancel shipment
    for (const [trackingNumber, shipment] of this.shipments) {
      if (shipment.orderId === command.payload.orderId) {
        shipment.status = 'cancelled';
        logger.info('Mock: Shipment cancelled', {
          orderId: command.payload.orderId,
          trackingNumber,
        });
        break;
      }
    }
  }
}

/**
 * Create mock external services for development
 */
export function createMockExternalServices(): ExternalServices {
  return {
    inventoryService: new MockInventoryService(),
    paymentService: new MockPaymentService(),
    shippingService: new MockShippingService(),
  };
}

/**
 * Enhanced mock services with more realistic behavior
 */
export class EnhancedMockExternalServices implements ExternalServices {
  readonly inventoryService: ExternalServices['inventoryService'];
  readonly paymentService: ExternalServices['paymentService'];
  readonly shippingService: ExternalServices['shippingService'];

  constructor() {
    this.inventoryService = new MockInventoryService();
    this.paymentService = new MockPaymentService();
    this.shippingService = new MockShippingService();
  }

  /**
   * Configure failure rates for testing
   */
  setFailureRates(config: {
    inventoryFailureRate?: number;
    paymentFailureRate?: number;
    shippingFailureRate?: number;
  }): void {
    // In a real implementation, this would configure the failure rates
    logger.info('Mock services failure rates configured', config);
  }

  /**
   * Get service statistics for monitoring
   */
  getStats(): {
    inventory: { reservations: number; confirmations: number; releases: number };
    payment: { transactions: number; refunds: number };
    shipping: { shipments: number; cancellations: number };
  } {
    // In a real implementation, this would return actual statistics
    return {
      inventory: { reservations: 0, confirmations: 0, releases: 0 },
      payment: { transactions: 0, refunds: 0 },
      shipping: { shipments: 0, cancellations: 0 },
    };
  }

  /**
   * Reset all mock data
   */
  reset(): void {
    logger.info('Resetting mock external services data');
    // In a real implementation, this would clear all mock data
  }
}