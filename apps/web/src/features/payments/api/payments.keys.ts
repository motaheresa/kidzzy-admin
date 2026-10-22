// Query keys of the payments feature, built in one place so a key is never retyped by hand.
export const paymentKeys = {
  all: ['payments'] as const,
  /** The plan versions of one payee. */
  plans: () => [...paymentKeys.all, 'plans'] as const,
  studentPlans: (studentId: string) => [...paymentKeys.plans(), 'student', studentId] as const,
};
