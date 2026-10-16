import { ArrowLeftIcon, InboxIcon, PlusIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DetailList,
  EmptyState,
  FormField,
  FullScreenMessage,
  PageHeader,
  Pagination,
  SearchInput,
  Skeleton,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui';
import { AA_TEXT, AA_UI, contrast, TEXT_PAIRS, UI_PAIRS } from '@/lib/design-tokens';
import { formatMoney, formatNumber } from '@/lib/format';
import { fadeUp, MOTION_ALLOWED, stagger } from '@/lib/motion';

// Development only (registered when import.meta.env.DEV, lazy-loaded, absent from production):
// every token and component state on one page, to review the design system at 390 and 1280 px.

const COLOR_TOKENS = [
  'background',
  'surface',
  'muted',
  'border',
  'input',
  'ring',
  'foreground',
  'muted-foreground',
  'primary',
  'primary-hover',
  'secondary',
  'accent',
  'accent-soft',
  'deep',
  'brand-950',
  'brand-900',
  'brand-800',
  'brand-700',
  'brand-500',
  'brand-100',
  'brand-50',
  'success',
  'success-soft',
  'warning-soft',
  'danger',
  'danger-soft',
  'info-soft',
];

/** A --color-* token as #rrggbb, read from the page's computed styles. */
function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
}

const DEMO_ROWS = [
  { name: 'منى عادل', phone: '01012345678', active: true },
  { name: 'أحمد سمير', phone: '01198765432', active: true },
  { name: 'سارة محمود', phone: '01234567890', active: false },
];

/** A list screen's parts together, with local state instead of the URL. */
function ListDemo() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const rows = DEMO_ROWS.filter(
    (row) =>
      row.name.includes(search) && (filter === 'all' || row.active === (filter === 'active')),
  );
  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput label="دور" placeholder="الاسم" onSearch={setSearch} />
          <ToggleGroup
            type="single"
            aria-label="الحالة"
            value={filter}
            onValueChange={(value) => value && setFilter(value)}
          >
            <ToggleGroupItem value="all">الكل</ToggleGroupItem>
            <ToggleGroupItem value="active">شغالين</ToggleGroupItem>
            <ToggleGroupItem value="inactive">متوقفين</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الاسم</TableHead>
              <TableHead>الموبايل</TableHead>
              <TableHead>الحالة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.name}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell dir="ltr" className="text-end">
                  {row.phone}
                </TableCell>
                <TableCell>
                  <Badge variant={row.active ? 'success' : 'neutral'}>
                    {row.active ? 'شغال' : 'متوقف'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination page={page} pageSize={20} total={45} onPageChange={setPage} />
      </CardContent>
    </Card>
  );
}

