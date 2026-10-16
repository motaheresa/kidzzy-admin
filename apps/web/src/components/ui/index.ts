// Shared UI (docs/design-system.md). Atoms are single primitives (shadcn/ui radix-nova, adapted to
// our tokens; their files keep shadcn's lowercase names). Molecules combine atoms and are ours.
// They know nothing about features, pages or the API (ESLint boundaries, ADR-0011).
export { Alert, AlertDescription, AlertTitle } from './atoms/alert';
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './atoms/alert-dialog';
export { Badge } from './atoms/badge';
export { Button, type ButtonProps } from './atoms/button';
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './atoms/card';
export { Input } from './atoms/input';
export { Label } from './atoms/label';
export { Skeleton } from './atoms/skeleton';
export { Spinner } from './atoms/spinner';
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './atoms/table';
export { Textarea } from './atoms/textarea';
export { ToggleGroup, ToggleGroupItem } from './atoms/toggle-group';
export { ConfirmDialog } from './molecules/ConfirmDialog';
export { DetailList } from './molecules/DetailList';
export { EmptyState } from './molecules/EmptyState';
export { FormField } from './molecules/FormField';
export { FullScreenMessage } from './molecules/FullScreenMessage';
export { PageHeader } from './molecules/PageHeader';
export { Pagination } from './molecules/Pagination';
export { SEARCH_DEBOUNCE_MS, SearchInput } from './molecules/SearchInput';
export { TextareaField } from './molecules/TextareaField';
export { Toaster } from './molecules/Toaster';
