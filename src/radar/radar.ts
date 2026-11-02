import { createStore } from "../store";
import { framesFor, inCoverage, latestRun, levelsAt, PAST_FRAMES, type Frame } from "./jma";

export interface Place {
  lng: number;
  lat: number;
  /** Where the place came from: the device's location, a tap on the map, or our starting point. */
  source: "gps" | "pin" | "default";
}

interface RadarState {
  status: "loading" | "ready" | "offline";
  frames: Frame[];
  /** The frame on the map. */
  index: number;
  playing: boolean;
  place: Place;
  /** Intensity class at `place` for each frame; undefined while being read. */
  levels: number[] | undefined;
  locating: boolean;
}

const TOKYO_STATION: Place = { lng: 139.7671, lat: 35.6812, source: "default" };
const PLACE_KEY = "ameblitz.place";

function savedPlace(): Place {
  try {
    const place = JSON.parse(localStorage.getItem(PLACE_KEY) ?? "null") as Place | null;
    if (place && Number.isFinite(place.lng) && Number.isFinite(place.lat)) return place;
  } catch {}
  return TOKYO_STATION;
}

export const radar = createStore<RadarState>({
  status: "loading",
  frames: [],
  index: PAST_FRAMES,
  playing: false,
  place: savedPlace(),
  levels: undefined,
  locating: false,
});

/** Index of the run's own frame: the boundary between what was measured and what is forecast. */
export const NOW_INDEX = PAST_FRAMES;

let readId = 0;
async function readLevels() {
  const { frames, place } = radar.get();
  const id = ++readId;
  if (!frames.length || !inCoverage(place.lng, place.lat)) return radar.set({ levels: undefined });
  radar.set({ levels: undefined });
  const levels = await levelsAt(frames, place.lng, place.lat);
  if (id === readId) radar.set({ levels });
}

let currentBase: number | undefined;

/** Looks for a newer run and moves the timeline onto it, keeping the map on "now" if it was there. */
export async function refresh() {
  const base = await latestRun();
  if (base === undefined) {
    if (!radar.get().frames.length) radar.set({ status: "offline" });
    return;
  }
  if (base === currentBase) return;
  currentBase = base;
  const { index, status, playing } = radar.get();
  // Stay on the same moment if it is still on the timeline (it shifts left by one per new run).
  const keep = status === "ready" && !playing && index !== NOW_INDEX;
  radar.set({ status: "ready", frames: framesFor(base), index: keep ? Math.max(0, index - 1) : NOW_INDEX });
  readLevels();
}

export function setPlace(place: Place) {
  localStorage.setItem(PLACE_KEY, JSON.stringify(place));
  radar.set({ place });
  readLevels();
}

export function locate(onFound?: (place: Place) => void) {
  if (!("geolocation" in navigator)) return;
  radar.set({ locating: true });
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const place: Place = { lng: coords.longitude, lat: coords.latitude, source: "gps" };
      radar.set({ locating: false });
      setPlace(place);
      onFound?.(place);
    },
    () => radar.set({ locating: false }),
    { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 15_000 },
  );
}

export const seek = (index: number) => radar.set({ index, playing: false });

/* ---------- Playback ---------- */

const TICK_MS = 220;
/** Ticks to rest on the last frame before looping, so the end of the forecast registers. */
const HOLD_TICKS = 6;
let timer: number | undefined;
let held = 0;

export function togglePlay() {
  const { playing, index, frames } = radar.get();
  if (playing) {
    clearInterval(timer);
    return radar.set({ playing: false });
  }
  held = 0;
  radar.set({ playing: true, index: index >= frames.length - 1 ? 0 : index });
  clearInterval(timer);
  timer = window.setInterval(() => {
    const { index, frames, playing } = radar.get();
    if (!playing) return clearInterval(timer);
    if (index < frames.length - 1) return radar.set({ index: index + 1 });
    if (++held >= HOLD_TICKS) {
      held = 0;
      radar.set({ index: 0 });
    }
  }, TICK_MS);
}

/* ---------- Staying current ---------- */

refresh();
// A new run lands every 5 minutes, and the old forecast's detailed tiles go soon after, so look often.
setInterval(() => document.visibilityState === "visible" && refresh(), 30_000);
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refresh());
