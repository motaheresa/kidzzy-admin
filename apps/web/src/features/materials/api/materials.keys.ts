// Query keys of the materials feature, built in one place so a key is never retyped by hand.
export const materialKeys = {
  all: ['materials'] as const,
  list: () => [...materialKeys.all, 'list'] as const,
};
