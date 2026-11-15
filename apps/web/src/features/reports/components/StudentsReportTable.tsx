import { UsersIcon } from 'lucide-react';
import { Link } from 'react-router';
import { REPEATED_ABSENCE_THRESHOLD } from '@kidzzy/shared';
import {
  Badge,
  EmptyState,
  Label,
  PageSizeSelect,
  Pagination,
  Select,
  SortableHead,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { usePermissions } from '@/features/auth';
import { formatDate, formatNumber } from '@/lib/format';
import { useListParams } from '@/lib/hooks';
import {
  filterStudentRows,
  formatStudentSort,
  nextStudentSort,
  parseStudentSort,
  sortStudentRows,
  type StudentSortColumn,
} from '../lib/sort-students';
import type { StudentsReportRow } from '../types';
import { REPORT_PAGE_SIZE } from './FinancePayments';

const COLUMNS: { column: StudentSortColumn; label: string }[] = [
  { column: 'name', label: 'الطالب' },
  { column: 'group', label: 'الجروب' },
  { column: 'present', label: 'حضر' },
  { column: 'absent', label: 'غاب' },
  { column: 'attendanceRate', label: 'الحضور' },
  { column: 'absenceStreak', label: 'غياب ورا بعض' },
  { column: 'lastPresentAt', label: 'آخر حضور' },
  { column: 'averagePerformance', label: 'الأداء' },
  { column: 'averageHomework', label: 'الواجب' },
  { column: 'cycle', label: 'الدورة' },
];

const CYCLE_STATUS: Record<
  NonNullable<StudentsReportRow['cycle']>['status'],
  { label: string; variant: 'neutral' | 'warning' }
> = {
  in_progress: { label: 'شغالة', variant: 'neutral' },
  due: { label: 'مستحقة', variant: 'warning' },
};

/** A rating out of five with one decimal, or a dash. */
const rating = (value: number | null) => (value === null ? '—' : formatNumber(value));

/**
 * The students of the period, sorted by the column the admin presses (default: the longest absence
 * streak first), filtered by group, active or not, and repeated absence, 50 rows per page unless
 * the admin picks 25 or 100. The sort, the filters, the page and the page size live in the URL next
 * to the period, so a reload and a shared link keep them. The API sends every row; the sorting,
 * the filtering and the paging are done here.
 */
export function StudentsReportTable({ rows }: { rows: StudentsReportRow[] }) {
  const { page, pageSize, setPage, setPageSize, param, setParam } = useListParams({
    pageSize: REPORT_PAGE_SIZE,
  });
  const { can } = usePermissions();

  const sort = parseStudentSort(param('sort'));
  const groupId = param('group') || undefined;
  const active =
    param('active') === 'true' ? true : param('active') === 'false' ? false : undefined;
  const repeated = param('repeated') === '1';

  const groups = [
    ...new Map(
      rows.flatMap((row) => (row.currentGroup ? [[row.currentGroup.id, row.currentGroup]] : [])),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  const filtered = filterStudentRows(rows, { groupId, active, repeated });
  const sorted = sortStudentRows(filtered, sort);
  const lastPage = Math.max(1, Math.ceil(sorted.length / pageSize));
  const shownPage = Math.min(page, lastPage);
  const shown = sorted.slice((shownPage - 1) * pageSize, shownPage * pageSize);

  return (
    <section className="flex flex-col gap-3" aria-label="طلاب الفترة">
      <h2 className="text-lg font-semibold">طلاب الفترة</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-student-group">الجروب</Label>
          <Select
            id="report-student-group"
            value={groupId ?? ''}
            onChange={(event) => setParam('group', event.target.value)}
          >
            <option value="">الكل</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-student-active">الحالة</Label>
          <Select
            id="report-student-active"
            value={active === undefined ? '' : String(active)}
            onChange={(event) => setParam('active', event.target.value)}
          >
            <option value="">الكل</option>
            <option value="true">نشط</option>
            <option value="false">غير نشط</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-student-repeated">غياب متكرر</Label>
          <Select
            id="report-student-repeated"
            value={repeated ? '1' : ''}
            onChange={(event) => setParam('repeated', event.target.value)}
          >
            <option value="">الكل</option>
            <option value="1">{REPEATED_ABSENCE_THRESHOLD} غيابات ورا بعض أو أكتر</option>
          </Select>
        </div>
        <PageSizeSelect value={pageSize} onChange={setPageSize} />
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<UsersIcon aria-hidden="true" />}
          title="مفيش طلاب بالفلتر ده"
          description="جرب فترة أو فلتر تاني."
          className="py-6"
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{formatNumber(sorted.length)} طالب</p>
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map(({ column, label }) => (
                  <SortableHead
                    key={column}
                    label={label}
                    direction={sort.column === column ? sort.direction : null}
                    onSort={() =>
                      setParam('sort', formatStudentSort(nextStudentSort(sort, column)))
                    }
                  />
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={row.studentId}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {can('students.read') ? (
                      <Link
                        to={`/students/${row.studentId}`}
                        className="text-primary hover:underline"
                      >
                        {row.name}
                      </Link>
                    ) : (
                      row.name
                    )}
                    {!row.isActive && (
                      <Badge variant="neutral" className="ms-2">
                        غير نشط
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.currentGroup?.name ?? '—'}
                  </TableCell>
                  <TableCell className="numeric">{formatNumber(row.present)}</TableCell>
                  <TableCell className="numeric">{formatNumber(row.absent)}</TableCell>
                  <TableCell className="numeric">
                    {row.attendanceRate === null ? '—' : `${formatNumber(row.attendanceRate)}%`}
                  </TableCell>
                  <TableCell className="numeric whitespace-nowrap">
                    {formatNumber(row.absenceStreak)}
                    {row.absenceStreak >= REPEATED_ABSENCE_THRESHOLD && (
                      <Badge variant="danger" className="ms-2">
                        غياب متكرر
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="numeric whitespace-nowrap">
                    {row.lastPresentAt ? formatDate(row.lastPresentAt) : '—'}
                  </TableCell>
                  <TableCell className="numeric">{rating(row.averagePerformance)}</TableCell>
                  <TableCell className="numeric">{rating(row.averageHomework)}</TableCell>
                  <TableCell className="numeric whitespace-nowrap">
                    {row.cycle ? (
                      <>
                        {formatNumber(row.cycle.sessionsCounted)}/
                        {formatNumber(row.cycle.sessionsPerCycle)}
                        <Badge variant={CYCLE_STATUS[row.cycle.status].variant} className="ms-2">
                          {CYCLE_STATUS[row.cycle.status].label}
                        </Badge>
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={shownPage}
            pageSize={pageSize}
            total={sorted.length}
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
}
