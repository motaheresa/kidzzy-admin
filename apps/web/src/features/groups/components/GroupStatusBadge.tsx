import { Badge } from '@/components/ui';

/** Active or deactivated, as a badge. */
export function GroupStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? <Badge variant="success">شغال</Badge> : <Badge variant="neutral">متوقف</Badge>;
}
