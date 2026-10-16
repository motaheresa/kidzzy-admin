import { Button } from '../components/ui';
import { useLogout, type Me } from '../features/auth';

/** Shows who is signed in until the real screens arrive. */
export function HomePage({ me, onLoggedOut }: { me: Me; onLoggedOut: () => void }) {
  const logout = useLogout();

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">اهلا {me.name}</h1>
      <p className="text-neutral-600">
        {me.academy.name} · {me.roles.join('، ')}
      </p>
      {/* Signed out on this device whatever the API answers, as before (onSettled). */}
      <Button
        variant="secondary"
        onClick={() => logout.mutate(undefined, { onSettled: onLoggedOut })}
      >
        تسجيل الخروج
      </Button>
    </main>
  );
}
