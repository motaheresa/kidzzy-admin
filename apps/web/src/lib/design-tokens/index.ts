// The design system's contrast contract (docs/design-system.md): which tokens are drawn on which,
// and how WCAG measures them. Used by src/styles/tokens.test.ts and the dev preview page.

/** WCAG 2.x relative luminance of a #rrggbb color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colors, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Normal text needs 4.5:1. Large text and the edges of controls need 3:1. */
export const AA_TEXT = 4.5;
export const AA_UI = 3;

/** [text token, background token]: every way text is drawn in the app (4.5:1). */
export const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['foreground', 'background'],
  ['foreground', 'surface'],
  ['card-foreground', 'card'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'surface'],
  ['muted-foreground', 'muted'],
  ['primary-foreground', 'primary'],
  ['primary-foreground', 'primary-hover'],
  ['primary', 'surface'], // links
  ['primary', 'background'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'], // ink on yellow
  ['accent-foreground', 'accent-soft'],
  ['deep-foreground', 'deep'],
  ['accent', 'deep'], // yellow highlight on the deep brand panel
  ['success-foreground', 'success'],
  ['success-soft-foreground', 'success-soft'],
  ['warning-soft-foreground', 'warning-soft'],
  ['danger-foreground', 'danger'],
  ['danger-soft-foreground', 'danger-soft'],
  ['danger', 'surface'], // field error text
  ['destructive', 'surface'],
  ['info-soft-foreground', 'info-soft'],
];

/** [control token, background token]: edges and focus rings that must be seen (3:1). */
export const UI_PAIRS: readonly (readonly [string, string])[] = [
  ['input', 'surface'],
  ['input', 'background'],
  ['ring', 'surface'],
  ['ring', 'background'],
];
