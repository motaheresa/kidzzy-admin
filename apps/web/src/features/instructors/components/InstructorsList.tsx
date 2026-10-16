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
import { INSTRUCTORS_PAGE_SIZE } from '../api/instructors.api';
import { useInstructors } from '../hooks/useInstructors';
import { InstructorStatusBadge } from './InstructorStatusBadge';

const ACTIVE_FILTERS = [
  { value: 'all', label: 'الكل', isActive: undefined },
  { value: 'active', label: 'شغالين', isActive: true },
  { value: 'inactive', label: 'متوقفين', isActive: false },
] as const;

/**
 * The instructors list (US-04): search by name, email or phone, the active filter and the
 * page, all kept in the URL; a table with a link to each instructor; empty and error states.
 */
export function InstructorsList() {
  const { page, search, isActive, setPage, setSearch, setIsActive } = useListParams();
  const instructors = useInstructors({ page, search, isActive });
  const { can } = usePermissions();
  const canManage = can('instructors.manage');
  const filtered = Boolean(search) || isActive !== undefined;
  const filter = ACTIVE_FILTERS.find((f) => f.isActive === isActive)?.value ?? 'all';

  const addButton = canManage && (
    <Button asChild>
      <Link to="/instructors/new">
        <PlusIcon aria-hidden="true" />
        اضافة مدرس
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          label="دور على مدرس"
          placeholder="الاسم او الايميل او الموبايل"
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

      {instructors.isPending ? (
        <div className="grid gap-2" aria-label="جاري التحميل">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : instructors.isError ? (
        <Alert variant="danger">
          {instructors.error.message}{' '}
          <Button variant="link" className="h-auto p-0" onClick={() => void instructors.refetch()}>
            جرب تاني
          </Button>
        </Alert>
      ) : instructors.data.data.length === 0 ? (
        <EmptyState
          icon={<UsersIcon aria-hidden="true" />}
          title={filtered ? 'مفيش مدرس بالبحث ده' : 'مفيش مدرسين لسه'}
          description={filtered ? 'جرب كلمة تانية او شيل الفلتر.' : 'ابدأ باضافة اول مدرس.'}
          action={filtered ? undefined : addButton || undefined}
        />
      ) : (
        <>
          <Table aria-busy={instructors.isPlaceholderData || undefined}>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>الايميل</TableHead>
                <TableHead>الموبايل</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instructors.data.data.map((instructor) => (
                <TableRow key={instructor.id}>
                  <TableCell className="font-medium">
                    <Link
                      to={`/instructors/${instructor.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {instructor.name}
                    </Link>
                  </TableCell>
                  <TableCell dir="ltr" className="text-end">
                    {instructor.email ?? '—'}
                  </TableCell>
                  <TableCell dir="ltr" className="text-end">
                    {instructor.phone ?? '—'}
                  </TableCell>
                  <TableCell>
                    <InstructorStatusBadge isActive={instructor.isActive} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            pageSize={INSTRUCTORS_PAGE_SIZE}
            total={instructors.data.meta.total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
