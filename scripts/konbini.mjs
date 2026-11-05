#!/usr/bin/env node
/**
 * Finds the konbini along each stage in OpenStreetMap and writes them to src/stages/konbini.json, so
 * the app has them offline and asks no server mid-ride. Run after scripts/komoot.mjs, whenever the
 * routes change:
 *
 *   node scripts/konbini.mjs
 *
 * OSM tags Japan's konbini unevenly, which Stage 3 showed: a FamilyMart 18 m off the route was mapped
 * with only its name ("ファミリーマートゆうきともち店"), no shop tag, so asking for shop=convenience
 * alone missed it. So the chains are also looked for by name and brand whatever else is tagged, and
 * convenience stores with no chain at all are kept too: there's a konbini there, just not a known one.
 */
import { writeFileSync } from "node:fs";
import { along, box, metres, overpass, pause, stages } from "./osm.mjs";

/** A stop, not a detour: within this distance of the route. */
const NEAR_M = 300;

/** By Wikidata id, as OSM's brand tags carry them (FamilyMart has two in use). */
const BRAND_IDS = {
  Q259340: "7-Eleven",
  Q11247682: "FamilyMart",
  Q1191685: "FamilyMart",
  Q1557223: "Lawson",
};
const NAMES = "セブン-?イレブン|7-?eleven|seven-?eleven|ファミリーマート|ファミマ|familymart|family mart|ローソン|lawson";

/** The chain, from the brand tags or else the name (Japanese names start with the chain's); "other" if neither. */
function brandOf(tags) {
  if (BRAND_IDS[tags["brand:wikidata"]]) return BRAND_IDS[tags["brand:wikidata"]];
  const text = `${tags.brand ?? ""} ${tags["brand:en"] ?? ""} ${tags.name ?? ""} ${tags["name:en"] ?? ""}`;
  if (/セブン-?イレブン|7-?eleven|seven-?eleven/i.test(text)) return "7-Eleven";
  if (/ファミリーマート|ファミマ|familymart|family mart/i.test(text)) return "FamilyMart";
  if (/ローソン|lawson/i.test(text)) return "Lawson";
  // Only a plain convenience store counts as an unknown konbini; a named one is some other chain.
  if (tags.shop === "convenience" && !tags.name && !tags.brand) return "Konbini";
}

const result = {};
for (const stage of stages) {
  const area = box(stage);
  const query = `[out:json][timeout:180];
(
  nwr["shop"="convenience"](${area});
  nwr["name"~"${NAMES}",i](${area});
  nwr["brand"~"${NAMES}",i](${area});
);
out center tags;`;
  const { elements } = await overpass(query);
  const stores = elements
    .map((e) => ({ ...e, brand: brandOf(e.tags) }))
    .filter((e) => e.brand)
    .map((e) => {
      const lng = e.lon ?? e.center.lon;
      const lat = e.lat ?? e.center.lat;
      const { km, offM } = along(stage, lng, lat);
      // [lng, lat, km on the komoot track, brand, branch name]
      return { row: [+lng.toFixed(5), +lat.toFixed(5), +km.toFixed(2), e.brand, e.tags["name:en"] ?? e.tags.name ?? ""], offM };
    })
    .filter((s) => s.offM <= NEAR_M)
    .map((s) => s.row)
    .sort((a, b) => a[2] - b[2])
    // The same store mapped twice (a node and its building) is one store; two branches across a street are two.
    .filter((s, i, all) => !all.slice(0, i).some((o) => o[3] === s[3] && metres(o, s) < 40));
  result[stage.id] = stores;
  const count = (brand) => stores.filter((s) => s[3] === brand).length;
  console.log(`${stage.name}: ${stores.length} (${["7-Eleven", "FamilyMart", "Lawson", "Konbini"].map((b) => `${b} ${count(b)}`).join(", ")})`);
  await pause();
}

const out = new URL("../src/stages/konbini.json", import.meta.url);
writeFileSync(out, JSON.stringify({ source: "© OpenStreetMap contributors (ODbL), via Overpass", nearM: NEAR_M, stages: result }) + "\n");
console.log("wrote src/stages/konbini.json");
