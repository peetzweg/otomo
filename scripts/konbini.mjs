#!/usr/bin/env node
/**
 * Finds the 7-Eleven, FamilyMart and Lawson stores along each stage in OpenStreetMap (through the
 * Overpass API) and writes them to src/stages/konbini.json, so the app has them offline and asks no
 * server mid-ride. Run after scripts/komoot.mjs, whenever the routes change:
 *
 *   node scripts/konbini.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

/** The main Overpass server and public mirrors; it's often at capacity, so each is tried in turn. */
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
/** A stop, not a detour: within this distance of the route. */
const NEAR_M = 300;

/** By Wikidata id, which OSM's brand tags carry for all three chains. */
const BRANDS = {
  Q259340: "7-Eleven",
  Q11247682: "FamilyMart",
  Q1557223: "Lawson",
};

/** The brand tag where it's set; otherwise the name, which in Japan starts with the chain's. */
function brandOf(tags) {
  if (BRANDS[tags["brand:wikidata"]]) return BRANDS[tags["brand:wikidata"]];
  const text = `${tags.brand ?? ""} ${tags["brand:en"] ?? ""} ${tags.name ?? ""} ${tags["name:en"] ?? ""}`;
  if (/セブン-?イレブン|7-?eleven|seven-?eleven/i.test(text)) return "7-Eleven";
  if (/ファミリーマート|familymart|family mart/i.test(text)) return "FamilyMart";
  if (/ローソン|lawson/i.test(text)) return "Lawson";
}

const stagesFile = new URL("../src/stages/stages.json", import.meta.url);
const { stages } = JSON.parse(readFileSync(stagesFile, "utf8"));

/** Metres between two points; plenty accurate at a ride's scale. */
function metres([lng1, lat1], [lng2, lat2]) {
  const rad = Math.PI / 180;
  const x = (lng2 - lng1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.hypot(x, y) * 6_371_000;
}

/** Where a point falls along the route: the km of the closest spot on it, and how far off it is. */
function along(points, lng, lat) {
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

/**
 * The stage's bounding box, padded a little, as Overpass wants it (south, west, north, east). Overpass's
 * "around a line" quietly returns nothing for a line this long, so the box is fetched whole and the
 * distance to the route measured here.
 */
function box(points) {
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const pad = 0.01;
  return [Math.min(...lats) - pad, Math.min(...lngs) - pad, Math.max(...lats) + pad, Math.max(...lngs) + pad].map((v) => v.toFixed(4)).join(",");
}

/** Asks each server in turn, backing off between rounds, until one answers in full. */
async function overpass(query) {
  for (let round = 0; round < 5; round++) {
    for (const server of OVERPASS) {
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

const result = {};
for (const stage of stages) {
  const query = `[out:json][timeout:120];
nwr["shop"="convenience"](${box(stage.points)});
out center tags;`;
  const { elements } = await overpass(query);
  const stores = elements
    .map((e) => ({ ...e, brand: brandOf(e.tags) }))
    .filter((e) => e.brand)
    .map((e) => {
      const lng = e.lon ?? e.center.lon;
      const lat = e.lat ?? e.center.lat;
      const { km, offM } = along(stage.points, lng, lat);
      // [lng, lat, km on the komoot track, brand, branch name]
      return [+lng.toFixed(5), +lat.toFixed(5), +km.toFixed(2), e.brand, e.tags["name:en"] ?? e.tags.name ?? "", Math.round(offM)];
    })
    .filter((s) => s[5] <= NEAR_M)
    .map((s) => s.slice(0, 5))
    .sort((a, b) => a[2] - b[2]);
  result[stage.id] = stores;
  const count = (brand) => stores.filter((s) => s[3] === brand).length;
  console.log(`${stage.name}: ${stores.length} (${Object.values(BRANDS).map((b) => `${b} ${count(b)}`).join(", ")})`);
  // Overpass asks for a pause between big queries.
  await new Promise((r) => setTimeout(r, 2000));
}

const out = new URL("../src/stages/konbini.json", import.meta.url);
writeFileSync(out, JSON.stringify({ source: "© OpenStreetMap contributors (ODbL), via Overpass", nearM: NEAR_M, stages: result }) + "\n");
console.log("wrote src/stages/konbini.json");
