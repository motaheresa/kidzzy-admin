import { useState } from 'react';
import { MegaphoneIcon, PlusIcon } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Pagination,
  Skeleton,
} from '@/components/ui';
import { useSession } from '@/features/auth';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useListParams } from '@/lib/hooks';
import { ANNOUNCEMENTS_PAGE_SIZE } from '../api/announcements.api';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { roleLabel } from '../lib/role-label';
import type { Announcement } from '../types';
import { AnnouncementForm } from './AnnouncementForm';

function audienceLabel(announcement: Announcement): string {
  if (announcement.audience === 'all') return 'الكل';
  if (announcement.audience === 'users') return 'اشخاص';
  return `دور: ${roleLabel(announcement.roleName ?? '')}`;
}

/**
 * The announcements screen (US-31): «اعلان جديد» opens the form, and below it the sent ones,
 * newest first. The page is in the URL.
 */
export function AnnouncementsScreen() {
  const me = useSession();
  const timeZone = me.data?.academy.timezone ?? 'Africa/Cairo';
  const { page, setPage } = useListParams();
  const announcements = useAnnouncements(page);
  const [writing, setWriting] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {writing ? (
        <AnnouncementForm
          onCancel={() => setWriting(false)}
          onSent={() => {
            setWriting(false);
            // The new one is the newest: show the first page.
            setPage(1);
          }}
        />
      ) : (
        <div>
          <Button onClick={() => setWriting(true)}>
            <PlusIcon aria-hidden="true" />
            اعلان جديد
          </Button>
        </div>
      )}

      {announcements.isPending ? (
        <Skeleton className="h-40 w-full" aria-label="جاري التحميل" />
      ) : announcements.isError ? (
        <Alert variant="danger">{announcements.error.message}</Alert>
      ) : announcements.data.data.length === 0 ? (
        <EmptyState
          icon={<MegaphoneIcon aria-hidden="true" />}
          title="مفيش اعلانات"
          description="الاعلانات اللي تتبعت هتظهر هنا."
        />
      ) : (
        <ul className="grid gap-3" aria-label="الاعلانات المبعوتة">
          {announcements.data.data.map((announcement) => (
            <li key={announcement.id}>
              <Card>
                <CardContent className="flex flex-col gap-2 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold wrap-anywhere">{announcement.title}</h2>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="brand">{audienceLabel(announcement)}</Badge>
                      <Badge>{formatNumber(announcement.recipientCount)} شخص</Badge>
                    </div>
                  </div>
                  <p className="text-sm wrap-anywhere whitespace-pre-line">{announcement.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {announcement.sender.name} ·{' '}
                    <span className="numeric">
                      {formatDateTime(announcement.createdAt, timeZone)}
                    </span>
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {announcements.data && (
        <Pagination
          page={announcements.data.meta.page}
          pageSize={ANNOUNCEMENTS_PAGE_SIZE}
          total={announcements.data.meta.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
