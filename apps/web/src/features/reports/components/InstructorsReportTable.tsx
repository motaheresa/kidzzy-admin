import { UsersIcon } from 'lucide-react';
import { Link } from 'react-router';
import {
  Badge,
  EmptyState,
  SortableHead,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { usePermissions } from '@/features/auth';
import { formatDuration, formatMoney, formatNumber } from '@/lib/format';
import { useListParams } from '@/lib/hooks';
import type { Period } from '../lib/period';
import {
  formatSort,
  nextSort,
  parseSort,
  sortInstructorRows,
  type SortColumn,
} from '../lib/sort-instructors';
import type { InstructorsReportRow } from '../types';

const COLUMNS: { column: SortColumn; label: string }[] = [
  { column: 'name', label: 'المدرس' },
  { column: 'activeGroups', label: 'مجموعات نشطة' },
  { column: 'held', label: 'اتعملت' },
  { column: 'cancelled', label: 'اتلغت' },
  { column: 'actualMinutes', label: 'الوقت الفعلي' },
  { column: 'attendanceRate', label: 'الحضور' },
  { column: 'paid', label: 'اتدفع' },
  { column: 'due', label: 'مستحق' },
  { column: 'expected', label: 'متوقع' },
];

/** The link to the sessions report for one instructor, with the period of this page. */
function sessionsLink(instructorId: string, period: Period): string {
  const query = new URLSearchParams({ from: period.from, to: period.to, instructorId });
  return `/reports/sessions?${query.toString()}`;
}

/**
 * Every instructor of the period, sorted by the column the admin presses (default: most held
 * sessions first). The sort lives in the URL (?sort=paid:desc) next to the period, so a reload and
 * a shared link keep it. Not paginated: the API returns every row.
 */
export function InstructorsReportTable({
  rows,
  period,
}: {
  rows: InstructorsReportRow[];
  period: Period;
}) {
  const { param, setParam } = useListParams();
  const { can } = usePermissions();
  const sort = parseSort(param('sort'));
  const sorted = sortInstructorRows(rows, sort);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<UsersIcon aria-hidden="true" />}
        title="مفيش مدرسين في الفترة دي"
        className="py-6"
      />
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-label="مدرسين الفترة">
      <h2 className="text-lg font-semibold">مدرسين الفترة</h2>
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map(({ column, label }) => (
              <SortableHead
                key={column}
                label={label}
                direction={sort.column === column ? sort.direction : null}
                onSort={() => setParam('sort', formatSort(nextSort(sort, column)))}
              />
            ))}
            <TableHead>إجراءات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.instructorId}>
              <TableCell className="font-medium whitespace-nowrap">
                {row.name}
                {!row.isActive && (
                  <Badge variant="neutral" className="ms-2">
                    غير نشط
                  </Badge>
                )}
              </TableCell>
              <TableCell className="numeric">{formatNumber(row.activeGroups)}</TableCell>
              <TableCell className="numeric">{formatNumber(row.held)}</TableCell>
              <TableCell className="numeric">{formatNumber(row.cancelled)}</TableCell>
              <TableCell className="numeric whitespace-nowrap">
                {row.actualMinutes > 0 ? formatDuration(row.actualMinutes) : '—'}
                {row.heldWithoutActualTimes > 0 && (
                  <span className="block text-xs text-muted-foreground">
                    + {formatNumber(row.heldWithoutActualTimes)} من غير وقت فعلي
                  </span>
                )}
              </TableCell>
              <TableCell className="numeric">
                {row.attendanceRate === null ? '—' : `${formatNumber(row.attendanceRate)}%`}
              </TableCell>
              <TableCell className="numeric whitespace-nowrap">{formatMoney(row.paid)}</TableCell>
              <TableCell className="numeric whitespace-nowrap">
                {row.due.count === 0 ? '—' : formatMoney(row.due.total)}
                {row.due.count > 0 && (
                  <span className="block text-xs text-muted-foreground">
                    {formatNumber(row.due.count)} دورة
                  </span>
                )}
              </TableCell>
              <TableCell className="numeric whitespace-nowrap">
                {formatMoney(row.expected)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <span className="flex gap-4">
                  {can('instructors.read') && (
                    <Link
                      to={`/instructors/${row.instructorId}`}
                      className="text-primary hover:underline"
                    >
                      فتح المدرس
                    </Link>
                  )}
                  <Link
                    to={sessionsLink(row.instructorId, period)}
                    className="text-primary hover:underline"
                  >
                    حصصه
                  </Link>
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
