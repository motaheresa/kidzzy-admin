import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../atoms/button';

/**
 * Previous / next for an offset-paginated list ({ data, meta } from the API). Shows nothing
 * when everything fits on one page. In Arabic, "previous" points right (the start side).
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1 && page <= 1) return null;

  return (
    <nav
      aria-label="الصفحات"
      data-slot="pagination"
      className={cn('flex items-center justify-between gap-3', className)}
    >
      <Button variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        <ChevronRightIcon aria-hidden="true" />
        السابق
      </Button>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        صفحة {page} من {pages}
      </p>
      <Button variant="outline" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
        التالي
        <ChevronLeftIcon aria-hidden="true" />
      </Button>
    </nav>
  );
}
