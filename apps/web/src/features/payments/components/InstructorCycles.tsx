import { WalletIcon } from 'lucide-react';
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@/components/ui';
import { usePermissions } from '@/features/auth';
import { formatMoney, formatNumber } from '@/lib/format';
import { useCycles } from '../hooks/useCycles';
import { CycleStatusBadge } from './CycleStatusBadge';
import { PaymentsList } from './PaymentsList';
import { RecordPaymentButton } from './RecordPaymentButton';
import type { PaymentCycle } from '../types';

/**
 * An instructor's cycles for the admin (US-24): one block per group, because an instructor is
 * paid per group (ADR-0015). Only whoever reads every cycle sees it; the query lives in the inner
 * component, so a caller who may not read it never sends it.
 */
export function InstructorCycles({ instructorId }: { instructorId: string }) {
  const { scopeFor } = usePermissions();
  return scopeFor('payments.read') === 'any' ? (
    <CyclesCard
      title="دورات الدفع"
      instructorId={instructorId}
      empty="مفيش دورات لسه. حدد خطة المدرس لكل جروب وهتبدأ الدورة."
    />
  ) : null;
}

/** The signed-in instructor's own cycles (US-25), group by group. Nobody else sees this card. */
export function MyCycles() {
  const { scopeFor } = usePermissions();
  return scopeFor('payments.read') === 'own' ? (
    <CyclesCard
      title="دوراتي"
      empty="لسه مفيش دورات ليك. الأدمن هيحدد خطة الدفع بتاعتك لكل جروب."
    />
  ) : null;
}

function CyclesCard({
  title,
  instructorId,
  empty,
}: {
  title: string;
  /** Left out for the instructor's own cycles: the API answers with them. */
  instructorId?: string;
  empty: string;
}) {
  const cycles = useCycles({ payeeType: 'instructor', instructorId });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {cycles.isPending ? (
          <Skeleton className="h-24 w-full" aria-label="جاري التحميل" />
        ) : cycles.isError ? (
          cycles.error.kind === 'forbidden' || cycles.error.kind === 'notFound' ? null : (
            <Alert variant="danger">{cycles.error.message}</Alert>
          )
        ) : cycles.data.data.length === 0 ? (
          <EmptyState
            icon={<WalletIcon aria-hidden="true" />}
            title="مفيش دورات"
            description={empty}
            className="py-6"
          />
        ) : (
          groupsOf(cycles.data.data).map(([groupId, groupCycles]) => (
            <section key={groupId} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{groupCycles[0]?.groupName}</h3>
              <ul className="grid gap-2">
                {groupCycles.map((cycle) => (
                  <CycleRow key={cycle.id} cycle={cycle} />
                ))}
              </ul>
            </section>
          ))
        )}
        <PaymentsList instructorId={instructorId} />
      </CardContent>
    </Card>
  );
}

/** The cycles per group, in the order the API sent them (by group name, the latest cycle first). */
function groupsOf(cycles: PaymentCycle[]): [string, PaymentCycle[]][] {
  const byGroup = new Map<string, PaymentCycle[]>();
  for (const cycle of cycles) {
    const key = cycle.groupId ?? '';
    byGroup.set(key, [...(byGroup.get(key) ?? []), cycle]);
  }
  return [...byGroup.entries()];
}

function CycleRow({ cycle }: { cycle: PaymentCycle }) {
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">الدورة {formatNumber(cycle.cycleNumber)}</span>
        <CycleStatusBadge status={cycle.status} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="numeric">
          {formatNumber(cycle.sessionsCounted)} من {formatNumber(cycle.sessionsPerCycle)} سيشن
        </span>
        <span className="numeric text-muted-foreground">{formatMoney(cycle.amount)}</span>
      </div>
      <RecordPaymentButton cycle={cycle} />
      {cycle.openingCount > 0 && (
        <p className="text-xs text-muted-foreground">
          بدأت من {formatNumber(cycle.openingCount)} سيشن (اتاخدوا قبل السيستم)
        </p>
      )}
    </li>
  );
}
