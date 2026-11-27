import { toast } from 'sonner';
import { useApiMutation, useApiQuery, useQueryClient } from '@/lib/query';
import {
  createMaterialLink,
  deleteMaterialLink,
  listMaterialLinks,
  reorderMaterialLinks,
  updateMaterialLink,
} from '../api/materials.api';
import { materialKeys } from '../api/materials.keys';
import { inOrder } from '../lib/links';
import type { MaterialLink, MaterialLinkCreate, MaterialLinkUpdate } from '../types';

/** Every link, in the admin's order. The screen shows its own error. */
export function useMaterialLinks() {
  return useApiQuery({
    queryKey: materialKeys.list(),
    queryFn: ({ signal }) => listMaterialLinks(signal),
    meta: { errorHandling: 'local' },
  });
}

function useRefreshLinks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: materialKeys.all });
}

/** Adding a link. The dialog shows the errors (the title, the address, the limit of 100). */
export function useCreateMaterialLink() {
  const refresh = useRefreshLinks();
  return useApiMutation<MaterialLink, MaterialLinkCreate>({
    mutationFn: createMaterialLink,
    meta: { errorHandling: 'local' },
    onSuccess: async () => {
      await refresh();
      toast.success('اتضاف اللينك');
    },
  });
}

/** Changing a link. The dialog shows the errors. */
export function useUpdateMaterialLink(id: string) {
  const refresh = useRefreshLinks();
  return useApiMutation<MaterialLink, MaterialLinkUpdate>({
    mutationFn: (body) => updateMaterialLink(id, body),
    meta: { errorHandling: 'local' },
    onSuccess: async () => {
      await refresh();
      toast.success('اتعدل اللينك');
    },
  });
}

/** Deleting a link. The confirm dialog shows the error. */
export function useDeleteMaterialLink() {
  const refresh = useRefreshLinks();
  return useApiMutation<void, string>({
    mutationFn: deleteMaterialLink,
    meta: { errorHandling: 'local' },
    onSuccess: async () => {
      await refresh();
      toast.success('اتمسح اللينك');
    },
    onError: () => {
      void refresh();
    },
  });
}

/**
 * Saving a new order, optimistically: the list moves at once, and goes back if the API refuses.
 * A move button has no place to show an error, so it goes to a toast: the global one, except for
 * a refused order (a 422 on `ids`, the list changed meanwhile), which the global reporter leaves
 * to the screen. Either way the list is then read again, and the mutation stays pending until it
 * is.
 */
export function useReorderMaterialLinks() {
  const queryClient = useQueryClient();
  const queryKey = materialKeys.list();
  return useApiMutation<MaterialLink[], string[], { previous: MaterialLink[] | undefined }>({
    mutationFn: reorderMaterialLinks,
    onMutate: async (ids) => {
      // A read that is still running would put the old order back over the new one.
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<MaterialLink[]>(queryKey);
      if (previous) queryClient.setQueryData(queryKey, inOrder(previous, ids));
      return { previous };
    },
    onError: (error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      if (error.fieldErrors?.ids) toast.error(error.fieldErrors.ids);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}
