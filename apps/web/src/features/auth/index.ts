// Public API of the auth feature. Pages, layouts and other features import from here only,
// never from its folders (enforced by ESLint boundaries, ADR-0011).
export { authKeys } from './api/auth.keys';
export { CurrentUserCard } from './components/CurrentUserCard';
export { LoginForm } from './components/LoginForm';
export { LogoutButton } from './components/LogoutButton';
export { useLogin } from './hooks/useLogin';
export { useLogout } from './hooks/useLogout';
export { usePermissions } from './hooks/usePermissions';
export { useSession } from './hooks/useSession';
export { scopeOf } from './permissions';
export { markSignedOut, SESSION_STALE_TIME_MS } from './session';
export type { LoginInput, Me } from './types';
