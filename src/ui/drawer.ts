import { useEffect, useLayoutEffect, useRef, type PointerEvent, type RefObject } from "react";
import { setSnap, view, type Snap } from "./view";

/** Room left under the headline when folded, and under the timeline at half. */
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

interface Parts {
  sheet: RefObject<HTMLElement | null>;
  /** The handle; folded, only it shows. */
  head: RefObject<HTMLElement | null>;
  /** The scrolling content, scrolled back to the top whenever the sheet leaves full. */
  body: RefObject<HTMLElement | null>;
  /** Marks where "half" ends: everything above it shows at half, the rest only at full. */
  halfEnd: RefObject<HTMLElement | null>;
}

/**
 * A bottom sheet with three resting places: folded to the headline, half (the everyday view), and
 * full (the screen, scrolling). It follows the finger, a flick moves it one place in its direction,
 * a tap toggles between folded and half. The sheet is always full height and moves only by
 * `transform`, set directly on the element so a drag never re-renders React.
 */
export function useDrawer({ sheet, head, body, halfEnd }: Parts, hasMore: boolean) {
  /** The sheet's offset at each resting place: 0 is full. */
  const stops = useRef<Record<Snap, number>>({ full: 0, half: 0, folded: 0 });
  const more = useRef(hasMore);
  more.current = hasMore;
  const drag = useRef<{ id: number; startY: number; from: number; y: number; moved: boolean; samples: { y: number; t: number }[] }>(null);

  const available = (): Snap[] => (more.current ? ["full", "half", "folded"] : ["half", "folded"]);
  const top = () => stops.current[available()[0]];
  const bottom = () => stops.current.folded;

  const place = (y: number, animate: boolean) => {
    const el = sheet.current!;
    el.style.transition = animate ? SETTLE : "none";
    el.style.transform = `translate3d(0, ${y}px, 0)`;
  };

  /** What the map sees of the sheet once it settles, so its controls and stage framing stay clear. */
  const report = (y: number) => {
    document.documentElement.style.setProperty("--sheet-height", `${Math.max(0, sheet.current!.offsetHeight - Math.max(0, y))}px`);
  };

  const settle = (snap: Snap, animate = true) => {
    const y = stops.current[snap];
    place(y, animate);
    report(y);
    sheet.current!.dataset.snap = snap;
    // For the map's controls, which sit above the sheet and would end up under the top bar at full.
    document.documentElement.dataset.sheet = snap;
    if (snap !== "full") body.current?.scrollTo({ top: 0, behavior: animate ? "smooth" : "auto" });
  };

  // Keep the resting places right as the content changes (a longer summary, a stage's profile). A
  // layout effect, so the sheet is in place before the map frames the stage around it.
  useLayoutEffect(() => {
    const measure = () => {
      const el = sheet.current!;
      const height = el.offsetHeight;
      const h = head.current!;
      const sheetTop = el.getBoundingClientRect().top;
      const halfVisible = halfEnd.current!.getBoundingClientRect().top - sheetTop + body.current!.scrollTop + PEEK_PAD;
      const folded = Math.max(0, height - (h.offsetTop + h.offsetHeight + PEEK_PAD));
      stops.current = { full: 0, half: Math.min(folded, Math.max(0, height - halfVisible)), folded };
      if (!drag.current) {
        const { snap } = view.get();
        settle(snap === "full" && !more.current ? "half" : snap, false);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(sheet.current!);
    observer.observe(body.current!.firstElementChild!);
    measure();
    // Snapping from elsewhere (moving the map, a button) animates the same way.
    let last = view.get().snap;
    const unsubscribe = view.subscribe(() => {
      const { snap } = view.get();
      if (snap !== last) settle((last = snap));
    });
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, []);

  // Losing the extra content (back to a single spot) while full drops to half.
  useEffect(() => {
    if (!hasMore && view.get().snap === "full") setSnap("half");
  }, [hasMore]);

  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      // One finger drives the sheet; a second one joining in is ignored.
      if (drag.current || e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const from = stops.current[view.get().snap];
      drag.current = { id: e.pointerId, startY: e.clientY, from, y: from, moved: false, samples: [{ y: e.clientY, t: e.timeStamp }] };
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.abs(dy) < TAP_SLOP) return;
      d.moved = true;
      const raw = d.from + dy;
      d.y = raw < top() ? top() + resist(raw - top()) : raw > bottom() ? bottom() + resist(raw - bottom()) : raw;
      place(d.y, false);
      d.samples.push({ y: e.clientY, t: e.timeStamp });
      while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > VELOCITY_WINDOW_MS) d.samples.shift();
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      const current = view.get().snap;
      const places = available();
      let next: Snap;
      if (!d.moved) {
        next = current === "folded" ? "half" : current === "half" ? "folded" : "half";
      } else {
        const first = d.samples[0];
        const velocity = (e.clientY - first.y) / Math.max(1, e.timeStamp - first.t);
        if (Math.abs(velocity) > FLICK) {
          // One place along in the flick's direction, from wherever the finger let go.
          const ahead = places.filter((p) => (velocity < 0 ? stops.current[p] < d.y : stops.current[p] > d.y));
          next = velocity < 0 ? (ahead.at(-1) ?? places[0]) : (ahead[0] ?? places.at(-1)!);
        } else {
          next = places.reduce((best, p) => (Math.abs(stops.current[p] - d.y) < Math.abs(stops.current[best] - d.y) ? p : best));
        }
      }
      // Settle even when the place doesn't change: the sheet was let go somewhere in between.
      settle(next);
      setSnap(next);
    },
    onPointerCancel() {
      drag.current = null;
      settle(view.get().snap);
    },
  };
}
