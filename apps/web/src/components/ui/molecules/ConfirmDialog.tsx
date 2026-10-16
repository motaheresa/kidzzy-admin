import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../atoms/alert-dialog';
import { Button } from '../atoms/button';

/**
 * "Are you sure?" before an action that changes something important (deactivate, reset).
 * The parent controls `open`: the dialog stays open while the action runs (`busy`, the confirm
 * button shows a spinner) and the parent closes it on success. Escape and "رجوع" cancel.
 * `children` is shown between the question and the buttons (for example an error alert).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = 'رجوع',
  tone = 'primary',
  busy = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element that opens the dialog (usually a Button). */
  trigger?: ReactNode;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** danger for an action that takes something away. */
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <AlertDialog
      open={open}
      // While the action runs, Escape and "رجوع" do nothing: the result must reach the dialog.
      onOpenChange={(next) => {
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          {/* A plain button, not AlertDialogAction, so the dialog stays open while it runs. */}
          <Button variant={tone} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
