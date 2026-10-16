import { useSession } from '../hooks/useSession';

/** Who is signed in: name, academy and roles. Rendered inside the protected layout. */
export function CurrentUserCard() {
  const { data: me } = useSession();
  if (!me) return null;

  return (
    <>
      <h1 className="text-2xl font-semibold">اهلا {me.name}</h1>
      <p className="text-neutral-600">
        {me.academy.name} · {me.roles.join('، ')}
      </p>
    </>
  );
}
