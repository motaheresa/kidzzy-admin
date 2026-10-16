import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read from disk: Vitest's `css: false` turns CSS imports (even ?raw) into empty modules, and
// under jsdom import.meta.url is not a file URL. Vitest runs from apps/web.
const tokensCss = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

// WCAG 2.2 contrast: 4.5:1 for normal text, 3:1 for large text and for the edges of controls.

/** Every --color-* token in tokens.css, read from the file itself (the single source). */
const tokens = Object.fromEntries(
  [...tokensCss.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(([, name, hex]) => [
    name,
    hex.toLowerCase(),
  ]),
);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** [foreground token, background token]: every way text is drawn in the app. */
const TEXT_PAIRS: [string, string][] = [
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

/** [control token, background token]: edges and focus rings that must be seen (non-text, 3:1). */
const UI_PAIRS: [string, string][] = [
  ['input', 'surface'],
  ['input', 'background'],
  ['ring', 'surface'],
  ['ring', 'background'],
];

describe('design tokens: WCAG AA contrast', () => {
  it('parses the color tokens from tokens.css', () => {
    expect(Object.keys(tokens).length).toBeGreaterThan(30);
  });

  it.each(TEXT_PAIRS)('text %s on %s is at least 4.5:1', (fg, bg) => {
    expect(tokens[fg], `missing token --color-${fg}`).toBeDefined();
    expect(tokens[bg], `missing token --color-${bg}`).toBeDefined();
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)('control edge %s on %s is at least 3:1', (fg, bg) => {
    expect(tokens[fg], `missing token --color-${fg}`).toBeDefined();
    expect(tokens[bg], `missing token --color-${bg}`).toBeDefined();
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(3);
  });

  it('documents why yellow is never text on a light surface', () => {
    expect(contrast(tokens.accent, tokens.surface)).toBeLessThan(4.5);
    expect(contrast(tokens.accent, tokens.background)).toBeLessThan(4.5);
  });
});
