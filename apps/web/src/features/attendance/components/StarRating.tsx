import { StarIcon } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui';
import { cn } from '@/lib/utils';

const STARS = [1, 2, 3, 4, 5] as const;
const NONE = 'none';

/**
 * A 1 to 5 star rating as one accessible radio group (a single-select toggle group: arrow keys
 * move between the stars, Space or Enter picks one). The group is right to left, so the first
 * star is on the right and the arrows follow the reading direction.
 *
 * Without `noneLabel` the rating is optional: pressing the chosen star again clears it (null).
 * With `noneLabel` there is a first option for "none" (null), always one of the choices, which
 * is how homework works: null means there was no homework.
 */
export function StarRating({
  label,
  value,
  onChange,
  noneLabel,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  noneLabel?: string;
}) {
  const selected = value === null ? (noneLabel ? NONE : '') : String(value);

  return (
    <ToggleGroup
      type="single"
      dir="rtl"
      value={selected}
      onValueChange={(next) => {
        if (next === NONE) onChange(null);
        else if (next) onChange(Number(next));
        // Pressing the chosen item again: clear an optional rating, keep a required choice.
        else if (!noneLabel) onChange(null);
      }}
      aria-label={label}
      className="flex-wrap"
    >
      {noneLabel && (
        <ToggleGroupItem value={NONE} className="px-3 text-xs">
          {noneLabel}
        </ToggleGroupItem>
      )}
      {STARS.map((star) => (
        <ToggleGroupItem
          key={star}
          value={String(star)}
          aria-label={star + ' من 5'}
          className="px-1.5 data-[state=on]:bg-transparent data-[state=on]:shadow-none"
        >
          <StarIcon
            aria-hidden="true"
            className={cn(
              'size-6',
              value !== null && star <= value
                ? 'fill-current text-primary'
                : 'text-muted-foreground',
            )}
          />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
