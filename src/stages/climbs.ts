/**
 * The real climbs of a stage, found in its elevation profile (PROFILE_KM samples, tunnels and bridges
 * already smoothed out by scripts/komoot.mjs):
 *
 * 1. Peaks and valleys, ignoring wiggles under DIP_M (a zig-zag with hysteresis).
 * 2. Each valley-to-peak rise is trimmed to where the climbing starts: walking down from the top, it
 *    stops at the first 2 km that average under FLAT_GRADE. A valley can lie 30 km of false flat before
 *    the climb, and that isn't part of it. Below such a flat, what's left can hold a climb of its own.
 * 3. Climbs with only a breather between them (under BREATHER_KM, losing under DIP_M) become one.
 * 4. What gains at least MIN_GAIN_M is a climb.
 *
 * Difficulty is the FIETS index (as Dutch Fietsmagazine rates climbs): gain² / (length × 10), plus a
 * bonus for tops above 1,000 m. Steepness counts more than length, height counts a little.
 */
import { PROFILE_KM, routeLength, type Stage } from "./stages";

const DIP_M = 30;
const FLAT_GRADE = 1.5;
const FLAT_WINDOW = Math.round(2 / PROFILE_KM);
const BREATHER_KM = 2;
const MIN_GAIN_M = 100;

export type Category = "HC" | "1" | "2" | "3" | "4";

export interface Climb {
  /** 1-based, in route order. */
  number: number;
  /** Where it starts and tops out, on the komoot track. */
  startKm: number;
  topKm: number;
  /** The same, in the portal's kilometres (what the signs and checkpoints use). */
  start: number;
  top: number;
  lengthKm: number;
  gainM: number;
  /** % */
  averageGrade: number;
  /** % over the steepest kilometre. */
  steepestKm: number;
  startElevation: number;
  topElevation: number;
  fiets: number;
  category: Category;
  /** 1 is the stage's toughest. */
  rank: number;
}

function extremes(p: number[]) {
  const out: { kind: "valley" | "peak"; at: number }[] = [];
  let direction = 0;
  let low = 0;
  let high = 0;
  let candidate = 0;
  for (let i = 1; i < p.length; i++) {
    if (direction === 0) {
      if (p[i] < p[low]) low = i;
      if (p[i] > p[high]) high = i;
      if (p[i] - p[low] >= DIP_M) [direction, candidate] = [1, i], out.push({ kind: "valley", at: low });
      else if (p[high] - p[i] >= DIP_M) [direction, candidate] = [-1, i], out.push({ kind: "peak", at: high });
    } else if (direction === 1) {
      if (p[i] > p[candidate]) candidate = i;
      else if (p[candidate] - p[i] >= DIP_M) out.push({ kind: "peak", at: candidate }), (direction = -1), (candidate = i);
    } else {
      if (p[i] < p[candidate]) candidate = i;
      else if (p[i] - p[candidate] >= DIP_M) out.push({ kind: "valley", at: candidate }), (direction = 1), (candidate = i);
    }
  }
  out.push({ kind: direction === 1 ? "peak" : "valley", at: candidate });
  return out;
}

/** Walks down from the top until 2 km in a row barely climb: there the climb begins. */
function climbStart(p: number[], valley: number, top: number) {
  let s = top;
  while (s > valley) {
    const back = Math.max(valley, s - FLAT_WINDOW);
    if ((p[s] - p[back]) / ((s - back) * PROFILE_KM * 10) < FLAT_GRADE) break;
    s--;
  }
  return s;
}

const cache = new Map<string, Climb[]>();

