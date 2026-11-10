// Query keys of the reminder-rules feature, built in one place so a key is never retyped by hand.
export const reminderRuleKeys = {
  all: ['reminder-rules'] as const,
  list: () => [...reminderRuleKeys.all, 'list'] as const,
};
