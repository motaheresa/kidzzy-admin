import { toast } from 'sonner';
import { useApiMutation, useApiQuery, useQueryClient } from '@/lib/query';
import {
  createReminderRule,
  deleteReminderRule,
  listReminderRules,
  updateReminderRule,
} from '../api/reminder-rules.api';
import { reminderRuleKeys } from '../api/reminder-rules.keys';
import type { ReminderRule, ReminderRuleCreate, ReminderRuleUpdate } from '../types';

/** Every rule of the academy. The screen shows its own error. */
export function useReminderRules() {
  return useApiQuery({
    queryKey: reminderRuleKeys.list(),
    queryFn: ({ signal }) => listReminderRules(signal),
    meta: { errorHandling: 'local' },
  });
}

function useRefreshRules() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: reminderRuleKeys.all });
}

/** Adding a rule. The dialog shows the errors (a duplicate, the limit of 10). */
export function useCreateReminderRule() {
  const refresh = useRefreshRules();
  return useApiMutation<ReminderRule, ReminderRuleCreate>({
    mutationFn: createReminderRule,
    meta: { errorHandling: 'local' },
    onSuccess: async () => {
      await refresh();
      toast.success('اتضافت القاعدة');
    },
  });
}

/** Changing a rule's value. The dialog shows the errors. */
export function useUpdateReminderRule(id: string) {
  const refresh = useRefreshRules();
  return useApiMutation<ReminderRule, ReminderRuleUpdate>({
    mutationFn: (body) => updateReminderRule(id, body),
    meta: { errorHandling: 'local' },
    onSuccess: async () => {
      await refresh();
      toast.success('اتعدلت القاعدة');
    },
  });
}

/**
 * The on/off switch of a rule. Errors go to the global toast, since the switch has no place to
 * show one; the list is refreshed either way so the switch shows what the server has.
 */
export function useToggleReminderRule() {
  const refresh = useRefreshRules();
  return useApiMutation<ReminderRule, { id: string; isActive: boolean }>({
    mutationFn: ({ id, isActive }) => updateReminderRule(id, { isActive }),
    onSettled: () => refresh(),
  });
}

/** Deleting a rule. The confirm dialog shows the error. */
export function useDeleteReminderRule() {
  const refresh = useRefreshRules();
  return useApiMutation<void, string>({
    mutationFn: deleteReminderRule,
    meta: { errorHandling: 'local' },
    onSuccess: async () => {
      await refresh();
      toast.success('اتمسحت القاعدة');
    },
    onError: () => {
      void refresh();
    },
  });
}
