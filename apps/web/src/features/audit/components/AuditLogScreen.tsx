import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { ScrollTextIcon, XIcon } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  EmptyState,
  FormField,
  Pagination,
  SelectField,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { useSession } from '@/features/auth';
import { formatDateTime } from '@/lib/format';
import { AUDIT_PAGE_SIZE } from '../api/audit.api';
import { useAuditLogs } from '../hooks/useAuditLogs';
import { useAuditParams } from '../hooks/useAuditParams';
import { actionLabel, ENTITY_TYPES, entityHref, entityTypeLabel } from '../lib/audit-labels';
import { dayRangeToInstants } from '../lib/day-bounds';
import { AuditDetails } from './AuditDetails';

/**
 * The audit log for the admin (US-35): who changed what and when, newest first, with the values
 * before and after one click away. The filters (kind of record, one record, who, a range of
 * academy-local days) live in the URL, so the "history" links of other screens open it already
 * filtered. A backwards range is explained and not sent to the API.
 */
export function AuditLogScreen() {
  const me = useSession();
  const timeZone = me.data?.academy.timezone ?? 'Africa/Cairo';
  const filters = useAuditParams();
  const { page, entityType, entityId, actorId, from, to } = filters;
  const backwards = Boolean(from && to && from > to);
  const logs = useAuditLogs(
    {
      page,
      pageSize: AUDIT_PAGE_SIZE,
      entityType,
      entityId,
      actorId,
      ...dayRangeToInstants(from, to, timeZone),
    },
    !backwards,
  );
  const [open, setOpen] = useState<string | null>(null);
  const actorName = logs.data?.data.find((entry) => entry.actor.id === actorId)?.actor.name;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-1">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label="نوع العنصر"
            value={entityType ?? ''}
            onChange={(event) => filters.setEntityType(event.target.value)}
          >
            <option value="">الكل</option>
            {ENTITY_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </SelectField>
          <FormField
            type="date"
            label="من"
            value={from ?? ''}
            onChange={(event) => filters.setFrom(event.target.value)}
            error={backwards ? 'تاريخ البداية بعد تاريخ النهاية' : undefined}
          />
          <FormField
            type="date"
            label="إلى"
            value={to ?? ''}
            onChange={(event) => filters.setTo(event.target.value)}
          />
          {(from || to) && (
            <Button variant="outline" onClick={filters.clearRange}>
              امسح التاريخ
            </Button>
          )}
        </div>
        {(entityId || actorId) && (
          <div className="flex flex-wrap items-center gap-2">
            {entityId && (
              <Button variant="outline" onClick={filters.clearEntity}>
                <XIcon aria-hidden="true" />
                عنصر واحد بس
              </Button>
            )}
            {actorId && (
              <Button variant="outline" onClick={() => filters.setActorId(null)}>
                <XIcon aria-hidden="true" />
                {'المنفذ: ' + (actorName ?? 'مستخدم محدد')}
              </Button>
            )}
          </div>
        )}

        {backwards ? null : logs.isPending ? (
          <Skeleton className="h-40 w-full" aria-label="جاري التحميل" />
        ) : logs.isError ? (
          <Alert variant="danger">{logs.error.message}</Alert>
        ) : logs.data.data.length === 0 ? (
          <EmptyState
            icon={<ScrollTextIcon aria-hidden="true" />}
            title="مفيش تغييرات"
            description="جرب فلتر تاني، او استنى لحد ما يحصل تغيير."
            className="py-6"
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الوقت</TableHead>
                  <TableHead>المنفذ</TableHead>
                  <TableHead>العملية</TableHead>
                  <TableHead>العنصر</TableHead>
                  <TableHead>
                    <span className="sr-only">التفاصيل</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.data.data.map((entry) => {
                  const href = entityHref(entry);
                  const expanded = open === entry.id;
                  return (
                    <Fragment key={entry.id}>
                      <TableRow>
                        <TableCell className="numeric whitespace-nowrap">
                          {formatDateTime(entry.createdAt, timeZone)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <button
                            type="button"
                            className="min-h-11 text-primary underline-offset-4 hover:underline"
                            aria-label={'فلتر بالمنفذ ' + entry.actor.name}
                            onClick={() => filters.setActorId(entry.actor.id)}
                          >
                            {entry.actor.name}
                          </button>
                        </TableCell>
                        <TableCell className="font-medium">{actionLabel(entry.action)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {href ? (
                            <Link
                              to={href}
                              className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline"
                            >
                              {entityTypeLabel(entry.entityType)}
                            </Link>
                          ) : (
                            entityTypeLabel(entry.entityType)
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            aria-expanded={expanded}
                            aria-label={'تفاصيل ' + actionLabel(entry.action)}
                            onClick={() => setOpen(expanded ? null : entry.id)}
                          >
                            {expanded ? 'اخفي' : 'التفاصيل'}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow>
                          <TableCell colSpan={5}>
                            <AuditDetails entry={entry} timeZone={timeZone} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination
              page={logs.data.meta.page}
              pageSize={AUDIT_PAGE_SIZE}
              total={logs.data.meta.total}
              onPageChange={filters.setPage}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
