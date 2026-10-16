import type { CSSProperties } from 'react';
import { Toaster as Sonner } from 'sonner';

/**
 * The global toaster, where the error layer's reportError() shows messages (ADR-0012).
 * Sonner's own CSS variables are pointed at our tokens, so toasts match the design system.
 */
const tokenStyle = {
  '--normal-bg': 'var(--color-surface)',
  '--normal-text': 'var(--color-foreground)',
  '--normal-border': 'var(--color-border)',
  '--error-bg': 'var(--color-danger-soft)',
  '--error-text': 'var(--color-danger-soft-foreground)',
  '--error-border': 'var(--color-danger-soft)',
  '--success-bg': 'var(--color-success-soft)',
  '--success-text': 'var(--color-success-soft-foreground)',
  '--success-border': 'var(--color-success-soft)',
  '--info-bg': 'var(--color-info-soft)',
  '--info-text': 'var(--color-info-soft-foreground)',
  '--info-border': 'var(--color-info-soft)',
  '--warning-bg': 'var(--color-warning-soft)',
  '--warning-text': 'var(--color-warning-soft-foreground)',
  '--warning-border': 'var(--color-warning-soft)',
  '--border-radius': 'var(--radius-md)',
} as CSSProperties;

export function Toaster() {
  return (
    <Sonner
      dir="rtl"
      position="top-center"
      richColors
      closeButton
      style={tokenStyle}
      toastOptions={{ className: 'font-sans shadow-md' }}
    />
  );
}
