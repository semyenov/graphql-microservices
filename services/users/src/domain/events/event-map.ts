/**
 * Type-safe event map for Users service
 */

import type { DefineEventMap } from '@graphql-microservices/event-sourcing';
import type {
  UserCreatedEvent,
  UserCredentialsUpdatedEvent,
  UserDeactivatedEvent,
  UserPasswordChangedEvent,
  UserProfileUpdatedEvent,
  UserReactivatedEvent,
  UserRoleChangedEvent,
  UserSignedInEvent,
  UserSignedOutEvent,
} from '../user-aggregate';

/**
 * Users service event map for type-safe event bus
 */
export type UserEventMap = DefineEventMap<{
  UserCreated: UserCreatedEvent;
  UserProfileUpdated: UserProfileUpdatedEvent;
  UserCredentialsUpdated: UserCredentialsUpdatedEvent;
  UserRoleChanged: UserRoleChangedEvent;
  UserPasswordChanged: UserPasswordChangedEvent;
  UserDeactivated: UserDeactivatedEvent;
  UserReactivated: UserReactivatedEvent;
  UserSignedIn: UserSignedInEvent;
  UserSignedOut: UserSignedOutEvent;
}>;

/**
 * Helper type to extract all user events
 */
export type UserDomainEventUnion = UserEventMap[keyof UserEventMap];
