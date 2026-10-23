import { AttendanceStatus } from '@kidzzy/shared';
import { Badge } from '@/components/ui';
import { formatNumber } from '@/lib/format';

/**
 * What was recorded for one student in one session: present or absent and, for a present
 * student, the two ratings. A missing homework rating means there was no homework.
 */
export function AttendanceMark({
  status,
  performanceRating,
  homeworkRating,
}: {
  status: AttendanceStatus;
  performanceRating: number | null;
  homeworkRating: number | null;
}) {
  if (status === AttendanceStatus.Absent) return <Badge variant="danger">غايب</Badge>;
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge variant="success">حاضر</Badge>
      <span className="text-xs whitespace-nowrap text-muted-foreground">
        الأداء {performanceRating === null ? '—' : formatNumber(performanceRating)} · الواجب{' '}
        {homeworkRating === null ? 'مفيش واجب' : formatNumber(homeworkRating)}
      </span>
    </span>
  );
}
