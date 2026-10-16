import { gsap } from 'gsap';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CSS_EASE, fadeUp, MOTION, MOTION_ALLOWED, stagger } from './presets';

/** Tween settings; every other key of the vars passed to gsap.from is an animated property. */
const TWEEN_SETTINGS = new Set(['duration', 'ease', 'delay', 'stagger', 'clearProps']);

/**
 * Spies on gsap.from and keeps a COPY of each call's vars: GSAP writes into the object it is
 * given (immediateRender, runBackwards…), so the spy's own record would show GSAP's additions.
 * The real gsap.from still runs.
 */
function recordFrom() {
  const original = gsap.from.bind(gsap);
  const calls: { targets: unknown; vars: gsap.TweenVars; tween: gsap.core.Tween }[] = [];
  const spy = vi.spyOn(gsap, 'from').mockImplementation((targets, vars) => {
    const copy = { ...vars };
    const tween = original(targets, vars);
    calls.push({ targets, vars: copy, tween });
    return tween;
  });
  return { spy, calls };
}

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

// These tests check what a preset ASKS GSAP to do (the gsap.from call), not the element's inline
// style at one instant. The inline style depends on GSAP's render and its global clock, which
// the test does not control, so asserting on it failed now and then on a busy CI runner (PR #13).
// Never return a GSAP timeline or matchMedia from a test or hook: they are thenable, and Vitest
// would wait for them.
describe('motion presets', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it.each([
    ['fadeUp', fadeUp],
    ['stagger', stagger],
  ])('%s does nothing at all under prefers-reduced-motion', (_name, preset) => {
    setReducedMotion(true);
    const from = vi.spyOn(gsap, 'from');
    const el = element();
    const mm = preset([el]);

    expect(window.matchMedia).toHaveBeenCalledWith(MOTION_ALLOWED);
    expect(from).not.toHaveBeenCalled();
    expect(el.style.opacity).toBe('');
    expect(el.style.transform).toBe('');
    mm.revert();
  });

  it.each([
    ['fadeUp', fadeUp],
    ['stagger', stagger],
  ])('%s starts from transparent, animating only opacity and transform', (_name, preset) => {
    setReducedMotion(false);
    const { spy, calls } = recordFrom();
    const el = element();
    const mm = preset([el]);

    expect(spy).toHaveBeenCalledOnce();
    const { targets, vars, tween } = calls[0];
    expect(targets).toEqual([el]);
    // From transparent and a few pixels lower (y is a transform), then the inline styles are
    // cleared, so the element ends exactly as its CSS says.
    expect(vars).toMatchObject({ opacity: 0, clearProps: 'opacity,transform' });
    expect(vars.y).toBeGreaterThan(0);
    // Nothing else is animated (no width, height, colors, visibility).
    const animated = Object.keys(vars).filter((key) => !TWEEN_SETTINGS.has(key));
    expect(animated.sort()).toEqual(['opacity', 'y']);
    expect(vars.duration).toBeLessThanOrEqual(MOTION.duration.slow);

    // revert() kills the tween, wherever GSAP's clock had got to.
    mm.revert();
    expect(gsap.getTweensOf(el)).not.toContain(tween);
  });

  it('does nothing, and never throws, when the browser has no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    const from = vi.spyOn(gsap, 'from');
    const el = element();
    expect(() => fadeUp([el]).revert()).not.toThrow();
    expect(from).not.toHaveBeenCalled();
    expect(el.style.opacity).toBe('');
  });

  it('ignores missing targets instead of throwing', () => {
    setReducedMotion(false);
    const from = vi.spyOn(gsap, 'from');
    expect(() => fadeUp(null).revert()).not.toThrow();
    expect(() => stagger(document.querySelectorAll('.none')).revert()).not.toThrow();
    expect(from).not.toHaveBeenCalled();
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
