/** A loading indicator; screen readers announce its label (role="status"). */
export function Spinner({ label = 'جاري التحميل' }: { label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex">
      <span
        aria-hidden="true"
        className="size-8 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-900"
      />
    </span>
  );
}
