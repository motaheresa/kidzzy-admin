import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import type { RefObject } from 'react';

// Register the hook with GSAP once (avoids React version mismatches, per @gsap/react docs).
gsap.registerPlugin(useGSAP);

/**
 * Runs motion presets for a component. Everything created inside `setup` (tweens and the presets'
 * matchMedia) is reverted when the component unmounts, which keeps React Strict Mode's double
 * effects from stacking animations. Pass elements from refs to the presets.
 *
 *   const root = useRef<HTMLDivElement>(null);
 *   useMotion(root, () => {
 *     fadeUp(root.current);
 *     stagger(root.current?.querySelectorAll('[data-motion-item]') ?? null, { delay: 0.1 });
 *   });
 */
export function useMotion(
  scope: RefObject<HTMLElement | null>,
  setup: () => void,
  dependencies: unknown[] = [],
): void {
  useGSAP(setup, { scope, dependencies });
}
