import { http } from '@/lib/http';
import type { ReminderRule, ReminderRuleCreate, ReminderRuleUpdate } from '../types';

// The reminder rule endpoints (openapi.yaml, tag Reminder rules). Components never call them; the
// hooks do.

/** GET /reminder-rules: every rule of the academy, active or not. */
export async function listReminderRules(signal?: AbortSignal): Promise<ReminderRule[]> {
  const result = await http.get<{ data: ReminderRule[] }>('/reminder-rules', { signal });
  return result.data;
}

/** POST /reminder-rules */
export function createReminderRule(body: ReminderRuleCreate): Promise<ReminderRule> {
  return http.post<ReminderRule>('/reminder-rules', body);
}

/** PATCH /reminder-rules/{id}: the value and/or isActive. */
export function updateReminderRule(id: string, body: ReminderRuleUpdate): Promise<ReminderRule> {
  return http.patch<ReminderRule>(`/reminder-rules/${id}`, body);
}

/** DELETE /reminder-rules/{id} */
export function deleteReminderRule(id: string): Promise<void> {
  return http.delete<void>(`/reminder-rules/${id}`);
}
