import { useState } from 'react';
import { ClipboardCheckIcon } from 'lucide-react';
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Label,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
} from '@/components/ui';
import { formatDate, formatNumber } from '@/lib/format';
import {
  useAcademySettings,
  useCancelEvaluationRequest,
  usePendingEvaluationRequests,
  useUpdateAcademySettings,
} from '../hooks/useEvaluations';
import type { EvaluationRequest } from '../types';

/**
 * The admin's evaluation settings (US-42): the rule on or off, and the pending requests with a
 * cancel action. A request by the admin is made from the student's page.
 */
export function EvaluationSettingsScreen() {
  return (
    <div className="flex flex-col gap-6">
      <RuleCard />
      <PendingRequests />
    </div>
  );
}

function RuleCard() {
  const settings = useAcademySettings();
  const update = useUpdateAcademySettings();
  return (
    <Card>
      <CardHeader>
        <CardTitle>التقييم الإجباري</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {settings.isPending ? (
          <Skeleton className="h-11 w-40" aria-label="جاري التحميل" />
        ) : settings.isError ? (
          <Alert variant="danger">{settings.error.message}</Alert>
        ) : (
          <div className="flex items-center gap-3">
            <Switch
              id="evaluations-required"
              checked={settings.data.evaluationsRequired}
              disabled={update.isPending}
              onCheckedChange={(evaluationsRequired) => update.mutate({ evaluationsRequired })}
            />
            <Label htmlFor="evaluations-required">
              {settings.data.evaluationsRequired ? 'شغّال' : 'واقف'}
            </Label>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          لما يكون شغّال: كل ما دورة طالب تخلص (تبقى مستحقة)، المدرس اللي عمل آخر حصة لازم يكتب
          تقييم للطالب قبل ما يكمل شغله على التطبيق. لما توقفه، الطلبات اللي جاية من الدورات مبتمنعش
          المدرس، وطلب التقييم اللي بتعمله إنت من صفحة الطالب بيمنعه في الحالتين.
        </p>
      </CardContent>
    </Card>
  );
}

function PendingRequests() {
  const pending = usePendingEvaluationRequests();
  return (
    <section className="flex flex-col gap-3" aria-label="طلبات التقييم المستنية">
      <h2 className="text-lg font-semibold">طلبات مستنية</h2>
      {pending.isPending ? (
        <Skeleton className="h-32 w-full" aria-label="جاري التحميل" />
      ) : pending.isError ? (
        <Alert variant="danger">{pending.error.message}</Alert>
      ) : pending.data.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheckIcon aria-hidden="true" />}
          title="مفيش طلبات تقييم مستنية"
          className="py-6"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الطالب</TableHead>
              <TableHead>المدرس</TableHead>
              <TableHead>الجروب</TableHead>
              <TableHead>السبب</TableHead>
              <TableHead>اتطلب</TableHead>
              <TableHead>
                <span className="sr-only">إجراءات</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.data.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-medium whitespace-nowrap">
                  {request.student.name}
                </TableCell>
                <TableCell className="whitespace-nowrap">{request.instructor.name}</TableCell>
                <TableCell className="whitespace-nowrap">{request.group.name}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {request.cycleNumber === null
                    ? 'طلب من الإدارة'
                    : `الدورة رقم ${formatNumber(request.cycleNumber)} خلصت`}
                </TableCell>
                <TableCell className="numeric whitespace-nowrap">
                  {formatDate(request.requestedAt)}
                </TableCell>
                <TableCell>
                  <CancelRequestButton request={request} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function CancelRequestButton({ request }: { request: EvaluationRequest }) {
  const [open, setOpen] = useState(false);
  const cancel = useCancelEvaluationRequest();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) cancel.reset();
      }}
      trigger={
        <Button variant="outline" size="md">
          إلغاء
        </Button>
      }
      title={`إلغاء طلب تقييم ${request.student.name}؟`}
      description={`المدرس ${request.instructor.name} مش هيبقى مطلوب منه يكتبه.`}
      confirmLabel="إلغاء الطلب"
      tone="danger"
      busy={cancel.isPending}
      onConfirm={() => cancel.mutate(request.id, { onSuccess: () => setOpen(false) })}
    >
      {cancel.error && <Alert variant="danger">{cancel.error.message}</Alert>}
    </ConfirmDialog>
  );
}
