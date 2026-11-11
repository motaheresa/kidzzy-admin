// Query keys of the reports feature, built in one place so a key is never retyped by hand.
export const reportKeys = {
  all: ['reports'] as const,
  overview: () => [...reportKeys.all, 'overview'] as const,
  finance: (period: { from: string; to: string }) =>
    [...reportKeys.all, 'finance', period.from, period.to] as const,
};
