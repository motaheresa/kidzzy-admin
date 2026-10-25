import { PageHeader } from '@/components/ui';
import { AuditLogScreen } from '@/features/audit';

/** /audit-log: who changed what and when, for the admin. Composition only. */
export function AuditLogPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="سجل التغييرات"
        description="مين غيّر ايه وامتى، والقيم قبل وبعد التغيير."
      />
      <AuditLogScreen />
    </div>
  );
}
