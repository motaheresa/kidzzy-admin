import { Badge, Card, CardContent, CardHeader } from '@/components/ui';
import { useSession } from '../hooks/useSession';

/** Who is signed in: name, academy and roles. Rendered inside the protected layout. */
export function CurrentUserCard() {
  const { data: me } = useSession();
  if (!me) return null;

  return (
    <Card>
      <CardHeader>
        <h2 className="font-display text-2xl font-bold text-foreground">اهلا {me.name}</h2>
        <p className="text-sm text-muted-foreground">{me.academy.name}</p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {me.roles.map((role) => (
          <Badge key={role} variant="brand">
            {role}
          </Badge>
        ))}
      </CardContent>
    </Card>
  );
}
