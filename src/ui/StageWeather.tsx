import { useEffect, useState } from "react";
import type { Stage } from "../stages/stages";
import { describe, etaAt, forecastFor, stationsAlong, waypoints, type PointForecast, type StationReading, type Waypoint } from "../stages/weather";

export interface StageWeatherData {
  points: Waypoint[];
  forecast: PointForecast[] | undefined;
  stations: { time: string; stations: StationReading[] } | undefined;
  failed: boolean;
}

/** Stations report every 10 minutes; forecasts change hourly at most. */
const STATIONS_EVERY_MS = 5 * 60_000;
const FORECAST_EVERY_MS = 30 * 60_000;

/** Forecasts along the stage and readings from the stations near it, kept fresh while shown. */
export function useStageWeather(stage: Stage | undefined): StageWeatherData | undefined {
  const [data, setData] = useState<StageWeatherData>();
  useEffect(() => {
    if (!stage) return setData(undefined);
    const points = waypoints(stage);
    let live = true;
    setData({ points, forecast: undefined, stations: undefined, failed: false });
    const update = (patch: Partial<StageWeatherData>) => live && setData((d) => (d ? { ...d, ...patch } : d));
    const loadForecast = () =>
      forecastFor(stage, points)
        .then((forecast) => update({ forecast }))
        .catch(() => update({ failed: true }));
    const loadStations = () =>
      stationsAlong(stage)
        .then((stations) => update({ stations }))
        .catch(() => update({ failed: true }));
    loadForecast();
    loadStations();
    const timers = [setInterval(loadForecast, FORECAST_EVERY_MS), setInterval(loadStations, STATIONS_EVERY_MS)];
    return () => {
      live = false;
      timers.forEach(clearInterval);
    };
  }, [stage?.id]);
  return data;
}

const deg = (t: number | undefined) => (t === undefined ? "–" : `${Math.round(t)}°`);
const officialKm = (stage: Stage, routeKm: number) => Math.round((routeKm * stage.distanceKm) / stage.points[stage.points.length - 1][2]);

/** Wind as where it blows to, the way it'll push you; "from" is how it's reported. */
function Wind({ speed, from }: { speed: number; from?: number }) {
  return (
    <span className="wx-wind">
      {from !== undefined && (
        <svg viewBox="0 0 12 12" width="11" height="11" style={{ transform: `rotate(${from + 180}deg)` }} aria-hidden="true">
          <path d="M6 1 10 10 6 8 2 10Z" fill="currentColor" />
        </svg>
      )}
      {Math.round(speed)} km/h
    </span>
  );
}

/** The full sheet's extra: the stage's weather, forecast along the route and measured near it. */
export function StageWeather({ stage, data }: { stage: Stage; data: StageWeatherData | undefined }) {
  const forecast = data?.forecast;
  const stations = data?.stations?.stations.filter((s) => s.temperature !== undefined);
  return (
    <div className="wx">
      <h2 className="wx-title">Along the route</h2>
      <p className="wx-caption">
        Forecast for the stage day, at the time you'd get there riding komoot's pace from {stage.start}.
      </p>
      <ol className="wx-list">
        {data?.points.map((point, i) => {
          const f = forecast?.[i];
          const at = f?.eta;
          const look = describe(at?.code ?? f?.day.code ?? 0);
          return (
            <li key={point.kind + point.routeKm} className={`wx-row wx-${point.kind}`}>
              <span className="wx-time">{etaAt(stage, point)}</span>
              <span className="wx-place">
                <b>{point.name}</b>
                <small>
                  km {officialKm(stage, point.routeKm)} · {point.elevation.toLocaleString("en-US")} m
                </small>
              </span>
              <span className="wx-temp">
                {f ? (
                  <>
                    <b>
                      <span aria-label={look.word}>{look.icon}</span> {deg(at?.temperature)}
                    </b>
                    <small>
                      now {deg(f.current.temperature)} · {Math.round(f.day.low)}–{deg(f.day.high)}
                    </small>
                  </>
                ) : (
                  <span className="wx-loading" />
                )}
              </span>
              <span className="wx-extra">
                {at && (
                  <>
                    <span>💧 {at.rainChance}%</span>
                    <Wind speed={at.wind} from={at.windFrom} />
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <h2 className="wx-title">Weather stations nearby</h2>
      <p className="wx-caption">
        Measured right now by JMA's AMeDAS stations within 10 km of the route{data?.stations && `, at ${data.stations.time}`}.
      </p>
      {stations ? (
        stations.length ? (
          <ol className="wx-list">
            {stations.map((s) => (
              <li key={s.id} className="wx-row">
                <span className="wx-time">km {officialKm(stage, s.routeKm)}</span>
                <span className="wx-place">
                  <b>
                    {s.name} <span className="wx-ja">{s.nameJa}</span>
                  </b>
                  <small>
                    {s.elevation.toLocaleString("en-US")} m · {(s.offM / 1000).toFixed(1)} km away
                  </small>
                </span>
                <span className="wx-temp">
                  <b>{deg(s.temperature)}</b>
                </span>
                <span className="wx-extra">
                  {s.rain1h !== undefined && <span>💧 {s.rain1h} mm/h</span>}
                  {s.wind !== undefined && <Wind speed={s.wind * 3.6} />}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="wx-caption">No stations close to this route.</p>
        )
      ) : (
        <p className="wx-caption">{data?.failed ? "Couldn't reach JMA; trying again in a few minutes." : "Reading the stations…"}</p>
      )}
      <p className="wx-sources">Forecast: Open-Meteo (JMA models). Stations: 気象庁 アメダス.</p>
    </div>
  );
}
