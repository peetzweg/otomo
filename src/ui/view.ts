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
// "terrain" (shading only) was folded into topo, which shades too.
const savedBase = (localStorage.getItem(BASE_KEY)?.replace("terrain", "topo") ?? null) as Base | null;

export const view = createStore({
  base: BASES.some((b) => b.id === savedBase) ? savedBase! : ("map" as Base),
  /** Where the sheet rests: folded to its headline, half (everyday), or full (more, scrolling). */
  snap: "half" as Snap,
  /** The welcome sheet has been seen; it only ever shows once. */
  welcomed: localStorage.getItem(WELCOMED_KEY) === "1",
});

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
