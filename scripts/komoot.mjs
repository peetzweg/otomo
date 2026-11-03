#!/usr/bin/env node
/**
 * Pulls the tours of a public komoot collection into src/stages/stages.json, so the app has the routes
 * offline and doesn't depend on komoot at runtime.
 *
 *   node scripts/komoot.mjs 4767132
 *
 * komoot's GPX download needs a login; the coordinates endpoint behind the public tour page doesn't,
 * and carries the same track plus komoot's planned riding time for each point.
 */
import { writeFileSync } from "node:fs";

const API = "https://api.komoot.de/v007";
/** Spacing of the elevation profile, read from the full-resolution track. */
const PROFILE_KM = 0.5;
const collection = process.argv[2];
if (!collection) throw new Error("usage: node scripts/komoot.mjs <collection id>");

const json = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
};

/** Metres between two points; plenty accurate at a ride's scale. */
function metres([lng1, lat1], [lng2, lat2]) {
  const rad = Math.PI / 180;
  const x = (lng2 - lng1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.hypot(x, y) * 6_371_000;
}

/** Douglas-Peucker in local metres: drops points that move the line by less than `tolerance`. */
function simplify(points, tolerance) {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ab = metres(points[a], points[b]);
    let worst = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      // Distance from point i to the chord a-b, from the triangle's area (Heron).
      const ai = metres(points[a], points[i]);
      const ib = metres(points[i], points[b]);
      const s = (ab + ai + ib) / 2;
      const d = ab ? (2 * Math.sqrt(Math.max(0, s * (s - ab) * (s - ai) * (s - ib)))) / ab : ai;
      if (d > worst) [worst, at] = [d, i];
    }
    if (worst > tolerance) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Tunnels and bridges put spikes in the elevation: the terrain model has the hill above the tunnel, or
 * the valley under the bridge, so the track jumps 100 m and back within a few hundred metres. A jump
 * steeper than SPIKE_GRADE that returns to about where it left within SPIKE_SPAN samples is one; it
 * gets the straight line across instead.
 */
const SPIKE_GRADE = 0.15;
const SPIKE_SPAN = 3; // samples, i.e. 1.5 km
const SPIKE_RETURN_M = 25;

function despike(heights) {
  const out = [...heights];
  for (let i = 0; i < out.length - 2; i++) {
    for (let j = Math.min(out.length - 1, i + SPIKE_SPAN); j > i + 1; j--) {
      if (Math.abs(out[j] - out[i]) > SPIKE_RETURN_M) continue;
      const between = out.slice(i + 1, j).map((h, k) => h - (out[i] + ((out[j] - out[i]) * (k + 1)) / (j - i)));
      const worst = Math.max(...between.map(Math.abs));
      if (worst / (PROFILE_KM * 1000) <= SPIKE_GRADE) continue;
      for (let k = i + 1; k < j; k++) out[k] = Math.round(out[i] + ((out[j] - out[i]) * (k - i)) / (j - i));
      break;
    }
  }
  return out;
}

/** Elevation in metres every PROFILE_KM, from start to finish, without tunnel and bridge spikes. */
function profile(points, items) {
  const out = [];
  let at = 0;
  for (let km = 0; km <= points[points.length - 1][2]; km += PROFILE_KM) {
    while (at < points.length - 2 && points[at + 1][2] < km) at++;
    const t = points[at + 1][2] > points[at][2] ? (km - points[at][2]) / (points[at + 1][2] - points[at][2]) : 0;
    out.push(Math.round(items[at].alt + (items[at + 1].alt - items[at].alt) * Math.min(1, Math.max(0, t))));
  }
  return despike(out);
}

const { _embedded } = await json(`${API}/collections/${collection}/compilation/?limit=100`);
// Only the numbered stages; the collection also holds side rides like the welcome ride.
const tours = _embedded.items.filter((item) => item.type?.startsWith("tour") && /Stage\s*\d+/i.test(item.name));

const stages = [];
for (const tour of tours) {
  const { items } = await json(`${API}/tours/${tour.id}/coordinates`);
  // [lng, lat, km from start, planned minutes from start]
  let km = 0;
  const points = items.map((p, i) => {
    if (i) km += metres([items[i - 1].lng, items[i - 1].lat], [p.lng, p.lat]) / 1000;
    return [+p.lng.toFixed(5), +p.lat.toFixed(5), +km.toFixed(2), Math.round(p.t / 60_000)];
  });
  const number = Number(tour.name.match(/Stage\s*(\d+)/i)[1]);
  stages.push({
    id: String(tour.id),
    number,
    // "TdF Japan 2026 - Stage 1: Fukuoka to Beppu" → "Stage 1", "Fukuoka → Beppu"
    name: `Stage ${number}`,
    title: tour.name.replace(/^.*Stage\s*\d+\s*[:-]\s*/i, "").replace(/\s+to\s+/i, " → "),
    distanceKm: Math.round(tour.distance / 100) / 10,
    climbM: Math.round(tour.elevation_up),
    url: `https://www.komoot.com/tour/${tour.id}`,
    points: simplify(points, 20),
    profile: profile(points, items),
  });
  console.log(`${tour.name}: ${items.length} → ${stages.at(-1).points.length} points`);
}

stages.sort((a, b) => a.number - b.number);
const out = new URL("../src/stages/stages.json", import.meta.url);
writeFileSync(out, JSON.stringify({ collection, profileKm: PROFILE_KM, source: `https://www.komoot.com/collection/${collection}`, stages }) + "\n");
console.log(`wrote ${stages.length} stages`);
