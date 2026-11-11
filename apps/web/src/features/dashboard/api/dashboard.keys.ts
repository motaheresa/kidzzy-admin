// Query keys of the dashboard feature, built in one place so a key is never retyped by hand.
export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: () => [...dashboardKeys.all, 'summary'] as const,
};
