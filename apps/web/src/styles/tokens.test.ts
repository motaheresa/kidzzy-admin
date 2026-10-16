import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AA_TEXT, AA_UI, contrast, TEXT_PAIRS, UI_PAIRS } from '@/lib/design-tokens';

// WCAG 2.2 contrast: 4.5:1 for normal text, 3:1 for large text and for the edges of controls.

// Read from disk: Vitest's `css: false` turns CSS imports (even ?raw) into empty modules, and
// under jsdom import.meta.url is not a file URL. Vitest runs from apps/web.
const tokensCss = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

/** Every --color-* token in tokens.css, read from the file itself (the single source). */
const tokens = Object.fromEntries(
  [...tokensCss.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(([, name, hex]) => [
    name,
    hex.toLowerCase(),
  ]),
);

describe('design tokens: WCAG AA contrast', () => {
  it('parses the color tokens from tokens.css', () => {
    expect(Object.keys(tokens).length).toBeGreaterThan(30);
  });

  it.each(TEXT_PAIRS)('text %s on %s is at least 4.5:1', (fg, bg) => {
    expect(tokens[fg], `missing token --color-${fg}`).toBeDefined();
    expect(tokens[bg], `missing token --color-${bg}`).toBeDefined();
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(UI_PAIRS)('control edge %s on %s is at least 3:1', (fg, bg) => {
    expect(tokens[fg], `missing token --color-${fg}`).toBeDefined();
    expect(tokens[bg], `missing token --color-${bg}`).toBeDefined();
    expect(contrast(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(AA_UI);
  });

  it('documents why yellow is never text on a light surface', () => {
    expect(contrast(tokens.accent, tokens.surface)).toBeLessThan(AA_TEXT);
    expect(contrast(tokens.accent, tokens.background)).toBeLessThan(AA_TEXT);
  });

  it('computes the known WCAG extremes', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBe(1);
  });
});
