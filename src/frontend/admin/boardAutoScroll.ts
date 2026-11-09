import { useCallback, useEffect, useRef, type DragEvent } from "react";

/** While a card is dragged near the left or right edge of a board, scroll the board sideways. */
export function useBoardAutoScroll() {
  const ref = useRef<HTMLDivElement | null>(null);
  const pointerX = useRef<number | null>(null);
  const dragging = useRef(false);
  const frame = useRef<number | null>(null);
  const tick = useRef<() => void>(() => {});

  tick.current = () => {
    const board = ref.current;
    const x = pointerX.current;
    if (!board || !dragging.current || x === null) { frame.current = null; return; }
    const bounds = board.getBoundingClientRect();
    const edge = 72;
    let delta = 0;
    if (x - bounds.left < edge && board.scrollLeft > 0) delta = -Math.ceil(4 + ((edge - (x - bounds.left)) / edge) * 16);
    else if (bounds.right - x < edge && board.scrollLeft + board.clientWidth < board.scrollWidth - 1) delta = Math.ceil(4 + ((edge - (bounds.right - x)) / edge) * 16);
    if (delta) { board.scrollLeft += delta; frame.current = requestAnimationFrame(() => tick.current()); }
    else frame.current = null;
  };

  const stop = useCallback(() => {
    dragging.current = false;
    pointerX.current = null;
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
  }, []);
  const start = useCallback(() => { dragging.current = true; }, []);
  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    event.preventDefault();
    pointerX.current = event.clientX;
    if (frame.current === null) frame.current = requestAnimationFrame(() => tick.current());
  }, []);
  useEffect(() => stop, [stop]);

  return { ref, start, stop, onDragOver };
}
