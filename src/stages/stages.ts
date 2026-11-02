import type { GeoJSONSourceSpecification } from "maplibre-gl";
import { SCHEDULE, type Schedule } from "./schedule";
import data from "./stages.json";

/** A stage: the route from komoot (see scripts/komoot.mjs) and the day's plan from the riders portal. */
export interface Stage extends Schedule {
  id: string;
  number: number;
  name: string;
  title: string;
  url: string;
  /** [lng, lat, km from start, komoot's planned minutes from start] */
  points: [number, number, number, number][];
  /** Elevation in metres every PROFILE_KM along the route. */
  profile: number[];
}

export interface Checkpoint {
  code: string;
  name: string;
  /** As the portal counts it. */
  km: number;
  /** Where that falls on the komoot track. */
  routeKm: number;
  lng: number;
  lat: number;
}

type KomootStage = Omit<Stage, keyof Schedule>;

// The portal's numbers win over komoot's: they are what the organisers announce.
export const STAGES: Stage[] = (data.stages as unknown as KomootStage[]).map((stage) => ({ ...stage, ...SCHEDULE[stage.number] }));
export const stageById = (id: string | undefined) => STAGES.find((s) => s.id === id);

/** Spacing of `Stage.profile`. */
export const PROFILE_KM: number = data.profileKm;

export const routeLength = (stage: Stage) => stage.points[stage.points.length - 1][2];

/** Height in metres `km` along the route. */
export const elevationAt = (stage: Stage, km: number) =>
  stage.profile[Math.min(stage.profile.length - 1, Math.max(0, Math.round(km / PROFILE_KM)))];

/** Metres of climbing between two points on the route. */
export function climbBetween(stage: Stage, fromKm: number, toKm: number) {
  const { profile } = stage;
  let climb = 0;
  for (let i = Math.max(1, Math.ceil(fromKm / PROFILE_KM)); i <= Math.min(profile.length - 1, toKm / PROFILE_KM); i++) {
    climb += Math.max(0, profile[i] - profile[i - 1]);
  }
  return climb;
}

/** The point `km` along the komoot track. */
export function pointAt(stage: Stage, km: number): [number, number] {
  const { points } = stage;
  const i = Math.max(1, points.findIndex((p) => p[2] >= km));
  const [lng1, lat1, km1] = points[i - 1];
  const [lng2, lat2, km2] = points[Math.min(i, points.length - 1)];
  const t = km2 > km1 ? Math.min(1, Math.max(0, (km - km1) / (km2 - km1))) : 0;
  return [lng1 + (lng2 - lng1) * t, lat1 + (lat2 - lat1) * t];
}

export function checkpoints(stage: Stage): Checkpoint[] {
  const scale = routeLength(stage) / stage.distanceKm;
  return stage.checkpoints.map((cp) => {
    const routeKm = cp.km * scale;
    const [lng, lat] = pointAt(stage, routeKm);
    return { ...cp, routeKm, lng, lat };
  });
}

const japanDay = (time: number) => new Date(time).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

/** Today's stage in Japan, or the next one; the last once the tour is over. */
export function currentStage(now = Date.now()): Stage {
  const today = japanDay(now);
  return STAGES.find((s) => s.date >= today) ?? STAGES[STAGES.length - 1];
}

/** "Tue 3 Nov" */
export const dayLabel = (stage: Stage) =>
  new Date(`${stage.date}T12:00:00+09:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Tokyo" });

/** How far apart the route is read on the radar. Rain cells are kilometres across, so this misses none. */
export const SAMPLE_KM = 1;

/** Points every SAMPLE_KM along the route, from start to finish: [lng, lat, km]. */
export function samples(stage: Stage): [number, number, number][] {
  const out: [number, number, number][] = [];
  const { points } = stage;
  let at = 0;
  for (let km = 0; km <= points[points.length - 1][2]; km += SAMPLE_KM) {
    while (at < points.length - 2 && points[at + 1][2] < km) at++;
    const [lng1, lat1, km1] = points[at];
    const [lng2, lat2, km2] = points[at + 1];
    const t = km2 > km1 ? (km - km1) / (km2 - km1) : 0;
    out.push([lng1 + (lng2 - lng1) * t, lat1 + (lat2 - lat1) * t, km]);
  }
  return out;
}

export function bounds(stage: Stage): [[number, number], [number, number]] {
  const lngs = stage.points.map((p) => p[0]);
  const lats = stage.points.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

export function geojson(stage: Stage): GeoJSONSourceSpecification["data"] {
  const first = stage.points[0];
  const last = stage.points[stage.points.length - 1];
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: stage.points.map(([lng, lat]) => [lng, lat]) } },
      { type: "Feature", properties: { end: "start" }, geometry: { type: "Point", coordinates: [first[0], first[1]] } },
      { type: "Feature", properties: { end: "finish" }, geometry: { type: "Point", coordinates: [last[0], last[1]] } },
    ],
  };
}
