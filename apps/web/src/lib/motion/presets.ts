import { gsap } from 'gsap';

/**
 * Motion values for GSAP: the same as the CSS tokens in src/styles/tokens.css (--duration-*,
 * --ease-*), in seconds. A test keeps the two in step.
 */
export const MOTION = {
  duration: { fast: 0.15, base: 0.25, slow: 0.4 },
  ease: { out: 'power3.out', inOut: 'power2.inOut' },
} as const;

/** The CSS cubic-bezier each GSAP ease matches (tokens.css). */
export const CSS_EASE = {
  out: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
  inOut: 'cubic-bezier(0.455, 0.03, 0.515, 0.955)',
} as const;

/** Motion runs only when the user has not asked the system for reduced motion. */
export const MOTION_ALLOWED = '(prefers-reduced-motion: no-preference)';

/** Elements to animate: pass elements from refs, not selector strings (see useMotion). */
export type MotionTargets = Element | Element[] | NodeListOf<Element> | null;

/**
 * Runs `animate` only when motion is allowed. Under prefers-reduced-motion nothing runs at all,
 * so the content is simply there. Returns the gsap.matchMedia, which reverts on .revert() and is
 * reverted automatically when created inside useMotion.
 */
export function withMotion(animate: () => void): gsap.MatchMedia {
  const mm = gsap.matchMedia();
  mm.add(MOTION_ALLOWED, animate);
  return mm;
}

function present(targets: MotionTargets): targets is Element | Element[] | NodeListOf<Element> {
  if (!targets) return false;
  return targets instanceof Element || targets.length > 0;
}

/**
 * Entering content: rises a few pixels while fading in (opacity and transform only). It never
 * blocks input: the element is interactive at once, and the inline styles are cleared at the end.
 */
export function fadeUp(
  targets: MotionTargets,
  { delay = 0, distance = 12 }: { delay?: number; distance?: number } = {},
): gsap.MatchMedia {
  return withMotion(() => {
    if (!present(targets)) return;
    gsap.from(targets, {
      opacity: 0,
      y: distance,
      duration: MOTION.duration.slow,
      ease: MOTION.ease.out,
      delay,
      clearProps: 'opacity,transform',
    });
  });
}

/** Entering items of a list or a form, one after the other (opacity and transform only). */
export function stagger(
  targets: MotionTargets,
  { delay = 0, each = 0.06 }: { delay?: number; each?: number } = {},
): gsap.MatchMedia {
  return withMotion(() => {
    if (!present(targets)) return;
    gsap.from(targets, {
      opacity: 0,
      y: 8,
      duration: MOTION.duration.base,
      ease: MOTION.ease.out,
      delay,
      stagger: each,
      clearProps: 'opacity,transform',
    });
  });
}

// Press feedback is CSS, not GSAP: Button has `motion-safe:active:scale-[0.98]` with
// `duration-fast ease-out` (the same tokens), so no JavaScript runs per control.
