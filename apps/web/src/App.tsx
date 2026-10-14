import { useEffect, useState } from 'react';
import { API_PREFIX } from '@kidzzy/shared';

type ApiState = 'checking' | 'up' | 'down';

const LABELS: Record<ApiState, string> = {
  checking: 'بنتاكد من السيرفر…',
  up: 'السيرفر شغال',
  down: 'السيرفر مش متاح',
};

/** Placeholder shell until Sprint 1 adds login and the real screens. */
export default function App() {
  const [api, setApi] = useState<ApiState>('checking');

  useEffect(() => {
    fetch(`/${API_PREFIX}/health`)
      .then((res) => setApi(res.ok ? 'up' : 'down'))
      .catch(() => setApi('down'));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">كيدزي كودرز</h1>
      <p className="text-neutral-600">نظام ادارة الاكاديمية</p>
      <p role="status" className="rounded-full border px-4 py-1 text-sm">
        {LABELS[api]}
      </p>
    </main>
  );
}
