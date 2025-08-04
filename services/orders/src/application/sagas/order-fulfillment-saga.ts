import type {
  AsyncResult,
  DomainError,
  ICommand,
  IDomainEvent,
} from '@graphql-microservices/event-sourcing';
import { createLogger } from '@graphql-microservices/logger';
import { generateId } from '@graphql-microservices/shared-errors';
import { domainError, Result, validationError } from '@graphql-microservices/shared-result';
import type {
  OrderCancelledEvent,
  OrderCreatedEvent,
  OrderPaymentUpdatedEvent,
  OrderShippingUpdatedEvent,
} from '../../domain/order-aggregate';
import type { PrismaClient } from '../../generated/prisma';
import type { OrderCommandBus } from '../commands/command-bus';

// Create logger for this module
const logger = createLogger({ service: 'order-fulfillment-saga' });

/**
 * Saga state for tracking workflow progress
 */
export type SagaState =
  | 'STARTED'
  | 'PAYMENT_PENDING'
  | 'INVENTORY_RESERVED'
  | 'PAYMENT_PROCESSED'
  | 'FULFILLMENT_STARTED'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'COMPENSATING'
  | 'FAILED';

/**
 * Saga data for storing workflow context
 */
export interface OrderFulfillmentSagaData {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerId: string;
  readonly items: Array<{
    productId: string;
    quantity: number;
    unitPrice: { amount: number; currency: string };
  }>;
  readonly totalAmount: { amount: number; currency: string };
  readonly reservationId?: string;
  readonly paymentTransactionId?: string;
  readonly shippingTrackingNumber?: string;
  readonly compensationActions: string[];
  readonly retryCount: number;
  readonly lastError?: string;
}

/**
 * Saga instance with state management
 */
export interface SagaInstance {
  readonly id: string;
  readonly orderId: string;
  readonly state: SagaState;
  readonly data: OrderFulfillmentSagaData;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
}

/**
 * External service commands that the saga can issue
 */
export interface InventoryCommand extends ICommand {
  type: 'ReserveInventory' | 'ReleaseReservation' | 'ConfirmReservation';
  payload: {
    orderId: string;
    items?: Array<{ productId: string; quantity: number }>;
    reservationId?: string;
  };
}

export interface PaymentCommand extends ICommand {
  type: 'ProcessPayment' | 'RefundPayment';
  payload: {
    orderId: string;
    amount: { amount: number; currency: string };
    paymentMethod: string;
    transactionId?: string;
  };
}

export interface ShippingCommand extends ICommand {
  type: 'CreateShipment' | 'CancelShipment';
  payload: {
    orderId: string;
    items: Array<{ productId: string; quantity: number }>;
    shippingAddress: any;
    shipmentId?: string;
  };
}

/**
 * External service interfaces for saga coordination
 */
export interface ExternalServices {
  readonly inventoryService: {
    reserveInventory(command: InventoryCommand): Promise<{ reservationId: string }>;
    releaseReservation(command: InventoryCommand): Promise<void>;
    confirmReservation(command: InventoryCommand): Promise<void>;
  };
  readonly paymentService: {
    processPayment(command: PaymentCommand): Promise<{ transactionId: string }>;
    refundPayment(command: PaymentCommand): Promise<{ refundId: string }>;
  };
  readonly shippingService: {
    createShipment(command: ShippingCommand): Promise<{ trackingNumber: string }>;
    cancelShipment(command: ShippingCommand): Promise<void>;
  };
}

/**
 * Order Fulfillment Saga - Orchestrates the complete order fulfillment workflow
 */
export class OrderFulfillmentSaga {
  private readonly logger = createLogger({ service: 'order-fulfillment-saga' });

  constructor(
    private readonly prisma: PrismaClient,
    private readonly commandBus: OrderCommandBus,
    private readonly externalServices: ExternalServices
  ) {}

