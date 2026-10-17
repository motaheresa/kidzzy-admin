import { useState, type FormEvent } from 'react';
import {
  Alert,
  Button,
  ConfirmDialog,
  FormField,
  SelectField,
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui';
import { usePermissions } from '@/features/auth';
import { useInstructorOptions } from '@/features/instructors';
import { useUpdateGroup } from '../hooks/useGroupMutations';
import type { Group, GroupUpdate } from '../types';

/** The instructor choice: active instructors, plus the current one even if deactivated. */
function InstructorField({
  group,
  value,
  onChange,
  error,
}: {
  group: Group;
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  const options = useInstructorOptions();
  const list = options.data?.data ?? [];
  const hasCurrent = list.some((instructor) => instructor.id === group.instructor.id);
  return (
    <SelectField
      label="المدرس"
      value={value}
      disabled={options.isPending}
      onChange={(e) => onChange(e.target.value)}
      error={error ?? (options.isError ? options.error.message : undefined)}
    >
      {!hasCurrent && <option value={group.instructor.id}>{group.instructor.name}</option>}
      {list.map((instructor) => (
        <option key={instructor.id} value={instructor.id}>
          {instructor.name}
        </option>
      ))}
    </SelectField>
  );
}

/**
 * The group's details (US-10): name, level, status and, for the admin, the instructor. Only the
 * fields that changed are sent. Stopping a group asks first, because its future Scheduled
 * sessions are removed. An instructor edits their own group but never its instructor: the
 * field is not shown (the API answers 403 anyway).
 */
export function GroupDetailsForm({ group }: { group: Group }) {
  const update = useUpdateGroup(group.id);
  const { scopeFor } = usePermissions();
  const canChangeInstructor = scopeFor('groups.update') === 'any';
  const [name, setName] = useState(group.name);
  const [level, setLevel] = useState(group.level);
  const [instructorId, setInstructorId] = useState(group.instructor.id);
  const [isActive, setIsActive] = useState(group.isActive);
  const [confirmStop, setConfirmStop] = useState(false);
  const fieldErrors = update.error?.fieldErrors ?? {};

  const changes: GroupUpdate = {};
  if (name.trim() !== group.name) changes.name = name.trim();
  if (level.trim() !== group.level) changes.level = level.trim();
  if (canChangeInstructor && instructorId !== group.instructor.id) {
    changes.instructorId = instructorId;
  }
  if (isActive !== group.isActive) changes.isActive = isActive;
  const changed = Object.keys(changes).length > 0;
  const stopping = changes.isActive === false;

  function save() {
    update.mutate(changes, { onSettled: () => setConfirmStop(false) });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (stopping) setConfirmStop(true);
    else save();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="اسم الجروب"
          autoComplete="off"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />
        <FormField
          label="الكورس / المستوى"
          autoComplete="off"
          required
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          error={fieldErrors.level}
        />
      </div>
      {canChangeInstructor && (
        <InstructorField
          group={group}
          value={instructorId}
          onChange={setInstructorId}
          error={fieldErrors.instructorId}
        />
      )}
      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-foreground" id="group-status-label">
          الحالة
        </span>
        <ToggleGroup
          type="single"
          aria-labelledby="group-status-label"
          value={isActive ? 'active' : 'inactive'}
          onValueChange={(value) => value && setIsActive(value === 'active')}
        >
          <ToggleGroupItem value="active">شغال</ToggleGroupItem>
          <ToggleGroupItem value="inactive">متوقف</ToggleGroupItem>
        </ToggleGroup>
        {stopping && (
          <p className="text-xs text-muted-foreground">
            لما تحفظ، السيشنات الجاية اللي لسه مجدولة هتتشال. اللي اتعملت او اتلغت هتفضل.
          </p>
        )}
      </div>

      {update.error && !update.error.fieldErrors.name && (
        <Alert variant="danger">{update.error.message}</Alert>
      )}

      <Button type="submit" className="self-start" loading={update.isPending} disabled={!changed}>
        حفظ البيانات
      </Button>

      <ConfirmDialog
        open={confirmStop}
        onOpenChange={setConfirmStop}
        title={`توقف ${group.name}؟`}
        description="السيشنات الجاية اللي لسه مجدولة هتتشال. اللي اتعملت او اتلغت هتفضل زي ما هي، وتقدر ترجّع الجروب بعدين."
        confirmLabel="ايوه، وقفه"
        tone="danger"
        busy={update.isPending}
        onConfirm={save}
      />
    </form>
  );
}
