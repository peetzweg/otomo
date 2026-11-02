import { progressOn, type Progress } from "../stages/progress";
import { currentStage, samples, stageById } from "../stages/stages";
import { createStore } from "../store";
import { framesFor, inCoverage, latestRun, levelsAlong, levelsAt, PAST_FRAMES, type Frame } from "./jma";

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
  /** The ride shown instead of a single spot, by komoot tour id. */
  stage: string | undefined;
  /** Intensity class along the stage, `route[frame][km]`; undefined while being read. */
  route: number[][] | undefined;
  /** The device's position while following it (see `track`). */
  position: { lng: number; lat: number } | undefined;
  tracking: boolean;
  /** Where the position falls on the selected stage. */
  progress: Progress | undefined;
  /** The km being pointed at on the elevation profile, shown on the map too. */
  cursorKm: number | undefined;
  /** Bumped by the locate button: the map centres on the position (or on the next fix, if none yet). */
  focus: number;
}

const TOKYO_STATION: Place = { lng: 139.7671, lat: 35.6812, source: "default" };
const PLACE_KEY = "otomo.place";
const STAGE_KEY = "otomo.stage";

function savedPlace(): Place {
  try {
    const place = JSON.parse(localStorage.getItem(PLACE_KEY) ?? "null") as Place | null;
    if (place && Number.isFinite(place.lng) && Number.isFinite(place.lat)) return place;
  } catch {}
  return TOKYO_STATION;
}

/**
 * The stage to open on. On a race day, or before the next one, that's the stage being ridden; the
 * choice you made only sticks for the rest of that day.
 */
function savedStage() {
  const stage = currentStage();
  try {
    const saved = JSON.parse(localStorage.getItem(STAGE_KEY) ?? "null") as { stage: string | null; day: string } | null;
    if (saved?.day === stage.date) return saved.stage === null ? undefined : (stageById(saved.stage)?.id ?? stage.id);
  } catch {}
  return stage.id;
}

export const radar = createStore<RadarState>({
  status: "loading",
  frames: [],
  index: PAST_FRAMES,
  playing: false,
  place: savedPlace(),
  levels: undefined,
  locating: false,
  stage: savedStage(),
  route: undefined,
  position: undefined,
  tracking: false,
  progress: undefined,
  cursorKm: undefined,
  focus: 0,
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

let routeId = 0;
async function readRoute() {
  const { frames, stage } = radar.get();
  const id = ++routeId;
  const ride = stageById(stage);
  radar.set({ route: undefined });
  if (!frames.length || !ride) return;
  const route = await levelsAlong(
    frames,
    samples(ride).map(([lng, lat]) => [lng, lat]),
    8,
  );
  if (id === routeId) radar.set({ route });
}

/** Show a stage, or `undefined` to go back to a single spot. */
export function selectStage(stage: string | undefined) {
  localStorage.setItem(STAGE_KEY, JSON.stringify({ stage: stage ?? null, day: currentStage().date }));
  radar.set({ stage, cursorKm: undefined });
  updateProgress(true);
  readRoute();
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
  readRoute();
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

/* ---------- Riding a stage ---------- */

function updateProgress(stageChanged = false) {
  const { position, stage, progress } = radar.get();
  const ride = stageById(stage);
  if (!position || !ride) return radar.set({ progress: undefined });
  radar.set({ progress: progressOn(ride, position.lng, position.lat, stageChanged ? undefined : progress?.km) });
}

let watchId: number | undefined;

/** Follows the device's position, for progress along the stage. Asks for permission the first time. */
export function track() {
  if (watchId !== undefined || !("geolocation" in navigator)) return;
  radar.set({ tracking: true });
  watchId = navigator.geolocation.watchPosition(
    ({ coords }) => {
      radar.set({ position: { lng: coords.longitude, lat: coords.latitude } });
      updateProgress();
    },
    () => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      watchId = undefined;
      radar.set({ tracking: false });
    },
    { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
  );
}

// Once location has been allowed, follow it from the start; never prompt without a tap.
navigator.permissions
  ?.query({ name: "geolocation" })
  .then((status) => status.state === "granted" && track())
  .catch(() => {});

export const setCursor = (cursorKm: number | undefined) => radar.set({ cursorKm });

/** Follow the position and bring the map to it. */
export function followMe() {
  track();
  radar.set({ focus: radar.get().focus + 1 });
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
