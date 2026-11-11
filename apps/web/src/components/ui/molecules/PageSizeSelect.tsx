import { SelectField } from './SelectField';

/** The page sizes offered by default. */
const DEFAULT_CHOICES: readonly number[] = [25, 50, 100];

/**
 * How many rows a table shows per page: a labelled select next to Pagination. It does not hide
 * on a single page (unlike Pagination), so the choice is always there.
 */
export function PageSizeSelect({
  value,
  onChange,
  choices = DEFAULT_CHOICES,
  className,
}: {
  value: number;
  onChange: (pageSize: number) => void;
  choices?: readonly number[];
  className?: string;
}) {
  return (
    <div className={className}>
      <SelectField
        label="عدد الصفوف في الصفحة"
        value={String(value)}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </SelectField>
    </div>
  );
}
