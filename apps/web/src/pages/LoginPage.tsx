import { useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { LoginForm } from '@/features/auth';
import { fadeUp, stagger, useMotion } from '@/lib/motion';

/**
 * The login screen (US-01): a brand panel (the academy's deep purple, logo and display font, as on
 * its posters) and the form card. On a phone the panel sits above the form; from lg they share
 * the screen. The entrance runs only when motion is allowed.
 */
export function LoginPage() {
  const root = useRef<HTMLElement>(null);
  const brand = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLDivElement>(null);

  useMotion(root, () => {
    fadeUp(brand.current);
    // The form's rows (fields, alert, button) enter one after the other.
    const rows = form.current?.querySelector('form')?.children;
    stagger(rows ? Array.from(rows) : null, { delay: 0.1 });
  });

  return (
    <main ref={root} className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative isolate flex items-center justify-center overflow-hidden bg-deep px-6 py-10 text-deep-foreground lg:py-16">
        {/* Soft glows, like the posters' lighting; decorative only. */}
        <div
          aria-hidden="true"
          className="absolute -end-24 -top-24 -z-10 size-72 rounded-full bg-brand-500/30 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -start-16 -bottom-20 -z-10 size-56 rounded-full bg-accent/15 blur-3xl"
        />

        <div ref={brand} className="flex max-w-sm flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-surface p-2 shadow-lg">
            <img
              src="/pwa-192x192.png"
              alt="شعار كيدزي كودرز"
              width={88}
              height={88}
              className="size-20 lg:size-22"
            />
          </div>
          <h1 className="font-display text-4xl font-bold">كيدزي كودرز</h1>
          <p className="text-lg text-deep-foreground/90">
            نظام ادارة <span className="font-semibold text-accent">الأكاديمية</span>
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="font-display text-2xl">تسجيل الدخول</CardTitle>
            <p className="text-sm text-muted-foreground">بالايميل او رقم الموبايل</p>
          </CardHeader>
          <CardContent>
            <div ref={form}>
              <LoginForm />
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
