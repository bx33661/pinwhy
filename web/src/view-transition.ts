import { flushSync } from 'react-dom';

type DocWithVT = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<unknown> };
};

export type MotionMode = 'fluid' | 'reduced';

export function isMotionReduced(mode?: MotionMode): boolean {
  if (mode === 'reduced') return true;
  if (typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduced') return true;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  return false;
}

/**
 * Run a DOM state update through the View Transition API when supported and motion is enabled.
 * Providing pointer origin triggers a circular reveal expanding from the toggle button.
 */
export function runViewTransition(apply: () => void, origin?: { x: number; y: number }) {
  if (
    typeof document === 'undefined'
    || typeof window === 'undefined'
    || isMotionReduced()
    || typeof (document as DocWithVT).startViewTransition !== 'function'
  ) {
    apply();
    return;
  }

  const root = document.documentElement;
  if (origin) {
    const maxR = Math.hypot(
      Math.max(origin.x, window.innerWidth - origin.x),
      Math.max(origin.y, window.innerHeight - origin.y),
    );
    root.style.setProperty('--vt-x', `${origin.x}px`);
    root.style.setProperty('--vt-y', `${origin.y}px`);
    root.style.setProperty('--vt-r', `${Math.ceil(maxR)}px`);
    root.dataset.vt = 'ripple';
  } else {
    root.dataset.vt = 'fade';
  }

  const transition = (document as DocWithVT).startViewTransition!(() => {
    flushSync(apply);
  });
  void transition.finished.finally(() => {
    delete root.dataset.vt;
  });
}