export function climbs(stage: Stage): Climb[] {
  const cached = cache.get(stage.id);
  if (cached) return cached;
  const p = stage.profile;

  const spans: [number, number][] = [];
  const ext = extremes(p);
  for (let e = 0; e < ext.length - 1; e++) {
    if (ext[e].kind !== "valley" || ext[e + 1].kind !== "peak") continue;
    const valley = ext[e].at;
    let top = ext[e + 1].at;
    while (top > valley) {
      const start = climbStart(p, valley, top);
      spans.push([start, top]);
      if (start <= valley) break;
      // Below the flat stretch: the highest point left over is the next top to try.
      let next = valley;
      for (let i = valley; i <= start; i++) if (p[i] > p[next]) next = i;
      if (next >= start || p[next] - p[valley] < DIP_M) break;
      top = next;
    }
  }
  spans.sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && (span[0] - last[1]) * PROFILE_KM <= BREATHER_KM && p[span[1]] > p[last[1]]) {
      const lowest = Math.min(...p.slice(last[1], span[0] + 1));
      if (p[last[1]] - lowest <= DIP_M) {
        last[1] = span[1];
        continue;
      }
    }
    merged.push([...span]);
  }

  const scale = stage.distanceKm / routeLength(stage);
  const found = merged
    .filter(([s, t]) => p[t] - p[s] >= MIN_GAIN_M)
    .map(([s, t], i): Omit<Climb, "rank"> => {
      const gainM = p[t] - p[s];
      const lengthKm = (t - s) * PROFILE_KM;
      const perKm = Math.round(1 / PROFILE_KM);
      let steepest = 0;
      for (let k = s; k < t; k++) {
        const end = Math.min(t, k + perKm);
        steepest = Math.max(steepest, (p[end] - p[k]) / ((end - k) * PROFILE_KM * 10));
      }
      const fiets = gainM ** 2 / (lengthKm * 1000 * 10) + Math.max(0, (p[t] - 1000) / 1000);
      return {
        number: i + 1,
        startKm: s * PROFILE_KM,
        topKm: t * PROFILE_KM,
        start: s * PROFILE_KM * scale,
        top: t * PROFILE_KM * scale,
        lengthKm: lengthKm * scale,
        gainM,
        averageGrade: gainM / (lengthKm * 10),
        steepestKm: steepest,
        startElevation: p[s],
        topElevation: p[t],
        fiets,
        category: fiets >= 6 ? "HC" : fiets >= 4 ? "1" : fiets >= 2.5 ? "2" : fiets >= 1.5 ? "3" : "4",
      };
    });
  const byDifficulty = [...found].sort((a, b) => b.fiets - a.fiets);
  const result = found.map((c) => ({ ...c, rank: byDifficulty.indexOf(c) + 1 }));
  cache.set(stage.id, result);
  return result;
}

/** The climb's profile in steps: per km (per 500 m on short ones), each with its own gradient. */
export function steps(stage: Stage, climb: Climb): { fromKm: number; toKm: number; from: number; to: number; grade: number }[] {
  const per = climb.lengthKm <= 3 ? 1 : Math.round(1 / PROFILE_KM);
  const p = stage.profile;
  const s = Math.round(climb.startKm / PROFILE_KM);
  const t = Math.round(climb.topKm / PROFILE_KM);
  const out = [];
  for (let k = s; k < t; k += per) {
    const end = Math.min(t, k + per);
    out.push({ fromKm: k * PROFILE_KM, toKm: end * PROFILE_KM, from: p[k], to: p[end], grade: (p[end] - p[k]) / ((end - k) * PROFILE_KM * 10) });
  }
  return out;
}

/** The colour of a gradient, as climb profiles usually show them: green, yellow, orange, red, purple. */
export function gradeColor(grade: number) {
  if (grade < 2) return "#8e95a3";
  if (grade < 4) return "#3fc47e";
  if (grade < 6) return "#f2c94c";
  if (grade < 8) return "#f59a3c";
  if (grade < 10) return "#eb5446";
  return "#a3268f";
}

export const GRADE_SCALE = [
  { label: "<2", color: gradeColor(0) },
  { label: "2", color: gradeColor(2) },
  { label: "4", color: gradeColor(4) },
  { label: "6", color: gradeColor(6) },
  { label: "8", color: gradeColor(8) },
  { label: "10+", color: gradeColor(10) },
];
