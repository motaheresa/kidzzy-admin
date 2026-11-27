import { toast } from 'sonner';
import { formatNumber } from '@/lib/format';
import { useApiMutation, useApiQuery, useQueryClient } from '@/lib/query';
import {
  countRecipients,
  listAnnouncements,
  listAudienceRoles,
  listAudienceUsers,
  sendAnnouncement,
} from '../api/announcements.api';
import { announcementKeys } from '../api/announcements.keys';
import type { AnnouncementCreate, Audience } from '../types';

/** One page of the sent announcements. The screen shows its own error. */
export function useAnnouncements(page: number) {
  return useApiQuery({
    queryKey: announcementKeys.list(page),
    queryFn: ({ signal }) => listAnnouncements(page, signal),
    placeholderData: (previous) => previous,
    meta: { errorHandling: 'local' },
  });
}

/**
 * Counts the recipients when the form asks, before the confirmation. A mutation, not a query:
 * it runs on a click and its answer is never cached, because the people can change.
 */
export function useRecipientsCount() {
  return useApiMutation({
    mutationFn: (audience: Audience) => countRecipients(audience),
    meta: { errorHandling: 'local' },
  });
}

/** Sends the announcement and reloads the sent list. The form shows the error. */
export function useSendAnnouncement() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (body: AnnouncementCreate) => sendAnnouncement(body),
    meta: { errorHandling: 'local' },
    onSuccess: async (sent) => {
      await queryClient.invalidateQueries({ queryKey: announcementKeys.lists() });
      toast.success(`الاعلان اتبعت لـ ${formatNumber(sent.recipientCount)} شخص`);
    },
  });
}

export function useAudienceRoles() {
  return useApiQuery({
    queryKey: announcementKeys.roles(),
    queryFn: ({ signal }) => listAudienceRoles(signal),
    meta: { errorHandling: 'local' },
  });
}

export function useAudienceUsers(params: { search: string; page: number }) {
  return useApiQuery({
    queryKey: announcementKeys.users(params),
    queryFn: ({ signal }) => listAudienceUsers(params, signal),
    placeholderData: (previous) => previous,
    meta: { errorHandling: 'local' },
  });
}
