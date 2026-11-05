/**
 * The road tunnels each stage rides through, from OpenStreetMap (fetched at build time by
 * scripts/tunnels.mjs, so they're there offline).
 */
import data from "./tunnels.json";
import { routeLength, type Stage } from "./stages";

export interface Tunnel {
  /** On the komoot track. */
  fromKm: number;
  toKm: number;
  /** In the portal's kilometres. */
  from: number;
  lengthM: number;
  /** "俵山トンネル", or empty when OSM has no name for it. */
  name: string;
}

type Row = [number, number, string];

export function tunnels(stage: Stage): Tunnel[] {
  const rows = (data.stages as unknown as Record<string, Row[]>)[stage.id] ?? [];
  const scale = stage.distanceKm / routeLength(stage);
  return rows.map(([fromKm, toKm, name]) => ({ fromKm, toKm, from: fromKm * scale, lengthM: Math.round((toKm - fromKm) * 1000), name }));
}

/** "850 m", "1.2 km" */
export const tunnelLength = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

/** The next tunnel starting ahead of a point on the route. */
export const nextTunnel = (stage: Stage, routeKm: number) => tunnels(stage).find((t) => t.fromKm > routeKm);
