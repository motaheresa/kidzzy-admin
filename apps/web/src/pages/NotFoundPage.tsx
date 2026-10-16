import { SearchXIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Button, EmptyState } from '@/components/ui';

/** Any path no route matches. */
export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <EmptyState
        icon={<SearchXIcon aria-hidden="true" />}
        title="الصفحة دي مش موجودة"
        description="ممكن يكون اللينك قديم او فيه حرف غلط."
        action={
          <Button asChild variant="outline">
            <Link to="/">ارجع للرئيسية</Link>
          </Button>
        }
      />
    </main>
  );
}
