import { WalletIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/format';
import type { DashboardDueCycle } from '../types';

/**
 * Due cycles of one kind of payee, the longest waiting first. Each row links to the payee; an
 * instructor's cycle also names its group, since an instructor is paid per group.
 */
function DueCyclesCard({
  title,
  cycles,
  basePath,
  timeZone,
}: {
  title: string;
  cycles: DashboardDueCycle[];
  basePath: '/students' | '/instructors';
  timeZone: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {cycles.length === 0 ? (
          <EmptyState
            icon={<WalletIcon aria-hidden="true" />}
            title="مفيش دفعات مستحقة"
            description="الدفعات اللي حان موعدها هتظهر هنا."
          />
        ) : (
          <ul className="grid gap-2">
            {cycles.map((cycle) => (
              <li key={cycle.id}>
                <Link
                  to={`${basePath}/${cycle.payeeId}`}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3 transition-colors duration-fast ease-out hover:bg-muted"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{cycle.payeeName}</span>
                    <span className="numeric text-sm text-muted-foreground">
                      {cycle.group ? `${cycle.group.name} - ` : ''}دورة {cycle.cycleNumber}
                    </span>
                  </span>
                  <span className="numeric text-sm text-muted-foreground">
                    {cycle.dueAt ? formatDate(cycle.dueAt, timeZone) : '—'}
                  </span>
                  <span className="numeric font-medium">{formatMoney(cycle.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function StudentDueCyclesCard(props: { cycles: DashboardDueCycle[]; timeZone: string }) {
  return <DueCyclesCard title="دفعات الطلبة المستحقة" basePath="/students" {...props} />;
}

export function InstructorDueCyclesCard(props: { cycles: DashboardDueCycle[]; timeZone: string }) {
  return <DueCyclesCard title="مستحقات المدرسين" basePath="/instructors" {...props} />;
}
