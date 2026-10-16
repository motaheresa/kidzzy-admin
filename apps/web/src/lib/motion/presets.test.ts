import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CSS_EASE, fadeUp, MOTION, stagger } from './presets';

/** jsdom has no matchMedia: answer as a browser whose user does (or does not) reduce motion. */
function setReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('no-preference') ? !reduce : query.includes('reduce') && reduce,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function element() {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

describe('motion presets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it.each([
    ['fadeUp', fadeUp],
    ['stagger', stagger],
  ])('%s does nothing at all under prefers-reduced-motion', (_name, preset) => {
    setReducedMotion(true);
    const el = element();
    const mm = preset([el]);

    expect(el.style.opacity).toBe('');
    expect(el.style.transform).toBe('');
    mm.revert();
  });

  it.each([
    ['fadeUp', fadeUp],
    ['stagger', stagger],
  ])('%s starts from transparent, animating only opacity and transform', (_name, preset) => {
    setReducedMotion(false);
    const el = element();
    const mm = preset([el]);

    expect(el.style.opacity).toBe('0');
    expect(el.style.transform).toMatch(/translate/);
    // Nothing else is animated (no width, height, colors, visibility).
    const touched = Array.from(el.style).filter(
      (p) => !['opacity', 'transform', 'translate'].includes(p),
    );
    expect(touched).toEqual([]);
    mm.revert();
    expect(el.style.opacity).toBe('');
  });

  it('ignores missing targets instead of throwing', () => {
    setReducedMotion(false);
    expect(() => fadeUp(null).revert()).not.toThrow();
    expect(() => stagger(document.querySelectorAll('.none')).revert()).not.toThrow();
  });

  it('stays short: every duration is 150–400 ms', () => {
    for (const seconds of Object.values(MOTION.duration)) {
      expect(seconds).toBeGreaterThanOrEqual(0.15);
      expect(seconds).toBeLessThanOrEqual(0.4);
    }
  });

  it('uses the same durations and easings as the CSS tokens', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
    const token = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1].trim();

    expect(token('duration-fast')).toBe(`${MOTION.duration.fast * 1000}ms`);
    expect(token('duration-base')).toBe(`${MOTION.duration.base * 1000}ms`);
    expect(token('duration-slow')).toBe(`${MOTION.duration.slow * 1000}ms`);
    expect(token('ease-out')).toBe(CSS_EASE.out);
    expect(token('ease-in-out')).toBe(CSS_EASE.inOut);
  });
});
