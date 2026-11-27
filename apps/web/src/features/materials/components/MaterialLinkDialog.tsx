import { useState, type ReactNode } from 'react';
import { MATERIAL_LINK_TITLE_MAX, MATERIAL_LINK_URL_MAX } from '@kidzzy/shared';
import { Alert, ConfirmDialog, FormField } from '@/components/ui';
import { useCreateMaterialLink, useUpdateMaterialLink } from '../hooks/useMaterialLinks';
import type { MaterialLink } from '../types';

/**
 * Add a link (no `link`) or change one (US-32): its title and its address. The API checks both
 * and its refusals show under their fields (or, for the limit of 100, in the alert), and the
 * dialog stays open.
 */
export function MaterialLinkDialog({ link, trigger }: { link?: MaterialLink; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(link?.title ?? '');
  const [url, setUrl] = useState(link?.url ?? '');
  const create = useCreateMaterialLink();
  const update = useUpdateMaterialLink(link?.id ?? '');
  const save = link ? update : create;
  const titleError = save.error?.fieldErrors?.title;
  const urlError = save.error?.fieldErrors?.url;

  function submit() {
    const onSuccess = () => setOpen(false);
    if (link) update.mutate({ title, url }, { onSuccess });
    else create.mutate({ title, url }, { onSuccess });
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTitle(link?.title ?? '');
          setUrl(link?.url ?? '');
        } else {
          save.reset();
        }
      }}
      trigger={trigger}
      title={link ? 'تعديل اللينك' : 'اضافة لينك'}
      confirmLabel="احفظ"
      busy={save.isPending}
      onConfirm={submit}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <FormField
          label="العنوان"
          maxLength={MATERIAL_LINK_TITLE_MAX}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          error={titleError}
        />
        <FormField
          label="اللينك"
          type="url"
          dir="ltr"
          placeholder="https://"
          maxLength={MATERIAL_LINK_URL_MAX}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          error={urlError}
        />
        {save.isError && !titleError && !urlError && (
          <Alert variant="danger">{save.error.message}</Alert>
        )}
      </div>
    </ConfirmDialog>
  );
}