  /**
   * Start a new saga instance for an order
   */
  async startSaga(event: OrderCreatedEvent): AsyncResult<SagaInstance, DomainError> {
    this.logger.info('Starting order fulfillment saga', { orderId: event.aggregateId });

    try {
      // Validate event data
      const validationResult = this.validateOrderCreatedEvent(event);
      if (Result.isErr(validationResult)) {
        return validationResult;
      }

      // Create saga instance
      const sagaId = generateId();
      const sagaData: OrderFulfillmentSagaData = {
        orderId: event.aggregateId,
        orderNumber: event.data.orderNumber,
        customerId: event.data.customerId,
        items: event.data.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        totalAmount: event.data.totalAmount,
        compensationActions: [],
        retryCount: 0,
      };

      const sagaInstance = await this.createSagaInstance(sagaId, sagaData);
      if (Result.isErr(sagaInstance)) {
        return sagaInstance;
      }

      // Execute first step: Reserve inventory
      const reserveResult = await this.reserveInventory(sagaInstance.value);
      if (Result.isErr(reserveResult)) {
        await this.handleSagaFailure(sagaInstance.value, reserveResult.error);
        return reserveResult;
      }

      this.logger.info('Order fulfillment saga started successfully', {
        sagaId,
        orderId: event.aggregateId,
      });

      return sagaInstance;
    } catch (error) {
      this.logger.error('Failed to start order fulfillment saga', error as Error);
      return Result.err(
        domainError('SAGA_START_FAILED', 'Failed to start order fulfillment saga', error)
      );
    }
  }

  /**
   * Handle payment processed event
   */
  async handlePaymentProcessed(event: OrderPaymentUpdatedEvent): AsyncResult<void, DomainError> {
    const saga = await this.getSagaByOrderId(event.aggregateId);
    if (Result.isErr(saga) || !saga.value) {
      return Result.ok(undefined); // Saga might not exist for this order
    }

    if (saga.value.state !== 'PAYMENT_PENDING') {
      this.logger.warn('Received payment event but saga not in PAYMENT_PENDING state', {
        orderId: event.aggregateId,
        currentState: saga.value.state,
      });
      return Result.ok(undefined);
    }

    if (event.data.paymentInfo.status === 'captured') {
      return await this.processPaymentSuccess(saga.value, event.data.paymentInfo.transactionId);
    } else {
      return await this.processPaymentFailure(saga.value, 'Payment was not captured');
    }
  }

  /**
   * Handle order cancelled event
   */
  async handleOrderCancelled(event: OrderCancelledEvent): AsyncResult<void, DomainError> {
    const saga = await this.getSagaByOrderId(event.aggregateId);
    if (Result.isErr(saga) || !saga.value) {
      return Result.ok(undefined);
    }

    return await this.compensateSaga(saga.value, 'Order was cancelled');
  }

  /**
   * Handle shipping updated event
   */
  async handleShippingUpdated(event: OrderShippingUpdatedEvent): AsyncResult<void, DomainError> {
    const saga = await this.getSagaByOrderId(event.aggregateId);
    if (Result.isErr(saga) || !saga.value) {
      return Result.ok(undefined);
    }

    if (saga.value.state !== 'FULFILLMENT_STARTED') {
      return Result.ok(undefined);
    }

    if (event.data.trackingNumber) {
      return await this.completeShipping(saga.value, event.data.trackingNumber);
    }

    return Result.ok(undefined);
  }

