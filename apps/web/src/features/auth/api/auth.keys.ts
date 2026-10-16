// Query keys of the auth feature, built in one place so a key is never retyped by hand.
// authKeys.all is the prefix of every auth key, for invalidating them all at once.
export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
};
