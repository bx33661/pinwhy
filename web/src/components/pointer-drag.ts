import type { PointerEvent as ReactPointerEvent } from 'react';

/** Capture a primary-button pointer drag and clean up global move/end listeners automatically. */
export function startPointerDrag(
  event: ReactPointerEvent<HTMLElement>,
  onMove: (delta: { dx: number; dy: number }, moveEvent: PointerEvent) => void,
): void {
  if (event.button !== 0) return;
  event.preventDefault();
  try {
    event.currentTarget.setPointerCapture?.(event.pointerId);
  } catch { /* synthetic events may not own an active pointer id */ }
  const startX = event.clientX;
  const startY = event.clientY;
  const handleMove = (moveEvent: PointerEvent) => {
    onMove({ dx: moveEvent.clientX - startX, dy: moveEvent.clientY - startY }, moveEvent);
  };
  const cleanup = () => {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', cleanup);
    window.removeEventListener('pointercancel', cleanup);
  };
  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', cleanup);
  window.addEventListener('pointercancel', cleanup);
}
