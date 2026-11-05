#!/usr/bin/env node
/**
 * Finds the road tunnels each stage rides through, from OpenStreetMap, and writes them to
 * src/stages/tunnels.json: where each starts and ends on the route, how long it is, and its name
 * ("俵山トンネル"). Run after scripts/komoot.mjs, whenever the routes change:
 *
 *   node scripts/tunnels.mjs
 *
 * A tunnel counts when most of it lies on the route: one that merely crosses under or over it touches
 * the route at a single point and doesn't. Expressway tunnels never count: bikes aren't allowed on
 * expressways, so one alongside the route is a neighbour, not the road being ridden.
 */
import { writeFileSync } from "node:fs";
import { along, box, metres, overpass, pause, stages } from "./osm.mjs";

/** How close to the route a tunnel's line must run: GPS tracks and the map's road differ by metres. */
const ON_ROUTE_M = 35;
/** The share of a tunnel's length that has to be on the route. */
const ON_ROUTE_SHARE = 0.7;
/** Shorter than this, it's an underpass, not a tunnel worth a mark. */
const MIN_LENGTH_M = 40;
/** Two pieces of tunnel (OSM splits them at bridges, name changes) closer than this along the route are one. */
const JOIN_M = 60;

/** Points every ~10 m along a line, so a long straight tunnel is judged along its length, not its ends. */
function densify(line) {
  const out = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const steps = Math.max(1, Math.ceil(metres(line[i - 1], line[i]) / 10));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      out.push([line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t]);
    }
  }
  return out;
}

/**
 * The tunnel's own name: OSM keeps it in tunnel:name, while name on a tunnel's way is usually the
 * road's ("National Highway Route 445"). That one only counts when it names a tunnel.
 */
function tunnelName(tags) {
  const own = tags["tunnel:name"] ?? tags["tunnel:name:ja"] ?? tags["tunnel:name:en"];
  if (own) return own;
  const name = tags.name ?? "";
  return /トンネル|隧道|tunnel/i.test(name) ? name : "";
}

const result = {};
for (const stage of stages) {
  const query = `[out:json][timeout:180];
way["highway"]["highway"!~"^motorway"]["tunnel"]["tunnel"!="no"]["tunnel"!="culvert"](${box(stage)});
out geom tags;`;
  const { elements } = await overpass(query);
  const pieces = [];
  for (const way of elements) {
    const line = way.geometry.map((g) => [g.lon, g.lat]);
    const length = line.slice(1).reduce((sum, p, i) => sum + metres(line[i], p), 0);
    if (length < MIN_LENGTH_M / 2) continue;
    // Cheap first: is either end anywhere near the route?
    const ends = [along(stage, ...line[0]), along(stage, ...line.at(-1))];
    if (Math.min(ends[0].offM, ends[1].offM) > 300) continue;
    const samples = densify(line).map(([lng, lat]) => along(stage, lng, lat));
    const on = samples.filter((s) => s.offM <= ON_ROUTE_M);
    if (on.length / samples.length < ON_ROUTE_SHARE) continue;
    const kms = on.map((s) => s.km);
    pieces.push({ from: Math.min(...kms), to: Math.max(...kms), name: tunnelName(way.tags) });
  }
  pieces.sort((a, b) => a.from - b.from);
  const tunnels = [];
  for (const piece of pieces) {
    const last = tunnels.at(-1);
    if (last && piece.from - last.to <= JOIN_M / 1000) {
      last.to = Math.max(last.to, piece.to);
      last.name ||= piece.name;
      continue;
    }
    tunnels.push({ ...piece });
  }
  // [km where it starts, km where it ends (komoot track), name]
  result[stage.id] = tunnels.filter((t) => (t.to - t.from) * 1000 >= MIN_LENGTH_M).map((t) => [+t.from.toFixed(3), +t.to.toFixed(3), t.name]);
  const total = result[stage.id].reduce((sum, [a, b]) => sum + (b - a), 0);
  console.log(`${stage.name}: ${result[stage.id].length} tunnels, ${total.toFixed(1)} km`);
  for (const [a, b, name] of result[stage.id]) console.log(`    km ${a.toFixed(1)}  ${Math.round((b - a) * 1000)} m  ${name}`);
  await pause();
}

const out = new URL("../src/stages/tunnels.json", import.meta.url);
writeFileSync(out, JSON.stringify({ source: "© OpenStreetMap contributors (ODbL), via Overpass", stages: result }) + "\n");
console.log("wrote src/stages/tunnels.json");
