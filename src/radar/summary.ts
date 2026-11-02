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
