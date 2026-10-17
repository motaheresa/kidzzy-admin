import { GraduationCapIcon, PlusIcon } from 'lucide-react';
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
import { STUDENTS_PAGE_SIZE } from '../api/students.api';
import { useStudents } from '../hooks/useStudents';
import { StudentStatusBadge } from './StudentStatusBadge';

const ACTIVE_FILTERS = [
  { value: 'all', label: 'الكل', isActive: undefined },
  { value: 'active', label: 'نشطين', isActive: true },
  { value: 'inactive', label: 'متوقفين', isActive: false },
] as const;

/** What the empty list says, from the most specific reason to the least. */
function emptyText(ownOnly: boolean, search: string, isActive: boolean | undefined) {
  if (ownOnly) {
    return {
      title: 'مفيش طلاب في جروباتك لسه',
      description: 'الطلاب اللي في الجروبات اللي بتدرسها هيظهروا هنا.',
    };
  }
  if (search) {
    return {
      title: 'مفيش طالب بالاسم او الكود ده',
      description: 'جرب جزء من الاسم او الكود، او شيل الفلتر.',
    };
  }
  if (isActive !== undefined)
    return { title: 'مفيش طلاب بالحالة دي', description: 'جرب فلتر تاني.' };
  return { title: 'مفيش طلاب لسه', description: 'ابدأ باضافة اول طالب.' };
}

/**
 * The students list (US-05, US-06): search by name or code, the active filter and the page, all
 * kept in the URL; a table with a link to each student; empty and error states.
 */
export function StudentsList() {
  const { page, search, isActive, setPage, setSearch, setIsActive } = useListParams();
  const students = useStudents({ page, search, isActive });
  const { can, scopeFor } = usePermissions();
  const canManage = can('students.manage');
  // An instructor reads only their own students: those of the groups they teach (US-07/08).
  const ownOnly = scopeFor('students.read') === 'own';
  const filter = ACTIVE_FILTERS.find((f) => f.isActive === isActive)?.value ?? 'all';

  const addButton = canManage && (
    <Button asChild>
      <Link to="/students/new">
        <PlusIcon aria-hidden="true" />
        اضافة طالب
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          label="دور على طالب"
          placeholder="الاسم او الكود"
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

      {students.isPending ? (
        <div className="grid gap-2" aria-label="جاري التحميل">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : students.isError ? (
        <Alert variant="danger">
          {students.error.message}{' '}
          <Button variant="link" className="h-auto p-0" onClick={() => void students.refetch()}>
            جرب تاني
          </Button>
        </Alert>
      ) : students.data.data.length === 0 ? (
        <EmptyState
          icon={<GraduationCapIcon aria-hidden="true" />}
          {...emptyText(ownOnly, search, isActive)}
          action={
            !ownOnly && !search && isActive === undefined ? addButton || undefined : undefined
          }
        />
      ) : (
        <>
          <Table aria-busy={students.isPlaceholderData || undefined}>
            <TableHeader>
              <TableRow>
                <TableHead>الطالب</TableHead>
                <TableHead>الكود</TableHead>
                <TableHead>ولي الامر</TableHead>
                <TableHead>رقم ولي الامر</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.data.data.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium">
                    <Link
                      to={`/students/${student.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {student.name}
                    </Link>
                  </TableCell>
                  <TableCell dir="ltr" className="text-end">
                    {student.code}
                  </TableCell>
                  <TableCell>{student.parentName}</TableCell>
                  <TableCell dir="ltr" className="text-end">
                    {student.parentPhone}
                  </TableCell>
                  <TableCell>
                    <StudentStatusBadge isActive={student.isActive} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            pageSize={STUDENTS_PAGE_SIZE}
            total={students.data.meta.total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
