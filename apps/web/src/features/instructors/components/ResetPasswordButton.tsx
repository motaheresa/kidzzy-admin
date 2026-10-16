import { CheckIcon, CopyIcon, KeyRoundIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  Alert,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  FormField,
} from '@/components/ui';
import { useResetInstructorPassword } from '../hooks/useInstructorMutations';
import { generateTemporaryPassword } from '../temporary-password';
import type { Instructor } from '../types';

/**
 * The admin sets a temporary password (US-02), in a dialog with two steps:
 * 1. type or generate the password, and confirm;
 * 2. the password is shown ONCE, with a copy button, to pass on to the instructor. It is kept
 *    only in this dialog's state and forgotten when the dialog closes.
 * The instructor must change it at the next login, and every session of theirs ends.
 */
export function ResetPasswordButton({ instructor }: { instructor: Instructor }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const reset = useResetInstructorPassword(instructor.id);

  function changeOpen(next: boolean) {
    if (!next && reset.isPending) return; // the answer must reach the dialog
    setOpen(next);
    if (!next) {
      // Forget the password and start over next time.
      setPassword('');
      setDone(false);
      setCopied(false);
      reset.reset();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    reset.mutate(password, { onSuccess: () => setDone(true) });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false); // no clipboard access: the password stays visible to copy by hand
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <KeyRoundIcon aria-hidden="true" />
          كلمة سر مؤقتة
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        {done ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>كلمة السر المؤقتة لـ {instructor.name}</AlertDialogTitle>
              <AlertDialogDescription>
                ابعتها للمدرس دلوقتي. مش هتقدر تشوفها تاني بعد ما تقفل الرسالة دي.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex items-center gap-2">
              <code
                dir="ltr"
                className="flex-1 rounded-md bg-muted px-3 py-2.5 text-start font-mono text-base select-all"
              >
                {password}
              </code>
              <Button variant="outline" onClick={() => void copy()}>
                {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
                {copied ? 'اتنسخت' : 'نسخ'}
              </Button>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel variant="primary">تمام</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <AlertDialogHeader>
              <AlertDialogTitle>كلمة سر مؤقتة لـ {instructor.name}</AlertDialogTitle>
              <AlertDialogDescription>
                المدرس هيخرج من كل الاجهزة، ولازم يغيرها اول ما يدخل.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-2">
              <FormField
                label="كلمة السر المؤقتة"
                name="temporaryPassword"
                type="text"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                className="text-start font-mono"
                hint="8 حروف على الاقل"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={reset.error?.fieldErrors.temporaryPassword}
              />
              <Button
                variant="outline"
                className="justify-self-start"
                onClick={() => setPassword(generateTemporaryPassword())}
              >
                اعمل كلمة سر
              </Button>
            </div>
            {reset.error && <Alert variant="danger">{reset.error.message}</Alert>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={reset.isPending}>رجوع</AlertDialogCancel>
              <Button type="submit" loading={reset.isPending}>
                احفظ كلمة السر
              </Button>
            </AlertDialogFooter>
          </form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
