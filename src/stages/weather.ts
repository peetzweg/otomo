/**
 * Temperature and wind for a stage, from two sources that both allow browser requests:
 *
 * - Forecasts from Open-Meteo, which for Japan runs on JMA's own models, corrected for each point's
 *   altitude: what to expect at the start, the checkpoints, the top and the finish, at the hour you get
 *   there.
 * - Measurements from JMA's AMeDAS stations (アメダス, ~1,300 of them, every 10 minutes): what the
 *   stations along the route read right now.
 */
import { progressOn } from "./progress";
import { checkpoints, elevationAt, PROFILE_KM, routeLength, type Stage } from "./stages";

export interface Waypoint {
  kind: "start" | "checkpoint" | "top" | "finish";
  name: string;
  /** On the komoot track. */
  routeKm: number;
  lng: number;
  lat: number;
  elevation: number;
  /** komoot's planned riding time to here, in minutes. */
  minutes: number;
}

/** Start, checkpoints, the highest point and the finish, in route order. */
export function waypoints(stage: Stage): Waypoint[] {
  const { points, profile } = stage;
  const length = routeLength(stage);
  const at = (km: number) => {
    const i = Math.max(0, points.findIndex((p) => p[2] >= km));
    return points[i];
  };
  const make = (kind: Waypoint["kind"], name: string, km: number): Waypoint => {
    const [lng, lat, , minutes] = at(km);
    return { kind, name, routeKm: km, lng, lat, elevation: elevationAt(stage, km), minutes };
  };
  const [from, to] = stage.title.split(" → ");
  const topKm = profile.indexOf(Math.max(...profile)) * PROFILE_KM;
  return [
    make("start", from, 0),
    ...checkpoints(stage).map((cp) => make("checkpoint", `${cp.code} ${cp.name}`, cp.routeKm)),
    make("top", "Highest point", topKm),
    make("finish", to, length),
  ].sort((a, b) => a.routeKm - b.routeKm);
}

/* ---------- Forecast ---------- */

export interface PointForecast {
  /** Now, wherever the stage day is. */
  current: { temperature: number; code: number };
  day: { low: number; high: number; code: number; rainChance: number };
  /** At the hour you're expected there, on the stage day. */
  eta: { time: string; temperature: number; code: number; rainChance: number; wind: number; windFrom: number } | undefined;
}

const forecasts = new Map<string, { at: number; data: Promise<PointForecast[]> }>();
/** Forecasts are updated hourly at best. */
const FORECAST_TTL_MS = 30 * 60_000;

const clockAt = (start: string, minutes: number) => {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** The expected time at a waypoint, from the shared start time and komoot's planned pace: "10:42". */
export const etaAt = (stage: Stage, point: Waypoint) => clockAt(stage.start, point.minutes);

export function forecastFor(stage: Stage, points: Waypoint[]): Promise<PointForecast[]> {
  const key = stage.id;
  const cached = forecasts.get(key);
  if (cached && Date.now() - cached.at < FORECAST_TTL_MS) return cached.data;
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(","),
    longitude: points.map((p) => p.lng.toFixed(4)).join(","),
    // The route's own height, not the model grid's: it matters on a 1,300 m pass.
    elevation: points.map((p) => p.elevation).join(","),
    current: "temperature_2m,weather_code",
    daily: "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
    hourly: "temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m",
    timezone: "Asia/Tokyo",
    start_date: stage.date,
    end_date: stage.date,
  });
  const data = fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
    .then((r) => {
      if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
      return r.json();
    })
    .then((json: OpenMeteo | OpenMeteo[]) => {
      const list = Array.isArray(json) ? json : [json];
      return list.map((f, i): PointForecast => {
        const eta = `${stage.date}T${etaAt(stage, points[i]).slice(0, 2)}:00`;
        const h = f.hourly.time.indexOf(eta);
        return {
          current: { temperature: f.current.temperature_2m, code: f.current.weather_code },
          day: {
            low: f.daily.temperature_2m_min[0],
            high: f.daily.temperature_2m_max[0],
            code: f.daily.weather_code[0],
            rainChance: f.daily.precipitation_probability_max[0] ?? 0,
          },
          eta:
            h < 0
              ? undefined
              : {
                  time: etaAt(stage, points[i]),
                  temperature: f.hourly.temperature_2m[h],
                  code: f.hourly.weather_code[h],
                  rainChance: f.hourly.precipitation_probability[h] ?? 0,
                  wind: f.hourly.wind_speed_10m[h],
                  windFrom: f.hourly.wind_direction_10m[h],
                },
        };
      });
    });
  // A failed request shouldn't stick; the next look tries again.
  data.catch(() => forecasts.delete(key));
  forecasts.set(key, { at: Date.now(), data });
  return data;
}

interface OpenMeteo {
  current: { temperature_2m: number; weather_code: number };
  daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[]; precipitation_probability_max: (number | null)[] };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: (number | null)[];
    weather_code: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
  };
}

