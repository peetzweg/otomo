/**
 * The Japan Meteorological Agency's high-resolution precipitation nowcast (高解像度降水ナウキャスト):
 * radar and rain-gauge analysis at 250 m every 5 minutes, plus a forecast 5 to 60 minutes ahead.
 *
 * These are the tiles behind https://www.jma.go.jp/bosai/nowc/. The tiles are served with
 * `Access-Control-Allow-Origin: *`; the time lists next to them (targetTimes_N1/N2.json) are not, so
 * instead of reading those we find the latest run by asking for one of its tiles. Frame times follow a
 * fixed 5-minute grid, which is all the lists would tell us anyway.
 */

const ROOT = "https://www.jma.go.jp/bosai/jmatile/data/nowc";
export const STEP_MS = 5 * 60_000;
/** How far back the timeline reaches. JMA keeps 3 hours; 90 minutes is enough to see where rain came from. */
export const PAST_FRAMES = 18;
/** The nowcast runs 60 minutes ahead in 5-minute steps. */
export const FORECAST_FRAMES = 12;

/** Roughly the area the nowcast covers. Outside it a tile is just empty, which would read as "dry". */
export const COVERAGE: [west: number, south: number, east: number, north: number] = [118, 20, 150, 48];

export interface Frame {
  /** Unique per tile set: the run (basetime) plus the moment shown (validtime). */
  id: string;
  /** When the run started, as JMA's UTC stamp (yyyymmddhhmmss). Analysis frames are their own run. */
  base: string;
  valid: string;
  time: number;
  forecast: boolean;
}

const stamp = (time: number) => new Date(time).toISOString().replace(/\D/g, "").slice(0, 14);

export const tileUrl = (frame: Pick<Frame, "base" | "valid">, z: number, x: number, y: number) =>
  `${ROOT}/${frame.base}/none/${frame.valid}/surf/hrpns/${z}/${x}/${y}.png`;

function frame(base: number, valid: number): Frame {
  const b = stamp(base);
  const v = stamp(valid);
  return { id: `${b}-${v}`, base: b, valid: v, time: valid, forecast: valid > base };
}

/**
 * Whether a run's forecast can be shown: its last frame has a z10 tile over Tokyo (tiles exist for
 * every published frame, rain or not). It has to be z10: the forecast lands a minute or so after the
 * analysis, and once the next run is out JMA deletes the older forecast's detailed zooms but keeps
 * zooms 4 and below, so a low-zoom tile would vouch for a run the map can no longer draw.
 */
async function published(base: number) {
  const url = tileUrl(frame(base, base + FORECAST_FRAMES * STEP_MS), 10, 909, 403);
  try {
    return (await fetch(url, { method: "HEAD", cache: "no-store" })).ok;
  } catch {
    return false;
  }
}

/** The newest run, a few minutes behind the clock. Undefined when JMA can't be reached. */
export async function latestRun(now = Date.now()): Promise<number | undefined> {
  const newest = Math.floor(now / STEP_MS) * STEP_MS;
  for (let back = 0; back < 6; back++) {
    const base = newest - back * STEP_MS;
    if (await published(base)) return base;
  }
}

/** The timeline for a run: PAST_FRAMES of analysis, the run itself ("now"), then the forecast. */
export function framesFor(base: number): Frame[] {
  const frames: Frame[] = [];
  for (let i = PAST_FRAMES; i > 0; i--) {
    const t = base - i * STEP_MS;
    frames.push(frame(t, t));
  }
  frames.push(frame(base, base));
  for (let i = 1; i <= FORECAST_FRAMES; i++) frames.push(frame(base, base + i * STEP_MS));
  return frames;
}

/* ---------- Intensity ---------- */

/**
 * JMA's colour scale, in palette order. Every nowcast tile is an indexed PNG with these at indexes 2 to
 * 9 (0 and 1 are transparent), so a colour on a tile is an intensity class.
 */
const JMA_COLORS: [number, number, number][] = [
  [242, 242, 255],
  [160, 210, 255],
  [33, 140, 255],
  [0, 65, 255],
  [250, 245, 0],
  [255, 153, 0],
  [255, 40, 0],
  [180, 0, 104],
];

export interface Level {
  /** Lower bound of the class in mm/h; JMA's legend steps. */
  from: number;
  /** A typical rate inside the class, for drawing bars. */
  typical: number;
  /** JMA's own wording for these rates (弱い雨, やや強い雨, 強い雨, 激しい雨…), in English. */
  word: string;
  /** Our colour for the class: the map, the legend and the timeline all use it. */
  color: [number, number, number, number];
}

/** Class 0 is dry; 1 to 8 follow JMA_COLORS. */
export const LEVELS: Level[] = [
  { from: 0, typical: 0, word: "Dry", color: [0, 0, 0, 0] },
  { from: 0, typical: 0.5, word: "Drizzle", color: [130, 205, 255, 70] },
  { from: 1, typical: 3, word: "Light rain", color: [64, 160, 255, 150] },
  { from: 5, typical: 7, word: "Moderate rain", color: [48, 110, 250, 200] },
  { from: 10, typical: 15, word: "Rather heavy rain", color: [110, 70, 240, 220] },
  { from: 20, typical: 25, word: "Heavy rain", color: [190, 60, 225, 235] },
  { from: 30, typical: 40, word: "Intense rain", color: [255, 70, 140, 245] },
  { from: 50, typical: 65, word: "Torrential rain", color: [255, 140, 60, 255] },
  { from: 80, typical: 90, word: "Extreme rain", color: [255, 225, 90, 255] },
];

