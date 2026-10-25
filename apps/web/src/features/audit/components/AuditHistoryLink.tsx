import { HistoryIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui';
import { usePermissions } from '@/features/auth';

/**
 * "History" on a record's screen: opens the audit log filtered by that record. Only for whoever
 * can read the log (the admin); the API checks again.
 */
export function AuditHistoryLink({
  entityType,
  entityId,
}: {
  entityType: 'sessions' | 'students';
  entityId: string;
}) {
  const { scopeFor } = usePermissions();
  if (scopeFor('audit.read') !== 'any') return null;
  const query = new URLSearchParams({ entityType, entityId });
  return (
    <Button asChild variant="outline">
      <Link to={'/audit-log?' + query.toString()}>
        <HistoryIcon aria-hidden="true" />
        سجل التغييرات
      </Link>
    </Button>
  );
}
