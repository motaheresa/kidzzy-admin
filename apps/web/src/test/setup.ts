import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no layout engine and no ResizeObserver. Recharts' ResponsiveContainer needs one, so
// this one reports a fixed 640x288 box as soon as an element is observed: a chart draws its bars
// and axes in a test as it would in a browser.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      queueMicrotask(() =>
        this.callback(
          [{ target, contentRect: { width: 640, height: 288 } } as ResizeObserverEntry],
          this,
        ),
      );
    }
    unobserve() {}
    disconnect() {}
  };
}

afterEach(() => cleanup());