export const css = ([r, g, b, a]: Level["color"], alpha = a / 255) => `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;

function levelOf(r: number, g: number, b: number, a: number) {
  if (a < 128) return 0;
  let best = 0;
  let bestDistance = Infinity;
  JMA_COLORS.forEach(([cr, cg, cb], i) => {
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < bestDistance) [best, bestDistance] = [i + 1, d];
  });
  return best;
}

/* ---------- Recolouring ---------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const PLTE = chunk("PLTE", new Uint8Array([0, 0, 0, 0, 0, 0, ...LEVELS.slice(1).flatMap((l) => l.color.slice(0, 3))]));
const TRNS = chunk("tRNS", new Uint8Array([0, 0, ...LEVELS.slice(1).map((l) => l.color[3])]));

/**
 * Swaps a tile's palette for ours, so the map gets our colours (with translucency for light rain)
 * without decoding a pixel. Tiles without a palette are empty and pass through untouched.
 */
export function recolor(png: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(png);
  const view = new DataView(png);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let recolored = false;
  for (let at = 8; at < bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const end = at + 12 + length;
    if (type === "PLTE") {
      parts.push(PLTE);
      recolored = true;
    } else if (type === "tRNS" && recolored) {
      parts.push(TRNS);
    } else {
      parts.push(bytes.subarray(at, end));
    }
    at = end;
  }
  if (!recolored) return png;
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out.buffer;
}

/**
 * A map tile, recoloured. JMA only draws even zooms (4, 6, 8, 10): an odd zoom answers 200 with an
 * empty placeholder. So an odd tile is cut from its parent, the quarter of it this tile covers, scaled
 * up; the same the map would do itself when overzooming.
 */
export async function radarTile(url: string, signal: AbortSignal): Promise<ArrayBuffer | ImageBitmap> {
  const [, prefix, z, x, y] = url.match(/^(.*)\/(\d+)\/(\d+)\/(\d+)\.png$/)!.map((p, i) => (i > 1 ? Number(p) : p)) as [
    string,
    string,
    number,
    number,
    number,
  ];
  const odd = z % 2 === 1;
  const source = odd ? `${prefix}/${z - 1}/${x >> 1}/${y >> 1}.png` : url;
  const response = await fetch(source, { signal });
  if (!response.ok) throw new Error(`${response.status} ${source}`);
  const png = recolor(await response.arrayBuffer());
  if (!odd) return png;
  const quarter = 128;
  return createImageBitmap(new Blob([png], { type: "image/png" }), (x & 1) * quarter, (y & 1) * quarter, quarter, quarter, {
    resizeWidth: 256,
    resizeHeight: 256,
    resizeQuality: "medium",
  });
}

/* ---------- Rain at a point ---------- */

/** z10 tiles are about 125 m a pixel over Japan, finer than the data, so one pixel is one cell. (Tiles only exist at even zooms.) */
const SAMPLE_ZOOM = 10;
const decoded = new Map<string, Promise<ImageData | undefined>>();

async function pixels(url: string) {
  let pending = decoded.get(url);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(url);
      if (!response.ok) return undefined;
      const bitmap = await createImageBitmap(await response.blob());
      const { width, height } = bitmap;
      const context = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      return context.getImageData(0, 0, width, height);
    })().catch(() => undefined);
    decoded.set(url, pending);
    // Frames leave the timeline as time moves on; so should their pixels.
    if (decoded.size > 800) decoded.delete(decoded.keys().next().value!);
  }
  return pending;
}

export const inCoverage = (lng: number, lat: number) =>
  lng >= COVERAGE[0] && lng <= COVERAGE[2] && lat >= COVERAGE[1] && lat <= COVERAGE[3];

/** The intensity class at a place, per frame. A frame that couldn't be read counts as dry. */
/** The intensity class at a place, per frame. A frame that couldn't be read counts as dry. */
export async function levelsAt(frames: Frame[], lng: number, lat: number): Promise<number[]> {
  return (await levelsAlong(frames, [[lng, lat]])).map(([level]) => level);
}

/**
 * The intensity class at many places, per frame: `result[frame][place]`. Reading a long route at
 * z10 would mean dozens of tiles a frame; `zoom` 8 (about 500 m a pixel) covers a day's ride in a few.
 */
export async function levelsAlong(frames: Frame[], places: [number, number][], zoom = SAMPLE_ZOOM): Promise<number[][]> {
  const scale = 2 ** zoom;
  const cells = places.map(([lng, lat]) => {
    const worldX = ((lng + 180) / 360) * scale;
    const sin = Math.sin((lat * Math.PI) / 180);
    const worldY = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
    const [x, y] = [Math.floor(worldX), Math.floor(worldY)];
    return { x, y, px: Math.floor((worldX - x) * 256), py: Math.floor((worldY - y) * 256) };
  });
  return Promise.all(
    frames.map(async (f) => {
      const tiles = new Map<string, Promise<ImageData | undefined>>();
      const images = await Promise.all(
        cells.map(({ x, y }) => {
          const url = tileUrl(f, zoom, x, y);
          if (!tiles.has(url)) tiles.set(url, pixels(url));
          return tiles.get(url)!;
        }),
      );
      return cells.map(({ px, py }, i) => {
        const image = images[i];
        if (!image) return 0;
        const at = (py * image.width + px) * 4;
        return levelOf(image.data[at], image.data[at + 1], image.data[at + 2], image.data[at + 3]);
      });
    }),
  );
}
