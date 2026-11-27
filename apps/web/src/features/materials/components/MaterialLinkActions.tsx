import { useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { Alert, Button, ConfirmDialog } from '@/components/ui';
import { useDeleteMaterialLink } from '../hooks/useMaterialLinks';
import type { MaterialLink } from '../types';
import { MaterialLinkDialog } from './MaterialLinkDialog';

/**
 * What the admin does to one link: move it up or down (disabled at the ends), edit it, delete
 * it. While an order is being saved the move buttons ignore clicks; they stay focusable
 * (aria-disabled), so a keyboard user is not thrown off the button they are pressing.
 */
export function MaterialLinkActions({
  link,
  isFirst,
  isLast,
  saving,
  onMove,
}: {
  link: MaterialLink;
  isFirst: boolean;
  isLast: boolean;
  saving: boolean;
  onMove: (step: -1 | 1) => void;
}) {
  const move = (step: -1 | 1) => {
    if (!saving) onMove(step);
  };
  return (
    <div className="flex shrink-0 justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="aria-disabled:opacity-60"
        aria-label={`حرّك ${link.title} لفوق`}
        disabled={isFirst}
        aria-disabled={saving || undefined}
        onClick={() => move(-1)}
      >
        <ArrowUpIcon aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="aria-disabled:opacity-60"
        aria-label={`حرّك ${link.title} لتحت`}
        disabled={isLast}
        aria-disabled={saving || undefined}
        onClick={() => move(1)}
      >
        <ArrowDownIcon aria-hidden="true" />
      </Button>
      <MaterialLinkDialog
        link={link}
        trigger={
          <Button variant="ghost" size="icon" aria-label={`عدّل ${link.title}`}>
            <PencilIcon aria-hidden="true" />
          </Button>
        }
      />
      <DeleteLinkButton link={link} />
    </div>
  );
}

function DeleteLinkButton({ link }: { link: MaterialLink }) {
  const [open, setOpen] = useState(false);
  const remove = useDeleteMaterialLink();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) remove.reset();
      }}
      trigger={
        <Button variant="ghost" size="icon" aria-label={`امسح ${link.title}`}>
          <Trash2Icon aria-hidden="true" />
        </Button>
      }
      title="مسح اللينك"
      description={`«${link.title}» هيتمسح من المواد ومش هينفع يرجع.`}
      confirmLabel="امسح"
      tone="danger"
      busy={remove.isPending}
      onConfirm={() => remove.mutate(link.id, { onSuccess: () => setOpen(false) })}
    >
      {remove.isError && <Alert variant="danger">{remove.error.message}</Alert>}
    </ConfirmDialog>
  );
}
