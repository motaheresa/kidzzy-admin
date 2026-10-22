import type { Payee } from '../types';

// Query keys of the payments feature, built in one place so a key is never retyped by hand.
export const paymentKeys = {
  all: ['payments'] as const,
  /** The plan versions of every payee. */
  plans: () => [...paymentKeys.all, 'plans'] as const,
  /** The plan versions of one payee. */
  payeePlans: (payee: Payee) => [...paymentKeys.plans(), payee.type, payee.id] as const,
};
