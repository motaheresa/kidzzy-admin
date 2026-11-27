import { BookOpenIcon, PlusIcon } from 'lucide-react';
import { MATERIAL_LINKS_MAX } from '@kidzzy/shared';
import { Alert, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { useMaterialLinks, useReorderMaterialLinks } from '../hooks/useMaterialLinks';
import { linkHost, movedIds } from '../lib/links';
import type { MaterialLink } from '../types';
import { MaterialLinkActions } from './MaterialLinkActions';
import { MaterialLinkDialog } from './MaterialLinkDialog';

/** The course material links in the admin's order, with adding, editing, deleting and ordering. */
export function MaterialsScreen() {
  const links = useMaterialLinks();
  const full = (links.data?.length ?? 0) >= MATERIAL_LINKS_MAX;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="المواد"
        description="لينكات المواد التعليمية، بالترتيب اللي المدرسين بيشوفوه."
        actions={
          <MaterialLinkDialog
            trigger={
              <Button disabled={full}>
                <PlusIcon aria-hidden="true" />
                اضافة لينك
              </Button>
            }
          />
        }
      />
      {full && (
        <p className="text-sm text-muted-foreground">
          وصلت للحد الأقصى ({formatNumber(MATERIAL_LINKS_MAX)} لينك). امسح لينك عشان تضيف.
        </p>
      )}
      {links.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : links.isError ? (
        <Alert variant="danger">
          <p>{links.error.message}</p>
          <Button variant="outline" onClick={() => void links.refetch()}>
            جرب تاني
          </Button>
        </Alert>
      ) : links.data.length === 0 ? (
        <EmptyState
          icon={<BookOpenIcon aria-hidden="true" />}
          title="مفيش لينكات لسه"
          description="ضيف لينكات المواد عشان المدرسين يفتحوها من هنا."
        />
      ) : (
        <MaterialList links={links.data} />
      )}
    </div>
  );
}

function MaterialList({ links }: { links: MaterialLink[] }) {
  const reorder = useReorderMaterialLinks();
  return (
    <Card className="gap-0 py-1">
      <ol aria-label="لينكات المواد" className="flex flex-col divide-y divide-border px-4">
        {links.map((link, index) => (
          <li
            key={link.id}
            className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-3"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium wrap-anywhere">{link.title}</span>
              <span dir="ltr" className="self-start text-xs text-muted-foreground wrap-anywhere">
                {linkHost(link.url)}
              </span>
            </div>
            <MaterialLinkActions
              link={link}
              isFirst={index === 0}
              isLast={index === links.length - 1}
              saving={reorder.isPending}
              onMove={(step) => reorder.mutate(movedIds(links, index, step))}
            />
          </li>
        ))}
      </ol>
    </Card>
  );
}