  /**
   * Step 1: Reserve inventory
   */
  private async reserveInventory(saga: SagaInstance): AsyncResult<void, DomainError> {
    this.logger.info('Reserving inventory for order', { orderId: saga.orderId });

    try {
      const reserveCommand: InventoryCommand = {
        id: generateId(),
        type: 'ReserveInventory',
        payload: {
          orderId: saga.orderId,
          items: saga.data.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
        metadata: {
          source: 'order-fulfillment-saga',
          correlationId: saga.id,
        },
        createdAt: new Date(),
      };

      const result = await this.externalServices.inventoryService.reserveInventory(reserveCommand);

      // Update saga state
      const updatedData: OrderFulfillmentSagaData = {
        ...saga.data,
        reservationId: result.reservationId,
        compensationActions: [...saga.data.compensationActions, 'RELEASE_INVENTORY'],
      };

      await this.updateSagaState(saga.id, 'INVENTORY_RESERVED', updatedData);

      // Proceed to payment processing
      return await this.processPayment(saga.orderId, updatedData);
    } catch (error) {
      this.logger.error('Failed to reserve inventory', error as Error);
      return Result.err(
        domainError('INVENTORY_RESERVATION_FAILED', 'Failed to reserve inventory', error)
      );
    }
  }

  /**
   * Step 2: Process payment
   */
  private async processPayment(
    orderId: string,
    sagaData: OrderFulfillmentSagaData
  ): AsyncResult<void, DomainError> {
    this.logger.info('Processing payment for order', { orderId });

    try {
      // Update order status to trigger payment processing
      const updateStatusResult = await this.commandBus.execute('UpdateOrderStatus', {
        id: generateId(),
        type: 'UpdateOrderStatus',
        payload: {
          orderId,
          status: 'processing',
          notes: 'Payment processing initiated by saga',
          updatedBy: 'order-fulfillment-saga',
        },
        metadata: {
          source: 'order-fulfillment-saga',
          correlationId: generateId(),
        },
        createdAt: new Date(),
      });

      if (Result.isErr(updateStatusResult)) {
        return updateStatusResult;
      }

      // Update saga to payment pending
      await this.updateSagaState(orderId, 'PAYMENT_PENDING', sagaData);

      return Result.ok(undefined);
    } catch (error) {
      this.logger.error('Failed to process payment', error as Error);
      return Result.err(
        domainError('PAYMENT_PROCESSING_FAILED', 'Failed to process payment', error)
      );
    }
  }

  /**
   * Step 3: Handle successful payment
   */
  private async processPaymentSuccess(
    saga: SagaInstance,
    transactionId: string
  ): AsyncResult<void, DomainError> {
    this.logger.info('Payment successful, starting fulfillment', { orderId: saga.orderId });

    try {
      // Confirm inventory reservation
      const confirmCommand: InventoryCommand = {
        id: generateId(),
        type: 'ConfirmReservation',
        payload: {
          orderId: saga.orderId,
          reservationId: saga.data.reservationId,
        },
        metadata: {
          source: 'order-fulfillment-saga',
          correlationId: saga.id,
        },
        createdAt: new Date(),
      };

      await this.externalServices.inventoryService.confirmReservation(confirmCommand);

      // Update saga data
      const updatedData: OrderFulfillmentSagaData = {
        ...saga.data,
        paymentTransactionId: transactionId,
        compensationActions: [...saga.data.compensationActions, 'REFUND_PAYMENT'],
      };

      await this.updateSagaState(saga.id, 'PAYMENT_PROCESSED', updatedData);

      // Start fulfillment
      return await this.startFulfillment(saga.orderId, updatedData);
    } catch (error) {
      this.logger.error('Failed to process payment success', error as Error);
      return Result.err(
        domainError('PAYMENT_SUCCESS_PROCESSING_FAILED', 'Failed to process payment success', error)
      );
    }
  }

  /**
   * Step 4: Start fulfillment
   */
  private async startFulfillment(
    orderId: string,
    sagaData: OrderFulfillmentSagaData
  ): AsyncResult<void, DomainError> {
    this.logger.info('Starting order fulfillment', { orderId });

    try {
      // Create shipment
      const shippingCommand: ShippingCommand = {
        id: generateId(),
        type: 'CreateShipment',
        payload: {
          orderId,
          items: sagaData.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          shippingAddress: {}, // This would come from the order data
        },
        metadata: {
          source: 'order-fulfillment-saga',
          correlationId: generateId(),
        },
        createdAt: new Date(),
      };

      const shipmentResult =
        await this.externalServices.shippingService.createShipment(shippingCommand);

      // Update saga state
      const updatedData: OrderFulfillmentSagaData = {
        ...sagaData,
        shippingTrackingNumber: shipmentResult.trackingNumber,
        compensationActions: [...sagaData.compensationActions, 'CANCEL_SHIPMENT'],
      };

      await this.updateSagaState(orderId, 'FULFILLMENT_STARTED', updatedData);

      return Result.ok(undefined);
    } catch (error) {
      this.logger.error('Failed to start fulfillment', error as Error);
      return Result.err(
        domainError('FULFILLMENT_START_FAILED', 'Failed to start fulfillment', error)
      );
    }
  }

  /**
   * Handle payment failure
   */
  private async processPaymentFailure(
    saga: SagaInstance,
    reason: string
  ): AsyncResult<void, DomainError> {
    this.logger.error('Payment failed, starting compensation', {
      orderId: saga.orderId,
      reason,
    });

    return await this.compensateSaga(saga, reason);
  }

  /**
   * Complete shipping step
   */
  private async completeShipping(
    saga: SagaInstance,
    trackingNumber: string
  ): AsyncResult<void, DomainError> {
    this.logger.info('Order shipped, completing saga', {
      orderId: saga.orderId,
      trackingNumber,
    });

    try {
      const updatedData: OrderFulfillmentSagaData = {
        ...saga.data,
        shippingTrackingNumber: trackingNumber,
      };

      await this.updateSagaState(saga.id, 'COMPLETED', updatedData);
      await this.completeSaga(saga.id);

      return Result.ok(undefined);
    } catch (error) {
      this.logger.error('Failed to complete shipping', error as Error);
      return Result.err(
        domainError('SHIPPING_COMPLETION_FAILED', 'Failed to complete shipping', error)
      );
    }
  }

  /**
   * Compensate saga by undoing completed steps
   */
  private async compensateSaga(saga: SagaInstance, reason: string): AsyncResult<void, DomainError> {
    this.logger.info('Starting saga compensation', { orderId: saga.orderId, reason });

    try {
      await this.updateSagaState(saga.id, 'COMPENSATING', {
        ...saga.data,
        lastError: reason,
      });

      // Execute compensation actions in reverse order
      const compensationActions = [...saga.data.compensationActions].reverse();

      for (const action of compensationActions) {
        await this.executeCompensationAction(saga, action);
      }

      await this.updateSagaState(saga.id, 'FAILED', saga.data);

      return Result.ok(undefined);
    } catch (error) {
      this.logger.error('Failed to compensate saga', error as Error);
      return Result.err(
        domainError('SAGA_COMPENSATION_FAILED', 'Failed to compensate saga', error)
      );
    }
  }

  /**
   * Execute individual compensation action
   */
  private async executeCompensationAction(saga: SagaInstance, action: string): Promise<void> {
    this.logger.info('Executing compensation action', {
      orderId: saga.orderId,
      action,
    });

    try {
      switch (action) {
        case 'RELEASE_INVENTORY':
          if (saga.data.reservationId) {
            const releaseCommand: InventoryCommand = {
              id: generateId(),
              type: 'ReleaseReservation',
              payload: {
                orderId: saga.orderId,
                reservationId: saga.data.reservationId,
              },
              metadata: {
                source: 'order-fulfillment-saga-compensation',
                correlationId: saga.id,
              },
              createdAt: new Date(),
            };
            await this.externalServices.inventoryService.releaseReservation(releaseCommand);
          }
          break;

        case 'REFUND_PAYMENT':
          if (saga.data.paymentTransactionId) {
            const refundCommand: PaymentCommand = {
              id: generateId(),
              type: 'RefundPayment',
              payload: {
                orderId: saga.orderId,
                amount: saga.data.totalAmount,
                paymentMethod: 'original',
                transactionId: saga.data.paymentTransactionId,
              },
              metadata: {
                source: 'order-fulfillment-saga-compensation',
                correlationId: saga.id,
              },
              createdAt: new Date(),
            };
            await this.externalServices.paymentService.refundPayment(refundCommand);
          }
          break;

        case 'CANCEL_SHIPMENT':
          if (saga.data.shippingTrackingNumber) {
            const cancelCommand: ShippingCommand = {
              id: generateId(),
              type: 'CancelShipment',
              payload: {
                orderId: saga.orderId,
                items: saga.data.items,
                shippingAddress: {},
              },
              metadata: {
                source: 'order-fulfillment-saga-compensation',
                correlationId: saga.id,
              },
              createdAt: new Date(),
            };
            await this.externalServices.shippingService.cancelShipment(cancelCommand);
          }
          break;

        default:
          this.logger.warn('Unknown compensation action', { action });
      }
    } catch (error) {
      this.logger.error('Failed to execute compensation action', error as Error, { action });
      // Continue with other compensation actions
    }
  }

  /**
   * Utility methods for saga persistence
   */
  private async createSagaInstance(
    sagaId: string,
    data: OrderFulfillmentSagaData
  ): AsyncResult<SagaInstance, DomainError> {
    try {
      const sagaRecord = await this.prisma.orderSaga.create({
        data: {
          id: sagaId,
          orderId: data.orderId,
          state: 'STARTED',
          sagaData: JSON.stringify(data),
        },
      });

      return Result.ok({
        id: sagaRecord.id,
        orderId: sagaRecord.orderId,
        state: sagaRecord.state as SagaState,
        data,
        createdAt: sagaRecord.createdAt,
        updatedAt: sagaRecord.updatedAt,
        completedAt: sagaRecord.completedAt,
      });
    } catch (error) {
      this.logger.error('Failed to create saga instance', error as Error);
      return Result.err(
        domainError('SAGA_CREATION_FAILED', 'Failed to create saga instance', error)
      );
    }
  }

  private async getSagaByOrderId(orderId: string): AsyncResult<SagaInstance | null, DomainError> {
    try {
      const sagaRecord = await this.prisma.orderSaga.findFirst({
        where: { orderId },
      });

      if (!sagaRecord) {
        return Result.ok(null);
      }

      return Result.ok({
        id: sagaRecord.id,
        orderId: sagaRecord.orderId,
        state: sagaRecord.state as SagaState,
        data: JSON.parse(sagaRecord.sagaData),
        createdAt: sagaRecord.createdAt,
        updatedAt: sagaRecord.updatedAt,
        completedAt: sagaRecord.completedAt,
      });
    } catch (error) {
      this.logger.error('Failed to get saga by order ID', error as Error);
      return Result.err(
        domainError('SAGA_RETRIEVAL_FAILED', 'Failed to get saga by order ID', error)
      );
    }
  }

  private async updateSagaState(
    sagaId: string,
    state: SagaState,
    data: OrderFulfillmentSagaData
  ): Promise<void> {
    await this.prisma.orderSaga.update({
      where: { id: sagaId },
      data: {
        state,
        sagaData: JSON.stringify(data),
        completedAt: ['COMPLETED', 'FAILED'].includes(state) ? new Date() : null,
      },
    });
  }

  private async completeSaga(sagaId: string): Promise<void> {
    await this.prisma.orderSaga.update({
      where: { id: sagaId },
      data: {
        completedAt: new Date(),
      },
    });

    this.logger.info('Saga completed successfully', { sagaId });
  }

  private async handleSagaFailure(saga: SagaInstance, error: DomainError): Promise<void> {
    this.logger.error('Saga failed', error, { orderId: saga.orderId });

    await this.updateSagaState(saga.id, 'FAILED', {
      ...saga.data,
      lastError: error.message,
    });
  }

  private validateOrderCreatedEvent(event: OrderCreatedEvent): AsyncResult<void, DomainError> {
    if (!event.aggregateId) {
      return Result.err(validationError('MISSING_AGGREGATE_ID', 'Order ID is required'));
    }

    if (!event.data.items || event.data.items.length === 0) {
      return Result.err(
        validationError('MISSING_ORDER_ITEMS', 'Order must have at least one item')
      );
    }

    return Result.ok(undefined);
  }
}
