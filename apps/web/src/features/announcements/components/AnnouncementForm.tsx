import { useState, type FormEvent } from 'react';
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX } from '@kidzzy/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  FormField,
  SelectField,
  Skeleton,
  TextareaField,
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui';
import { formatNumber } from '@/lib/format';
import {
  useAudienceRoles,
  useRecipientsCount,
  useSendAnnouncement,
} from '../hooks/useAnnouncements';
import { roleLabel } from '../lib/role-label';
import type { AnnouncementAudience, AnnouncementCreate, AudienceUser } from '../types';
import { UserPicker } from './UserPicker';

const AUDIENCES: { value: AnnouncementAudience; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'role', label: 'دور' },
  { value: 'users', label: 'اشخاص' },
];

const counter = (text: string, max: number) =>
  `${formatNumber(text.length)} من ${formatNumber(max)} حرف`;

/**
 * A new announcement (US-31). «كمّل» checks the fields, asks the API how many people the audience
 * reaches, and the dialog confirms that number before anything is sent. An announcement cannot be
 * edited or deleted afterwards. The API's errors show under their fields.
 */
export function AnnouncementForm({
  onSent,
  onCancel,
}: {
  onSent: () => void;
  onCancel: () => void;
}) {
  const count = useRecipientsCount();
  const send = useSendAnnouncement();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [roleId, setRoleId] = useState('');
  const [people, setPeople] = useState<AudienceUser[]>([]);
  const [checked, setChecked] = useState(false);
  /** What the dialog is confirming: exactly the text and audience that were counted. */
  const [confirm, setConfirm] = useState<{ body: AnnouncementCreate; count: number } | null>(null);

  const local = {
    title: title.trim() ? undefined : 'اكتب عنوان الاعلان',
    body: body.trim() ? undefined : 'اكتب نص الاعلان',
    roleId: audience === 'role' && !roleId ? 'اختار دور' : undefined,
    userIds: audience === 'users' && people.length === 0 ? 'اختار شخص واحد على الاقل' : undefined,
  };
  const failure = send.error ?? count.error;
  const errorOf = (field: keyof typeof local) =>
    (checked ? local[field] : undefined) ?? failure?.fieldErrors[field];

  /** A change makes the last answer of the server stale. */
  const edit = <T,>(set: (value: T) => void) => {
    return (value: T) => {
      count.reset();
      send.reset();
      set(value);
    };
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setChecked(true);
    if (local.title || local.body || local.roleId || local.userIds) return;
    send.reset();
    const to = {
      audience,
      ...(audience === 'role' ? { roleId } : {}),
      ...(audience === 'users' ? { userIds: people.map((user) => user.id) } : {}),
    };
    const announcement = { title: title.trim(), body: body.trim(), ...to };
    count.mutate(to, {
      onSuccess: (answer) => setConfirm({ body: announcement, count: answer.count }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>اعلان جديد</CardTitle>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={onSubmit} aria-label="اعلان جديد">
          {/* min-w-0: a fieldset otherwise never gets narrower than its content, so a pasted
              link without spaces would widen the whole page. */}
          <fieldset disabled={count.isPending} className="flex min-w-0 flex-col gap-4">
            <FormField
              label="العنوان"
              value={title}
              maxLength={ANNOUNCEMENT_TITLE_MAX}
              hint={counter(title, ANNOUNCEMENT_TITLE_MAX)}
              error={errorOf('title')}
              onChange={(event) => edit(setTitle)(event.target.value)}
            />
            <TextareaField
              label="نص الاعلان"
              value={body}
              maxLength={ANNOUNCEMENT_BODY_MAX}
              hint={counter(body, ANNOUNCEMENT_BODY_MAX)}
              error={errorOf('body')}
              onChange={(event) => edit(setBody)(event.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium" aria-hidden="true">
                لمين
              </span>
              <ToggleGroup
                type="single"
                // Radix lays a toggle group out left to right unless it is told otherwise.
                dir="rtl"
                aria-label="لمين"
                value={audience}
                // An empty value is a second click on the chosen one: it stays chosen.
                onValueChange={(value) => {
                  if (value) edit(setAudience)(value as AnnouncementAudience);
                }}
              >
                {AUDIENCES.map((item) => (
                  <ToggleGroupItem key={item.value} value={item.value}>
                    {item.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            {audience === 'role' && (
              <RoleSelect value={roleId} onChange={edit(setRoleId)} error={errorOf('roleId')} />
            )}
            {audience === 'users' && (
              <UserPicker selected={people} onChange={edit(setPeople)} error={errorOf('userIds')} />
            )}
            {count.error && <Alert variant="danger">{count.error.message}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={count.isPending}>
                كمّل
              </Button>
              <Button variant="outline" onClick={onCancel}>
                رجوع
              </Button>
            </div>
          </fieldset>
        </form>
        <ConfirmDialog
          open={confirm !== null}
          onOpenChange={(open) => {
            if (!open) setConfirm(null);
          }}
          title="تبعت الاعلان؟"
          description={
            confirm
              ? `هيتبعت لـ ${formatNumber(confirm.count)} شخص، ومش هينفع يتعدل او يتمسح بعد كده.`
              : undefined
          }
          confirmLabel="ابعت"
          busy={send.isPending}
          onConfirm={() => {
            if (confirm) send.mutate(confirm.body, { onSuccess: onSent });
          }}
        >
          {send.error && <Alert variant="danger">{send.error.message}</Alert>}
        </ConfirmDialog>
      </CardContent>
    </Card>
  );
}

function RoleSelect({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (roleId: string) => void;
  error?: string;
}) {
  const roles = useAudienceRoles();
  if (roles.isPending) return <Skeleton className="h-11 w-full" aria-label="جاري التحميل" />;
  if (roles.isError) return <Alert variant="danger">{roles.error.message}</Alert>;
  return (
    <SelectField
      label="الدور"
      value={value}
      error={error}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">اختار دور</option>
      {roles.data.map((role) => (
        <option key={role.id} value={role.id}>
          {roleLabel(role.name)}
        </option>
      ))}
    </SelectField>
  );
}
