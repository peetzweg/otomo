import { routeLength, type Stage } from "./stages";

export interface Progress {
  /** How far along the route the position is. */
  km: number;
  /** How far the position is from the route, in metres. */
  offM: number;
}

/** Within this distance of the closest bit of route, other bits count as just as likely. */
const AMBIGUOUS_M = 150;

/**
 * Where a position is along the route: the closest point on it. Where the route passes the same spot
 * twice (out and back, a loop), the pass nearest `hintKm`, the last known progress, wins; riders move
 * on, they don't jump.
 */
export function progressOn(stage: Stage, lng: number, lat: number, hintKm?: number): Progress {
  const { points } = stage;
  const mPerLat = 110_540;
  const mPerLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  const hits: Progress[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [lng1, lat1, km1] = points[i];
    const [lng2, lat2, km2] = points[i + 1];
    // In local metres around the position.
    const ax = (lng1 - lng) * mPerLng;
    const ay = (lat1 - lat) * mPerLat;
    const bx = (lng2 - lng) * mPerLng;
    const by = (lat2 - lat) * mPerLat;
    const dx = bx - ax;
    const dy = by - ay;
    const t = dx || dy ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
    hits.push({ km: km1 + (km2 - km1) * t, offM: Math.hypot(ax + dx * t, ay + dy * t) });
  }
  const closest = Math.min(...hits.map((h) => h.offM));
  const likely = hits.filter((h) => h.offM <= closest + AMBIGUOUS_M);
  const pick =
    hintKm === undefined
      ? likely.find((h) => h.offM === closest)!
      : likely.reduce((best, h) => (Math.abs(h.km - hintKm) < Math.abs(best.km - hintKm) ? h : best));
  return { km: Math.min(routeLength(stage), pick.km), offM: pick.offM };
}
