import { createStore } from "../store";

/** What's under the radar: the plain map, the map with terrain shading, GSI's topographic map, or aerial photos. */
export type Base = "map" | "terrain" | "topo" | "satellite";
export const BASES: { id: Base; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "terrain", label: "Terrain" },
  { id: "topo", label: "Topo" },
  { id: "satellite", label: "Satellite" },
];

const BASE_KEY = "otomo.base";
const WELCOMED_KEY = "otomo.welcomed";
const savedBase = localStorage.getItem(BASE_KEY) as Base | null;

export const view = createStore({
  base: BASES.some((b) => b.id === savedBase) ? savedBase! : ("map" as Base),
  /** The sheet folded down to its headline, to give the map the screen. */
  collapsed: false,
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

export const setCollapsed = (collapsed: boolean) => view.get().collapsed !== collapsed && view.set({ collapsed });
