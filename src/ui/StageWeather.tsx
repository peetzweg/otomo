import { useEffect, useState } from "react";
import type { Stage } from "../stages/stages";
import { describe, etaAt, forecastFor, waypoints, type PointForecast, type Waypoint } from "../stages/weather";

export interface StageWeatherData {
  points: Waypoint[];
  forecast: PointForecast[] | undefined;
  failed: boolean;
}

/** Forecasts change hourly at most. */
const FORECAST_EVERY_MS = 30 * 60_000;

/** Forecasts along the stage, kept fresh while shown. */
export function useStageWeather(stage: Stage | undefined): StageWeatherData | undefined {
  const [data, setData] = useState<StageWeatherData>();
  useEffect(() => {
    if (!stage) return setData(undefined);
    const points = waypoints(stage);
    let live = true;
    setData({ points, forecast: undefined, failed: false });
    const update = (patch: Partial<StageWeatherData>) => live && setData((d) => (d ? { ...d, ...patch } : d));
    const loadForecast = () =>
      forecastFor(stage, points)
        .then((forecast) => update({ forecast, failed: false }))
        .catch(() => update({ failed: true }));
    loadForecast();
    const timer = setInterval(loadForecast, FORECAST_EVERY_MS);
    return () => {
      live = false;
      clearInterval(timer);
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

/** The full sheet's extra: the stage's weather, forecast along the route. */
export function StageWeather({ stage, data }: { stage: Stage; data: StageWeatherData | undefined }) {
  const forecast = data?.forecast;
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

      {data?.failed && <p className="wx-caption">Couldn't reach the forecast; trying again shortly.</p>}
      <p className="wx-sources">Forecast: Open-Meteo (JMA models).</p>
    </div>
  );
}
