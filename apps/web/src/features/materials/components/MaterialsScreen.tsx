import { BookOpenIcon, PlusIcon } from 'lucide-react';
import { MATERIAL_LINKS_MAX } from '@kidzzy/shared';
import { Alert, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { usePermissions } from '@/features/auth';
import { formatNumber } from '@/lib/format';
import { useMaterialLinks, useReorderMaterialLinks } from '../hooks/useMaterialLinks';
import { movedIds } from '../lib/links';
import type { MaterialLink } from '../types';
import { MaterialLinkActions } from './MaterialLinkActions';
import { MaterialLinkDialog } from './MaterialLinkDialog';
import { MaterialLinkOpen } from './MaterialLinkOpen';

/**
 * The course material links in the admin's order (US-32, US-33). Everyone with materials.read
 * opens them; materials.manage adds the controls (add, edit, delete, order). The web only shows
 * or hides: the API refuses a write without the permission.
 */
export function MaterialsScreen() {
  const { can } = usePermissions();
  const canManage = can('materials.manage');
  const links = useMaterialLinks();
  const full = (links.data?.length ?? 0) >= MATERIAL_LINKS_MAX;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="المواد"
        description={
          canManage
            ? 'لينكات المواد التعليمية، بالترتيب اللي المدرسين بيشوفوه.'
            : 'لينكات المواد التعليمية. كل لينك بيفتح في صفحة جديدة.'
        }
        actions={
          canManage && (
            <MaterialLinkDialog
              trigger={
                <Button disabled={full}>
                  <PlusIcon aria-hidden="true" />
                  اضافة لينك
                </Button>
              }
            />
          )
        }
      />
      {canManage && full && (
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
          title={canManage ? 'مفيش لينكات لسه' : 'مفيش مواد لسه'}
          description={
            canManage
              ? 'ضيف لينكات المواد عشان المدرسين يفتحوها من هنا.'
              : 'لما الأدمن يضيف لينكات المواد هتلاقيها هنا.'
          }
        />
      ) : (
        <MaterialList links={links.data} canManage={canManage} />
      )}
    </div>
  );
}

function MaterialList({ links, canManage }: { links: MaterialLink[]; canManage: boolean }) {
  const reorder = useReorderMaterialLinks();
  return (
    <Card className="gap-0 py-1">
      <ol aria-label="لينكات المواد" className="flex flex-col divide-y divide-border px-4">
        {links.map((link, index) => (
          <li
            key={link.id}
            className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-3"
          >
            <MaterialLinkOpen link={link} />
            {canManage && (
              <MaterialLinkActions
                link={link}
                isFirst={index === 0}
                isLast={index === links.length - 1}
                saving={reorder.isPending}
                onMove={(step) => reorder.mutate(movedIds(links, index, step))}
              />
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
