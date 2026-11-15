/**
 * The logo and the two-line title of a header: the app shell shows "كيدزي كودرز" over the academy's
 * name, the reports workspace shows "التقارير" over the same name. One piece of markup, so the two
 * headers cannot drift apart.
 */
export function BrandHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <img src="/pwa-64x64.png" alt="" width={40} height={40} className="size-10 shrink-0" />
      <div className="grid min-w-0 leading-tight">
        <span className="truncate font-display text-lg font-bold text-primary">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
      </div>
    </>
  );
}
