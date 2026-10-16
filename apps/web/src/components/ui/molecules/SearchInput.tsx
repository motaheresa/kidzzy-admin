import { SearchIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '../atoms/input';

/** How long typing must pause before the search runs. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * A search box that calls `onSearch` once typing pauses (debounce), with the trimmed text, so a
 * list is not asked for on every key. It starts from `defaultValue` (for example the URL's
 * ?search=) and keeps its own text while the user types.
 */
export function SearchInput({
  defaultValue = '',
  onSearch,
  label,
  placeholder,
  className,
}: {
  defaultValue?: string;
  onSearch: (search: string) => void;
  /** Read by screen readers; the box has no visible label. */
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(defaultValue);
  // The latest callback, so a new function from the parent never restarts the timer.
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });
  const lastSent = useRef(defaultValue.trim());

  useEffect(() => {
    const search = text.trim();
    if (search === lastSent.current) return;
    const timer = setTimeout(() => {
      lastSent.current = search;
      onSearchRef.current(search);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div data-slot="search-input" className={cn('relative w-full sm:max-w-xs', className)}>
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="ps-10"
      />
    </div>
  );
}
