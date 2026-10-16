import { CurrentUserCard, LogoutButton } from '../features/auth';

/** Home: shows who is signed in until the real screens arrive. Composition only. */
export function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
      <CurrentUserCard />
      <LogoutButton />
    </main>
  );
}