/** WMO weather codes, as Open-Meteo reports them, to a symbol and a word. */
export function describe(code: number): { icon: string; word: string } {
  if (code === 0) return { icon: "☀️", word: "Clear" };
  if (code <= 2) return { icon: "🌤️", word: "Partly cloudy" };
  if (code === 3) return { icon: "☁️", word: "Cloudy" };
  if (code <= 48) return { icon: "🌫️", word: "Fog" };
  if (code <= 57) return { icon: "🌦️", word: "Drizzle" };
  if (code <= 67) return { icon: "🌧️", word: "Rain" };
  if (code <= 77) return { icon: "🌨️", word: "Snow" };
  if (code <= 82) return { icon: "🌧️", word: "Showers" };
  if (code <= 86) return { icon: "🌨️", word: "Snow showers" };
  return { icon: "⛈️", word: "Thunderstorm" };
}

/* ---------- AMeDAS stations ---------- */

const AMEDAS = "https://www.jma.go.jp/bosai/amedas";
/** Stations further from the route than this aren't "along the way". */
const NEAR_ROUTE_M = 10_000;

export interface StationReading {
  id: string;
  name: string;
  /** Japanese name, as on the station. */
  nameJa: string;
  routeKm: number;
  offM: number;
  elevation: number;
  temperature: number | undefined;
  wind: number | undefined;
  /** mm in the last hour. */
  rain1h: number | undefined;
}

interface AmedasStation {
  lat: [number, number];
  lon: [number, number];
  alt: number;
  kjName: string;
  enName: string;
}

/** A reading is [value, quality flag]; anything but flag 0 is missing or doubtful. */
type Reading = [number | null, number] | undefined;
const value = (r: Reading) => (r && r[1] === 0 && r[0] !== null ? r[0] : undefined);

let table: Promise<Record<string, AmedasStation>> | undefined;
const nearby = new Map<string, Promise<{ id: string; station: AmedasStation; routeKm: number; offM: number }[]>>();
let latest: { at: number; data: Promise<{ time: string; readings: Record<string, Record<string, Reading>> }> } | undefined;
/** Stations report every 10 minutes. */
const READINGS_TTL_MS = 5 * 60_000;

function stationsNear(stage: Stage) {
  let pending = nearby.get(stage.id);
  if (!pending) {
    table ??= fetch(`${AMEDAS}/const/amedastable.json`).then((r) => r.json());
    const lngs = stage.points.map((p) => p[0]);
    const lats = stage.points.map((p) => p[1]);
    // A cheap box first (about 11 km of slack), then the real distance to the route.
    const [west, east, south, north] = [Math.min(...lngs) - 0.12, Math.max(...lngs) + 0.12, Math.min(...lats) - 0.1, Math.max(...lats) + 0.1];
    pending = table.then((all) =>
      Object.entries(all)
        .map(([id, station]) => ({ id, station, lng: station.lon[0] + station.lon[1] / 60, lat: station.lat[0] + station.lat[1] / 60 }))
        .filter((s) => s.lng >= west && s.lng <= east && s.lat >= south && s.lat <= north)
        .map((s) => ({ id: s.id, station: s.station, ...progressOn(stage, s.lng, s.lat) }))
        .filter((s) => s.offM <= NEAR_ROUTE_M)
        .map(({ id, station, km, offM }) => ({ id, station, routeKm: km, offM }))
        .sort((a, b) => a.routeKm - b.routeKm),
    );
    pending.catch(() => nearby.delete(stage.id));
    nearby.set(stage.id, pending);
  }
  return pending;
}

function latestReadings() {
  if (!latest || Date.now() - latest.at > READINGS_TTL_MS) {
    const data = fetch(`${AMEDAS}/data/latest_time.txt`)
      .then((r) => r.text())
      .then(async (iso) => {
        // "2026-11-02T21:00:00+09:00" → the map file for that moment, named in JST.
        const stamp = iso.trim().slice(0, 19).replace(/\D/g, "");
        const readings = await fetch(`${AMEDAS}/data/map/${stamp}.json`).then((r) => r.json());
        return { time: iso.trim().slice(11, 16), readings };
      });
    data.catch(() => (latest = undefined));
    latest = { at: Date.now(), data };
  }
  return latest.data;
}

/** The stations within a few km of the route, in route order, with what they measure now. */
export async function stationsAlong(stage: Stage): Promise<{ time: string; stations: StationReading[] }> {
  const [near, { time, readings }] = await Promise.all([stationsNear(stage), latestReadings()]);
  return {
    time,
    stations: near.map(({ id, station, routeKm, offM }) => {
      const r = readings[id] ?? {};
      return {
        id,
        name: station.enName,
        nameJa: station.kjName,
        routeKm,
        offM,
        elevation: station.alt,
        temperature: value(r.temp),
        wind: value(r.wind),
        rain1h: value(r.precipitation1h),
      };
    }),
  };
}
