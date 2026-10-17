import { PlusIcon, UsersIcon } from 'lucide-react';
import { Link } from 'react-router';
import {
  Alert,
  Button,
  EmptyState,
  Pagination,
  SearchInput,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui';
import { usePermissions } from '@/features/auth';
import { useListParams } from '@/lib/hooks';
import { GROUPS_PAGE_SIZE } from '../api/groups.api';
import { useGroups } from '../hooks/useGroups';
import { formatSchedule } from '../schedule-format';
import { GroupStatusBadge } from './GroupStatusBadge';

const ACTIVE_FILTERS = [
  { value: 'all', label: 'الكل', isActive: undefined },
  { value: 'active', label: 'شغالة', isActive: true },
  { value: 'inactive', label: 'متوقفة', isActive: false },
] as const;

/** What the empty list says, from the most specific reason to the least. */
function emptyText(ownOnly: boolean, search: string, isActive: boolean | undefined) {
  if (search) {
    return {
      title: 'مفيش جروب بالاسم ده',
      description: 'جرب جزء من الاسم او المستوى، او شيل الفلتر.',
    };
  }
  if (isActive !== undefined)
    return { title: 'مفيش جروبات بالحالة دي', description: 'جرب فلتر تاني.' };
  if (ownOnly) {
    return { title: 'مفيش جروبات ليك لسه', description: 'الجروبات اللي بتدرسها هتظهر هنا.' };
  }
  return { title: 'مفيش جروبات لسه', description: 'ابدأ باضافة اول جروب.' };
}

/**
 * The groups list (US-07): search by name or level, the active filter and the page, all kept in
 * the URL; a table with a link to each group; empty and error states. An instructor only gets
 * their own groups from the API.
 */
export function GroupsList() {
  const { page, search, isActive, setPage, setSearch, setIsActive } = useListParams();
  const groups = useGroups({ page, search, isActive });
  const { can, scopeFor } = usePermissions();
  const ownOnly = scopeFor('groups.read') === 'own';
  const filter = ACTIVE_FILTERS.find((f) => f.isActive === isActive)?.value ?? 'all';

  const addButton = can('groups.create') && (
    <Button asChild>
      <Link to="/groups/new">
        <PlusIcon aria-hidden="true" />
        اضافة جروب
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          label="دور على جروب"
          placeholder="الاسم او المستوى"
          defaultValue={search}
          onSearch={setSearch}
        />
        <ToggleGroup
          type="single"
          aria-label="الحالة"
          value={filter}
          onValueChange={(value) => {
            // Radix sends "" when the selected item is clicked again; keep a filter selected.
            const chosen = ACTIVE_FILTERS.find((f) => f.value === value);
            if (chosen) setIsActive(chosen.isActive);
          }}
        >
          {ACTIVE_FILTERS.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value}>
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="ms-auto">{addButton}</div>
      </div>

      {groups.isPending ? (
        <div className="grid gap-2" aria-label="جاري التحميل">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : groups.isError ? (
        <Alert variant="danger">
          {groups.error.message}{' '}
          <Button variant="link" className="h-auto p-0" onClick={() => void groups.refetch()}>
            جرب تاني
          </Button>
        </Alert>
      ) : groups.data.data.length === 0 ? (
        <EmptyState
          icon={<UsersIcon aria-hidden="true" />}
          {...emptyText(ownOnly, search, isActive)}
          action={
            !ownOnly && !search && isActive === undefined ? addButton || undefined : undefined
          }
        />
      ) : (
        <>
          <Table aria-busy={groups.isPlaceholderData || undefined}>
            <TableHeader>
              <TableRow>
                <TableHead>الجروب</TableHead>
                <TableHead>المستوى</TableHead>
                <TableHead>المدرس</TableHead>
                <TableHead>المواعيد</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.data.data.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">
                    <Link
                      to={`/groups/${group.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {group.name}
                    </Link>
                  </TableCell>
                  <TableCell dir="ltr" className="text-end">
                    {group.level}
                  </TableCell>
                  <TableCell>{group.instructor.name}</TableCell>
                  <TableCell>{formatSchedule(group.schedule)}</TableCell>
                  <TableCell>
                    <GroupStatusBadge isActive={group.isActive} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            pageSize={GROUPS_PAGE_SIZE}
            total={groups.data.meta.total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
