import { Badge } from '@/components/ui';

/** Active or deactivated, as a badge. */
export function StudentStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? <Badge variant="success">نشط</Badge> : <Badge variant="neutral">متوقف</Badge>;
}
