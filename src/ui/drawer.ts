import { useEffect, useRef, type PointerEvent, type RefObject } from "react";
import { setCollapsed, view } from "./view";

/** Room left under the headline when folded. */
const PEEK_PAD = 14;
/** A flick this fast (px/ms) decides the direction, however short the drag. */
const FLICK = 0.4;
/** Only the last stretch of a drag counts towards its speed: a slow drag ending in a flick is a flick. */
const VELOCITY_WINDOW_MS = 80;
/** Movement below this is a tap. */
const TAP_SLOP = 5;
/** The iOS sheet curve; matches --ease-sheet. */
const SETTLE = "transform 480ms cubic-bezier(0.32, 0.72, 0, 1)";

/** Past either end the sheet still follows, ever more reluctantly, instead of hitting a wall. */
const resist = (overshoot: number) => Math.sign(overshoot) * 6 * Math.sqrt(Math.abs(overshoot));

/**
 * A bottom sheet that follows the finger: drag its head down to fold it to the headline, up to open it,
 * flick either way, or tap to toggle. Folding moves the sheet with `transform` only (no layout), set
 * directly on the element so a drag doesn't re-render React.
 */
export function useDrawer(sheet: RefObject<HTMLElement | null>, head: RefObject<HTMLElement | null>) {
  /** How far the sheet moves down to fold: everything below the head. */
  const travel = useRef(0);
  const drag = useRef<{ id: number; startY: number; from: number; y: number; moved: boolean; samples: { y: number; t: number }[] }>(null);

  const place = (y: number, animate: boolean) => {
    const el = sheet.current!;
    el.style.transition = animate ? SETTLE : "none";
    el.style.transform = `translate3d(0, ${y}px, 0)`;
  };

  /** What the map sees of the sheet once it settles, so its controls and stage framing stay clear. */
  const report = (y: number) => {
    const el = sheet.current!;
    document.documentElement.style.setProperty("--sheet-height", `${Math.max(0, el.offsetHeight - Math.max(0, y))}px`);
  };

  const settle = (collapsed: boolean, animate = true) => {
    const y = collapsed ? travel.current : 0;
    place(y, animate);
    report(y);
  };

  // Keep the fold distance right as the content changes height (a longer summary, a stage's profile).
  useEffect(() => {
    const measure = () => {
      const el = sheet.current!;
      const h = head.current!;
      travel.current = Math.max(0, el.offsetHeight - (h.offsetTop + h.offsetHeight + PEEK_PAD));
      if (!drag.current) settle(view.get().collapsed, false);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(sheet.current!);
    measure();
    // Folding from elsewhere (moving the map) animates the same way.
    let last = view.get().collapsed;
    const unsubscribe = view.subscribe(() => {
      const { collapsed } = view.get();
      if (collapsed !== last) settle((last = collapsed));
    });
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, []);

  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      // One finger drives the sheet; a second one joining in is ignored.
      if (drag.current || e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const from = view.get().collapsed ? travel.current : 0;
      drag.current = { id: e.pointerId, startY: e.clientY, from, y: from, moved: false, samples: [{ y: e.clientY, t: e.timeStamp }] };
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.abs(dy) < TAP_SLOP) return;
      d.moved = true;
      const raw = d.from + dy;
      d.y = raw < 0 ? resist(raw) : raw > travel.current ? travel.current + resist(raw - travel.current) : raw;
      place(d.y, false);
      d.samples.push({ y: e.clientY, t: e.timeStamp });
      while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > VELOCITY_WINDOW_MS) d.samples.shift();
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      const wasCollapsed = view.get().collapsed;
      let next: boolean;
      if (!d.moved) {
        next = !wasCollapsed;
      } else {
        const first = d.samples[0];
        const velocity = (e.clientY - first.y) / Math.max(1, e.timeStamp - first.t);
        next = Math.abs(velocity) > FLICK ? velocity > 0 : d.y > travel.current / 2;
      }
      // Settle even when the state doesn't change: the sheet was let go somewhere in between.
      settle(next);
      setCollapsed(next);
    },
    onPointerCancel() {
      drag.current = null;
      settle(view.get().collapsed);
    },
  };
}
