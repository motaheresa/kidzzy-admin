import { useId, useState } from 'react';
import { XIcon } from 'lucide-react';
import { ANNOUNCEMENT_MAX_USERS } from '@kidzzy/shared';
import { Alert, Badge, Button, Pagination, SearchInput, Skeleton } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { PICKER_PAGE_SIZE } from '../api/announcements.api';
import { useAudienceUsers } from '../hooks/useAnnouncements';
import { roleLabel } from '../lib/role-label';
import type { AudienceUser } from '../types';

/**
 * Choosing people for an announcement: search the active users, tick them, and see the chosen
 * ones as removable buttons, at most ANNOUNCEMENT_MAX_USERS. The design system has no
 * multi-select or checkbox, so this is built from SearchInput, Badge, Button and a native
 * checkbox. The chosen people stay chosen while the search and the page change.
 */
export function UserPicker({
  selected,
  onChange,
  error,
}: {
  selected: AudienceUser[];
  onChange: (selected: AudienceUser[]) => void;
  error?: string;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const users = useAudienceUsers({ search, page });
  const errorId = useId();
  const chosen = new Set(selected.map((user) => user.id));
  const full = selected.length >= ANNOUNCEMENT_MAX_USERS;

  const toggle = (user: AudienceUser) => {
    if (chosen.has(user.id)) onChange(selected.filter((other) => other.id !== user.id));
    else if (!full) onChange([...selected, user]);
  };

  return (
    <fieldset
      className="flex min-w-0 flex-col gap-3"
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="mb-1.5 text-sm font-medium">الاشخاص</legend>
      {/* Enter in the search box must not send the form around the picker. */}
      <div
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault();
        }}
      >
        <SearchInput
          label="دور على شخص"
          placeholder="اسم او ايميل"
          onSearch={(text) => {
            setSearch(text);
            setPage(1);
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        اخترت {formatNumber(selected.length)} من {formatNumber(ANNOUNCEMENT_MAX_USERS)}
        {full && '، وده اقصى عدد'}
      </p>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="الاشخاص المختارين">
          {selected.map((user) => (
            <li key={user.id} className="max-w-full">
              <Button
                variant="secondary"
                className="max-w-full"
                aria-label={`شيل ${user.name}`}
                onClick={() => toggle(user)}
              >
                {/* A very long name is cut here; the list below shows it whole. */}
                <span className="truncate">{user.name}</span>
                <XIcon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {users.isPending ? (
        <Skeleton className="h-32 w-full" aria-label="جاري التحميل" />
      ) : users.isError ? (
        <Alert variant="danger">{users.error.message}</Alert>
      ) : users.data.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">مفيش حد بالاسم ده</p>
      ) : (
        <>
          <ul className="grid divide-y divide-border rounded-lg border border-border">
            {users.data.data.map((user) => (
              <li key={user.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-primary"
                    checked={chosen.has(user.id)}
                    disabled={full && !chosen.has(user.id)}
                    onChange={() => toggle(user)}
                  />
                  <span className="min-w-0 flex-1 wrap-anywhere">{user.name}</span>
                  {user.roles.map((role) => (
                    <Badge key={role}>{roleLabel(role)}</Badge>
                  ))}
                </label>
              </li>
            ))}
          </ul>
          <Pagination
            page={users.data.meta.page}
            pageSize={PICKER_PAGE_SIZE}
            total={users.data.meta.total}
            onPageChange={setPage}
          />
        </>
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
