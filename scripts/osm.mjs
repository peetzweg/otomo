/**
 * What scripts/konbini.mjs and scripts/tunnels.mjs share: the stages, asking Overpass (OpenStreetMap's
 * query API) patiently, and placing things along a route.
 */
import { readFileSync } from "node:fs";

export const { stages } = JSON.parse(readFileSync(new URL("../src/stages/stages.json", import.meta.url), "utf8"));

/** The main Overpass server and public mirrors; it's often at capacity, so each is tried in turn. */
const SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];

/** Asks each server in turn, backing off between rounds, until one answers in full. */
export async function overpass(query) {
  for (let round = 0; round < 5; round++) {
    for (const server of SERVERS) {
      try {
        const response = await fetch(server, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "otomo-build (https://github.com/peetzweg/otomo)" },
          body: new URLSearchParams({ data: query }),
        });
        if (!response.ok) throw new Error(`${response.status}`);
        const json = await response.json();
        // A remark means the query ran out of time or memory: the answer is incomplete.
        if (json.remark) throw new Error(json.remark);
        return json;
      } catch (error) {
        console.warn(`  ${new URL(server).host}: ${error.message.split("\n")[0]}`);
      }
    }
    await new Promise((r) => setTimeout(r, 5000 * 2 ** round));
  }
  throw new Error("No Overpass server answered");
}

/** Overpass asks for a pause between big queries. */
export const pause = () => new Promise((r) => setTimeout(r, 2000));

/**
 * The stage's bounding box, padded, as Overpass wants it (south, west, north, east). Overpass's
 * "around a line" quietly returns nothing for a line this long, so boxes are fetched whole and the
 * distance to the route measured here.
 */
export function box(stage, pad = 0.01) {
  const lngs = stage.points.map((p) => p[0]);
  const lats = stage.points.map((p) => p[1]);
  return [Math.min(...lats) - pad, Math.min(...lngs) - pad, Math.max(...lats) + pad, Math.max(...lngs) + pad].map((v) => v.toFixed(4)).join(",");
}

/** Metres between two points; plenty accurate at a ride's scale. */
export function metres([lng1, lat1], [lng2, lat2]) {
  const rad = Math.PI / 180;
  const x = (lng2 - lng1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.hypot(x, y) * 6_371_000;
}

/** Where a point falls along the route: the km of the closest spot on it, and how far off it is. */
export function along(stage, lng, lat) {
  const { points } = stage;
  const mPerLat = 110_540;
  const mPerLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  let best = { km: 0, offM: Infinity };
  for (let i = 0; i < points.length - 1; i++) {
    const [lng1, lat1, km1] = points[i];
    const [lng2, lat2, km2] = points[i + 1];
    const ax = (lng1 - lng) * mPerLng;
    const ay = (lat1 - lat) * mPerLat;
    const dx = (lng2 - lng1) * mPerLng;
    const dy = (lat2 - lat1) * mPerLat;
    const t = dx || dy ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
    const offM = Math.hypot(ax + dx * t, ay + dy * t);
    if (offM < best.offM) best = { km: km1 + (km2 - km1) * t, offM };
  }
  return best;
}
