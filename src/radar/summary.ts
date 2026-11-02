import { SAMPLE_KM } from "../stages/stages";
import { LEVELS, STEP_MS, type Frame } from "./jma";
import { NOW_INDEX } from "./radar";

export interface Summary {
  title: string;
  detail: string;
}

const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
export const clock = (t: number) => time.format(t);

const minutes = (frames: number) => Math.round((frames * STEP_MS) / 60_000);

/** Two consecutive dry frames count as a break; a single gap in a shower doesn't. */
function firstDryRun(levels: number[], from: number) {
  for (let i = from; i < levels.length; i++) {
    if (levels[i] === 0 && (i === levels.length - 1 || levels[i + 1] === 0)) return i;
  }
}

/** The one-line answer to "will I get wet?", read from the levels at a place. */
export function summarize(frames: Frame[], levels: number[]): Summary {
  const now = levels[NOW_INDEX];
  const ahead = levels.slice(NOW_INDEX + 1);
  const peak = Math.max(now, ...ahead);
  const peakAt = frames[NOW_INDEX + 1 + ahead.indexOf(peak)];

  if (now > 0) {
    const stops = firstDryRun(levels, NOW_INDEX + 1);
    const word = LEVELS[now].word;
    if (stops !== undefined) {
      return { title: `Rain stops in ~${minutes(stops - NOW_INDEX)} min`, detail: `${word} now, dry from around ${clock(frames[stops].time)}` };
    }
    const worse = peak > now && peakAt ? `, ${LEVELS[peak].word.toLowerCase()} around ${clock(peakAt.time)}` : "";
    return { title: "Rain for the next hour", detail: `${word} now${worse}` };
  }

  const starts = ahead.findIndex((l) => l > 0);
  if (starts >= 0) {
    const frame = frames[NOW_INDEX + 1 + starts];
    return {
      title: `Rain in ~${minutes(starts + 1)} min`,
      detail: `${LEVELS[ahead[starts]].word} from around ${clock(frame.time)}${peak > ahead[starts] ? `, up to ${LEVELS[peak].word.toLowerCase()}` : ""}`,
    };
  }

  const lastWet = levels.slice(0, NOW_INDEX).findLastIndex((l) => l > 0);
  if (lastWet >= 0) {
    return { title: "Dry for the next hour", detail: `The rain stopped around ${clock(frames[lastWet + 1].time)}` };
  }
  return { title: "Dry for the next hour", detail: "No rain here in the last 90 minutes either" };
}

/** "km 40–65": the stretch from the first to the last wet reading, `offset` readings into the route. */
function stretch(row: number[], offset: number) {
  const first = row.findIndex((l) => l > 0);
  const last = row.findLastIndex((l) => l > 0);
  const km = (i: number) => Math.round((i + offset) * SAMPLE_KM);
  return first === last ? `km ${km(first)}` : `km ${km(first)}–${km(last)}`;
}

const wetKm = (row: number[]) => row.filter((l) => l > 0).length * SAMPLE_KM;

/**
 * The same question for a whole ride: where on the route is it raining, and is that changing? Once
 * you're on the route (`fromKm`), only the road ahead counts.
 */
export function summarizeRoute(frames: Frame[], fullRoute: number[][], fromKm?: number): Summary {
  const offset = fromKm === undefined ? 0 : Math.floor(fromKm / SAMPLE_KM);
  const route = fullRoute.map((row) => row.slice(offset));
  const where = fromKm === undefined ? "of the route" : "ahead";
  const now = route[NOW_INDEX];
  const ahead = route.slice(NOW_INDEX + 1);

  if (wetKm(now) > 0) {
    const peak = Math.max(...now);
    const later = wetKm(ahead[ahead.length - 1]);
    const trend =
      later === 0 ? ", clearing within the hour" : later > wetKm(now) * 1.3 ? ", spreading" : later < wetKm(now) * 0.7 ? ", easing" : "";
    return { title: `Rain on ${wetKm(now)} km ${where}`, detail: `${LEVELS[peak].word} at worst, ${stretch(now, offset)}${trend}` };
  }

  const reaches = ahead.findIndex((row) => wetKm(row) > 0);
  if (reaches >= 0) {
    const row = ahead[reaches];
    return {
      title: `Rain reaching the route${fromKm === undefined ? "" : " ahead"} in ~${minutes(reaches + 1)} min`,
      detail: `${LEVELS[Math.max(...row)].word} around ${stretch(row, offset)}, from ${clock(frames[NOW_INDEX + 1 + reaches].time)}`,
    };
  }

  const lastWet = route.slice(0, NOW_INDEX).findLastIndex((row) => wetKm(row) > 0);
  return {
    title: fromKm === undefined ? "Dry along the whole route" : "Dry on the road ahead",
    detail: lastWet >= 0 ? `For the next hour; the last rain left around ${clock(frames[lastWet + 1].time)}` : "For the next hour, and the last 90 minutes too",
  };
}
