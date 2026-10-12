import { useEffect, useRef, useState, type PointerEvent, type MouseEvent } from 'react';

export type TileDrop = { kind: 'board'; row: number; col: number } | { kind: 'rack' };
type Drag = { id: string; x: number; y: number; target: TileDrop | null };
type Gesture = Drag & {
  pointer: number;
  startX: number;
  startY: number;
  moved: boolean;
  element: HTMLElement;
};

function targetAt(x: number, y: number): TileDrop | null {
  const element = document.elementFromPoint(x, y);
  const square = element?.closest<HTMLElement>('[data-board-row]');
  if (square)
    return {
      kind: 'board',
      row: Number(square.dataset.boardRow),
      col: Number(square.dataset.boardCol),
    };
  if (element?.closest('[data-tile-rack]')) return { kind: 'rack' };
  return null;
}

// Pointer capture keeps a tile attached to the same finger across board and rack.
export function useTileDrag(
  enabled: boolean,
  context: string,
  onDrop: (id: string, target: TileDrop) => void,
) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClickUntil = useRef(0);
  function cancel() {
    const active = gesture.current;
    if (active?.element.hasPointerCapture(active.pointer))
      active.element.releasePointerCapture(active.pointer);
    gesture.current = null;
    setDrag(null);
  }
  useEffect(() => {
    cancel();
    return cancel;
  }, [enabled, context]);
  function down(event: PointerEvent<HTMLElement>, id: string) {
    if (!enabled || !event.isPrimary || event.button !== 0 || gesture.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      id,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      pointer: event.pointerId,
      moved: false,
      element: event.currentTarget,
      target: null,
    };
  }
  function move(event: PointerEvent<HTMLElement>) {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    active.x = event.clientX;
    active.y = event.clientY;
    if (!active.moved && Math.hypot(active.x - active.startX, active.y - active.startY) < 6) return;
    event.preventDefault();
    active.moved = true;
    active.target = targetAt(active.x, active.y);
    setDrag({ id: active.id, x: active.x, y: active.y, target: active.target });
  }
  function up(event: PointerEvent<HTMLElement>) {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    if (active.moved) {
      event.preventDefault();
      suppressClickUntil.current = Date.now() + 400;
      setTimeout(() => {
        suppressClickUntil.current = 0;
      }, 0);
      const target = targetAt(event.clientX, event.clientY);
      if (enabled && target) onDrop(active.id, target);
    }
    cancel();
  }
  function clickCapture(event: MouseEvent<HTMLElement>) {
    if (Date.now() < suppressClickUntil.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  return { drag, down, move, up, cancel, clickCapture };
}
