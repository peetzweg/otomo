import { createStore } from "../store";

/** What's under the radar: the plain map, the map with terrain shading and contours, or aerial photos. */
export type Base = "map" | "topo" | "satellite";
export const BASES: { id: Base; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "topo", label: "Topo" },
  { id: "satellite", label: "Satellite" },
];

const BASE_KEY = "otomo.base";
const WELCOMED_KEY = "otomo.welcomed";
const FAREWELL_KEY = "otomo.farewell";
/** After the last stage's finish: from here on, the farewell sheet is due (once). */
const TOUR_OVER = Date.parse("2026-11-06T17:00:00+09:00");
// "terrain" (shading only) was folded into topo, which shades too.
const savedBase = (localStorage.getItem(BASE_KEY)?.replace("terrain", "topo") ?? null) as Base | null;

export const view = createStore({
  base: BASES.some((b) => b.id === savedBase) ? savedBase! : ("map" as Base),
  /** Where the sheet rests: folded to its headline, half (everyday), or full (more, scrolling). */
  snap: "half" as Snap,
  /** The climb whose page the sheet shows instead of the stage, by its number. */
  climb: undefined as number | undefined,
  /** The welcome sheet has been seen; it only ever shows once. */
  welcomed: localStorage.getItem(WELCOMED_KEY) === "1",
  /** The tour is over and its farewell not yet seen. `?farewell` in the address shows it regardless. */
  farewell: new URLSearchParams(location.search).has("farewell") || (Date.now() >= TOUR_OVER && localStorage.getItem(FAREWELL_KEY) !== "1"),
});

/** Back to the farewell, from the Ko-fi cup in the top bar. */
export const openFarewell = () => view.set({ farewell: true });

/** Seen. After the tour the welcome is moot too, so it never shows after the farewell. */
export function finishFarewell() {
  localStorage.setItem(FAREWELL_KEY, "1");
  localStorage.setItem(WELCOMED_KEY, "1");
  view.set({ farewell: false, welcomed: true });
}

/** Opens a climb's page (at half, so the map shows the climb), or closes it with `undefined`. */
export function openClimb(climb: number | undefined) {
  view.set({ climb });
  if (climb !== undefined && view.get().snap !== "half") setSnap("half");
}

export function finishWelcome() {
  localStorage.setItem(WELCOMED_KEY, "1");
  view.set({ welcomed: true });
}

export function setBase(base: Base) {
  localStorage.setItem(BASE_KEY, base);
  view.set({ base });
}

export type Snap = "folded" | "half" | "full";
export const setSnap = (snap: Snap) => view.get().snap !== snap && view.set({ snap });