function ConfirmDemo() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="outline">ايقاف المدرس</Button>}
      title="توقف منى عادل؟"
      description="مش هتقدر تسجل دخول، وبياناتها هتفضل زي ما هي."
      confirmLabel="ايوه، وقفها"
      tone="danger"
      busy={busy}
      onConfirm={() => {
        setBusy(true);
        setTimeout(() => {
          setBusy(false);
          setOpen(false);
        }, 1200);
      }}
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4">
      <h2 className="font-display text-xl font-bold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function PairTable({ pairs, min }: { pairs: readonly (readonly [string, string])[]; min: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-start text-muted-foreground">
          <tr>
            <th className="p-2 text-start font-medium">العينة</th>
            <th className="p-2 text-start font-medium">النص / الخلفية</th>
            <th className="p-2 text-start font-medium">النسبة</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map(([fg, bg]) => {
            const ratio = contrast(readToken(fg), readToken(bg));
            return (
              <tr key={`${fg}/${bg}`} className="border-t border-border">
                <td className="p-2">
                  <span
                    className="inline-block rounded-sm px-2 py-1 font-medium"
                    style={{ color: `var(--color-${fg})`, backgroundColor: `var(--color-${bg})` }}
                  >
                    نص Aa 123
                  </span>
                </td>
                <td className="p-2 font-mono text-xs" dir="ltr">
                  {fg} / {bg}
                </td>
                <td className="numeric p-2">
                  <Badge variant={ratio >= min ? 'success' : 'danger'}>
                    {ratio.toFixed(2)}:1 {ratio >= min ? '✓' : '✗'}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MotionDemo() {
  const list = useRef<HTMLUListElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(MOTION_ALLOWED);
    setAllowed(query.matches);
    const onChange = () => setAllowed(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return (
    <div className="grid gap-3">
      <Alert variant={allowed ? 'info' : 'warning'}>
        <AlertDescription>
          {allowed
            ? 'الحركة مسموحة على الجهاز ده.'
            : 'الجهاز طالب تقليل الحركة: الـ presets مش هتعمل حاجة.'}
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => fadeUp(card.current)}>
          fadeUp
        </Button>
        <Button
          variant="outline"
          onClick={() => stagger(list.current ? Array.from(list.current.children) : null)}
        >
          stagger
        </Button>
      </div>
      <Card ref={card} className="max-w-sm">
        <CardContent>كارت بيدخل بـ fadeUp</CardContent>
      </Card>
      <ul ref={list} className="grid max-w-sm gap-2">
        {['الجروب الأول', 'الجروب التاني', 'الجروب التالت'].map((item) => (
          <li key={item} className="rounded-md bg-surface p-3 shadow-sm">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DesignSystemPage() {
  return (
    <main className="mx-auto grid max-w-5xl gap-10 px-4 py-8">
      <PageHeader
        title="Design system"
        description="صفحة للتطوير بس: كل الـ tokens والـ components بكل حالاتها."
        actions={<Badge variant="accent">DEV</Badge>}
      />

      <Section title="الألوان">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {COLOR_TOKENS.map((name) => (
            <div key={name} className="overflow-hidden rounded-md border border-border bg-surface">
              <div className="h-14" style={{ backgroundColor: `var(--color-${name})` }} />
              <div className="p-2 text-xs" dir="ltr">
                <div className="font-medium">{name}</div>
                <div className="font-mono text-muted-foreground">{readToken(name)}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`أزواج النص والخلفية (AA ${AA_TEXT}:1)`}>
        <PairTable pairs={TEXT_PAIRS} min={AA_TEXT} />
      </Section>

      <Section title={`حواف الـ controls والـ focus (AA ${AA_UI}:1)`}>
        <PairTable pairs={UI_PAIRS} min={AA_UI} />
      </Section>

      <Section title="الخطوط والأحجام">
        <p className="font-display text-4xl font-bold">Baloo Bhaijaan 2 للعناوين</p>
        <p className="text-base">Cairo للواجهة: نص عادي بالعربي وEnglish مع بعض.</p>
        {(
          ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'] as const
        ).map((size) => (
          <p key={size} className={size}>
            <span className="font-mono text-xs text-muted-foreground" dir="ltr">
              {size}
            </span>{' '}
            كيدزي كودرز بتعلم الأطفال البرمجة
          </p>
        ))}
        <p className="numeric">
          الأرقام: {formatNumber(1234567)} · {formatMoney('1500.00')}
        </p>
      </Section>

      <Section title="Buttons">
        {(['primary', 'secondary', 'outline', 'ghost', 'danger', 'accent', 'link'] as const).map(
          (variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-2">
              <span className="w-20 font-mono text-xs text-muted-foreground" dir="ltr">
                {variant}
              </span>
              <Button variant={variant}>حفظ</Button>
              <Button variant={variant} size="lg">
                حفظ
              </Button>
              <Button variant={variant} disabled>
                مقفول
              </Button>
              <Button variant={variant} loading>
                جاري الحفظ
              </Button>
              <Button variant={variant} size="icon" aria-label="إضافة">
                <PlusIcon />
              </Button>
            </div>
          ),
        )}
        <div className="flex gap-2">
          <Button variant="outline">
            التالي <ArrowLeftIcon className="rtl:rotate-0 ltr:rotate-180" />
          </Button>
        </div>
      </Section>

      <Section title="Form fields">
        <div className="grid max-w-sm gap-4">
          <FormField label="الاسم" placeholder="اكتب الاسم" />
          <FormField label="الموبايل" hint="مثال: 01012345678" dir="ltr" className="text-start" />
          <FormField
            label="الايميل"
            error="اكتب ايميل صحيح"
            defaultValue="ahmed@"
            dir="ltr"
            className="text-start"
          />
          <FormField label="مقفول" disabled defaultValue="مش متاح" />
        </div>
      </Section>

      <Section title="Alerts">
        <div className="grid gap-3">
          <Alert variant="info">
            <AlertTitle>معلومة</AlertTitle>
            <AlertDescription>الحصة الجاية بكرة الساعة 5.</AlertDescription>
          </Alert>
          <Alert variant="success">
            <AlertDescription>اتسجل الدفع.</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertDescription>فاضل حصتين على نهاية الدورة.</AlertDescription>
          </Alert>
          <Alert variant="danger">
            <AlertDescription>بيانات الدخول غير صحيحة</AlertDescription>
          </Alert>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          {(['neutral', 'brand', 'accent', 'success', 'warning', 'danger', 'info'] as const).map(
            (variant) => (
              <Badge key={variant} variant={variant}>
                {variant}
              </Badge>
            ),
          )}
        </div>
      </Section>

      <Section title="Card, Skeleton, Spinner">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>جروب سكراتش 1</CardTitle>
              <CardDescription>الأحد والتلات · 5 مساءً</CardDescription>
            </CardHeader>
            <CardContent>12 طالب</CardContent>
            <CardFooter>
              <Button variant="outline">التفاصيل</Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Spinner /> <span className="text-sm text-muted-foreground">جاري التحميل</span>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Empty state">
        <Card>
          <EmptyState
            icon={<InboxIcon aria-hidden="true" />}
            title="مفيش جروبات لسه"
            description="ابدأ بأول جروب، وهيظهر هنا."
            action={
              <Button>
                <PlusIcon /> إضافة جروب
              </Button>
            }
          />
        </Card>
      </Section>

      <Section title="Lists: search, filter, table, pagination">
        <ListDemo />
      </Section>

      <Section title="Detail list, textarea">
        <Card>
          <CardContent className="grid gap-4">
            <DetailList
              items={[
                { label: 'الايميل', value: 'mona@kidzzy.test', dir: 'ltr' },
                { label: 'رقم الموبايل', value: null },
                { label: 'اتضاف في', value: '16 أكتوبر 2026' },
              ]}
            />
            <Textarea placeholder="ملاحظات" aria-label="ملاحظات" />
          </CardContent>
        </Card>
      </Section>

      <Section title="Confirm dialog">
        <ConfirmDemo />
      </Section>

      <Section title="Toasts">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => toast.error('مفيش اتصال بالسيرفر، اتأكد من الانترنت وجرب تاني')}
          >
            error
          </Button>
          <Button variant="outline" onClick={() => toast.success('اتحفظ')}>
            success
          </Button>
          <Button variant="outline" onClick={() => toast.info('معلومة')}>
            info
          </Button>
        </div>
      </Section>

      <Section title="Full-screen states">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-border [&>main]:min-h-64">
            <FullScreenMessage busy title="جاري التحميل" />
          </div>
          <div className="overflow-hidden rounded-lg border border-border [&>main]:min-h-64">
            <FullScreenMessage title="حصلت مشكلة، جرب تاني" description="بياناتك محفوظة.">
              <Button>جرب تاني</Button>
            </FullScreenMessage>
          </div>
        </div>
      </Section>

      <Section title="Motion">
        <MotionDemo />
      </Section>
    </main>
  );
}
