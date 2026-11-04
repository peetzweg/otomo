import { useEffect, useLayoutEffect, useRef } from "react";
import { css, inCoverage, LEVELS, STEP_MS } from "../radar/jma";
import { NOW_INDEX, radar, seek, selectStage, setCursor, togglePlay } from "../radar/radar";
import { clock, summarize, summarizeRoute, type Summary } from "../radar/summary";
import type { Progress } from "../stages/progress";
import { checkpoints, climbBetween, dayLabel, elevationAt, routeLength, STAGES, stageById, type Stage } from "../stages/stages";
import { climbs } from "../stages/climbs";
import { nextKonbini } from "../stages/konbini";
import { describe } from "../stages/weather";
import { useStore } from "../store";
import { PauseIcon, PlayIcon, SunIcon } from "./icons";
import { ClimbList, ClimbMarks, ClimbPage, climbHeadline } from "./Climbs";
import { KonbiniSection, KonbiniTicks } from "./Konbini";
import { useDrawer } from "./drawer";
import { StageWeather, useStageWeather, type StageWeatherData } from "./StageWeather";
import { openClimb, setSnap, view } from "./view";

/** The panel over the bottom of the map: what the rain does here, and the timeline to scrub through it. */
export function Sheet() {
  const status = useStore(radar, (s) => s.status);
  const frames = useStore(radar, (s) => s.frames);
  const levels = useStore(radar, (s) => s.levels);
  const place = useStore(radar, (s) => s.place);
  const stage = stageById(useStore(radar, (s) => s.stage));
  const route = useStore(radar, (s) => s.route);
  const progress = useStore(radar, (s) => s.progress);
  const riding = progress && progress.offM <= ON_ROUTE_M ? progress : undefined;
  const snap = useStore(view, (s) => s.snap);
  const collapsed = snap === "folded";
  const sheet = useRef<HTMLElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const halfEnd = useRef<HTMLDivElement>(null);
  const climbNumber = useStore(view, (s) => s.climb);
  const climb = stage && climbNumber !== undefined ? climbs(stage).find((c) => c.number === climbNumber) : undefined;
  // A climb's page belongs to its stage.
  useEffect(() => openClimb(undefined), [stage?.id]);
  // Only a stage has more to show when pulled all the way up; a climb's page fits at half.
  const drawer = useDrawer({ sheet, head, body, halfEnd }, !!stage && !climb);
  const weather = useStageWeather(stage);

  /** The sun: pull the sheet up and bring the weather to the top, or put it back. */
  const toggleWeather = () => {
    if (snap === "full") return setSnap("half");
    setSnap("full");
    const scroller = body.current!;
    const section = scroller.querySelector<HTMLElement>(".wx");
    if (section) scroller.scrollTo({ top: section.offsetTop - scroller.offsetTop - 8, behavior: "smooth" });
  };

  const headline = stage && climb ? climbHeadline(stage, climb) : undefined;
  const where = headline
    ? headline.where
    : stage
    ? `${dayLabel(stage)} · ${stage.start} start`
    : { gps: "Your location", pin: "Pinned spot", default: "Tokyo Station" }[place.source];
  const reading: Summary = { title: "Reading the radar…", detail: " " };
  const summary: Summary =
    status === "offline"
      ? { title: "Can't reach the radar", detail: "Check your connection; Otomo tries again every minute" }
      : stage
        ? route && frames.length
          ? summarizeRoute(frames, route, riding?.km)
          : reading
        : !inCoverage(place.lng, place.lat)
          ? { title: "Outside the radar", detail: "JMA's nowcast covers Japan and the seas around it" }
          : levels && frames.length
            ? summarize(frames, levels)
            : reading;

  return (
    <section ref={sheet} className={`sheet ${snap}`} aria-label="Rain forecast">
      {/* The head is the handle: drag it, flick it or tap it. Folded, only the head shows. */}
      <div
        ref={head}
        className="sheet-head"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Show details" : "Hide details"}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSnap(collapsed ? "half" : "folded"))}
        {...drawer}
      >
        <span className="grabber" aria-hidden="true" />
        <p className="sheet-where">{where}</p>
        {/* Keyed, so a new answer fades in rather than snapping (see .sheet-title). */}
        <h1 key={headline?.title ?? summary.title} className="sheet-title">
          {headline?.title ?? summary.title}
        </h1>
      </div>
      <div ref={body} className="sheet-body" inert={collapsed}>
        {stage && climb ? (
          // Keyed, so moving between climbs and back fades the page (see .sheet-page).
          <div key={`climb-${climb.number}`} className="sheet-page">
            <ClimbPage stage={stage} climb={climb} riding={riding} />
            <div ref={halfEnd} />
          </div>
        ) : (
        <div key="stage" className="sheet-page">
          <p className="sheet-detail">{summary.detail}</p>
          {stage && progress && <ProgressLine stage={stage} progress={progress} />}
          <StagePicker selected={stage?.id} weatherOpen={snap === "full"} onWeather={toggleWeather} />
          {stage && <RouteProfile stage={stage} riding={riding} weather={weather} />}
          <Timeline />
          <div ref={halfEnd} />
          {stage && (
            <>
              <ClimbList stage={stage} />
              <KonbiniSection stage={stage} />
              <StageWeather stage={stage} data={weather} />
            </>
          )}
        </div>
        )}
      </div>
    </section>
  );
}

/** "☀️ 15–19°": the day's range at the start or finish (`at` 0 or -1), once the forecast is in. */
function DayTemps({ weather, at }: { weather: StageWeatherData | undefined; at: number }) {
  const f = weather?.forecast?.at(at);
  if (!f) return null;
  return (
    <small className="profile-temps">
      {describe(f.day.code).icon} {Math.round(f.day.low)}–{Math.round(f.day.high)}°
    </small>
  );
}

/** Further from the route than this, you're not riding it (yet). GPS in a valley can be off by 100 m. */
const ON_ROUTE_M = 400;
/** Further than this, being off the route isn't worth a line. */
const NEARBY_M = 30_000;

/** Distances on the komoot track, in the portal's kilometres (what the checkpoints and signs use). */
const officialKm = (stage: Stage, routeKm: number) => (routeKm * stage.distanceKm) / routeLength(stage);

/** "km 63 · 105 km to go · ↑1,240 m left · CP2 in 53 km" */
function ProgressLine({ stage, progress }: { stage: Stage; progress: Progress }) {
  if (progress.offM > ON_ROUTE_M) {
    if (progress.offM > NEARBY_M) return null;
    return <p className="sheet-progress">{(progress.offM / 1000).toFixed(1)} km from the route</p>;
  }
  const length = routeLength(stage);
  const done = officialKm(stage, progress.km);
  const next = checkpoints(stage).find((cp) => cp.routeKm > progress.km);
  const shop = nextKonbini(stage, progress.km);
  const parts = [
    `km ${Math.round(done)}`,
    `${Math.round(stage.distanceKm - done)} km to go`,
    `↑${climbBetween(stage, progress.km, length).toLocaleString("en-US")} m left`,
    next && `${next.code} in ${Math.round(next.km - done)} km`,
    shop && `🏪 ${shop.brand} in ${(shop.km - done).toFixed(1)} km`,
  ];
  return <p className="sheet-progress riding">{parts.filter(Boolean).join(" · ")}</p>;
}

/**
 * One chip per stage, the highlight sliding to the chosen one, and the sun: the way to the weather
 * along the route, for anyone who wouldn't think to pull the sheet up.
 */
function StagePicker({ selected, weatherOpen, onWeather }: { selected: string | undefined; weatherOpen: boolean; onWeather: () => void }) {
  const row = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    const chip = row.current!.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!chip) return;
    const el = pill.current!;
    // No slide on first paint; only a change of mind is worth showing.
    el.style.transition = first.current ? "none" : "";
    el.style.width = `${chip.offsetWidth}px`;
    el.style.transform = `translateX(${chip.offsetLeft}px)`;
    first.current = false;
  });

  return (
    <div ref={row} className="chips">
      <span ref={pill} className="chips-pill" aria-hidden="true" />
      <button
        className="chip sun"
        aria-pressed={weatherOpen}
        aria-label="Weather along the route"
        disabled={!selected}
        onClick={onWeather}
      >
        <SunIcon />
      </button>
      <div className="chips-tabs" role="tablist" aria-label="Stage">
        {STAGES.map((stage) => (
          <button key={stage.id} role="tab" aria-selected={selected === stage.id} className="chip" onClick={() => selectStage(stage.id)}>
            {stage.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Profile drawing size, in SVG units; it stretches to the card's width. */
const PROFILE_W = 1000;
const PROFILE_H = 64;
/** At least this much height range, so a flat stage looks flat. */
const MIN_RANGE_M = 300;

/**
 * The stage's elevation profile, filled with the rain on the route at the frame on the map: scrub the
 * timeline and the colours move along the climbs.
 */
function RouteProfile({ stage, riding, weather }: { stage: Stage; riding: Progress | undefined; weather: StageWeatherData | undefined }) {
  const row = useStore(radar, (s) => s.route?.[s.index]);
  const cursorKm = useStore(radar, (s) => s.cursorKm);
  const chart = useRef<HTMLDivElement>(null);
  const [from, to] = stage.title.split(" → ");
  const length = stage.points[stage.points.length - 1][2];
  const { profile } = stage;

  const low = Math.min(...profile);
  const high = Math.max(...profile);
  const range = Math.max(high - low, MIN_RANGE_M);
  const x = (i: number) => (i / (profile.length - 1)) * PROFILE_W;
  const y = (m: number) => PROFILE_H - 1 - ((m - low) / range) * (PROFILE_H - 4);
  const line = profile.map((m, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(m).toFixed(1)}`).join("");
  // Where on the chart a km falls, as a fraction across and in pixels down.
  const across = (km: number) => `${(km / length) * 100}%`;
  const down = (km: number) => `${(y(elevationAt(stage, km)) / PROFILE_H) * 100}%`;

  // Drag along the profile to see where that point is on the map.
  const point = (clientX: number) => {
    const rect = chart.current!.getBoundingClientRect();
    setCursor(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * length);
  };

  // Runs of equal intensity become hard-edged gradient stops.
  const stops: { offset: number; color: string }[] = [];
  if (row) {
    let start = 0;
    for (let i = 1; i <= row.length; i++) {
      if (i < row.length && row[i] === row[start]) continue;
      const color = row[start] ? css(LEVELS[row[start]].color, 1) : "var(--profile-dry)";
      stops.push({ offset: start / row.length, color }, { offset: i / row.length, color });
      start = i;
    }
  }
  const fill = `rain-${stage.id}`;
  const area = `${line}L${PROFILE_W},${PROFILE_H}L0,${PROFILE_H}Z`;

  return (
    <div className="profile">
      <div className="profile-checkpoints">
        {checkpoints(stage).map((cp) => (
          <span key={cp.code} style={{ left: `${(cp.routeKm / length) * 100}%` }} title={`${cp.name}, km ${cp.km}`}>
            {cp.code}
          </span>
        ))}
      </div>
      <div
        ref={chart}
        className="profile-chart"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          point(e.clientX);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && point(e.clientX)}
        onPointerUp={() => setCursor(undefined)}
        onPointerCancel={() => setCursor(undefined)}
      >
        <svg viewBox={`0 0 ${PROFILE_W} ${PROFILE_H}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={fill} gradientUnits="userSpaceOnUse" x1="0" x2={PROFILE_W} y1="0" y2="0">
              {stops.map((stop, i) => (
                <stop key={i} offset={stop.offset} style={{ stopColor: stop.color }} />
              ))}
            </linearGradient>
          </defs>
          <path className={row ? undefined : "loading"} d={area} fill={row ? `url(#${fill})` : "var(--profile-dry)"} />
          <path d={line} className="profile-line" />
          {riding && (
            <>
              <clipPath id={`done-${stage.id}`}>
                <rect x={0} y={0} width={(riding.km / length) * PROFILE_W} height={PROFILE_H} />
              </clipPath>
              <path className="profile-done" d={area} clipPath={`url(#done-${stage.id})`} />
            </>
          )}
          {checkpoints(stage).map((cp) => (
            <line key={cp.code} className="profile-checkpoint" x1={(cp.routeKm / length) * PROFILE_W} x2={(cp.routeKm / length) * PROFILE_W} y1={0} y2={PROFILE_H} />
          ))}
        </svg>
        {riding && <span className="profile-rider" style={{ left: across(riding.km), top: down(riding.km) }} />}
        {cursorKm !== undefined && (
          <>
            <span className="profile-cursor" style={{ left: across(cursorKm) }} />
            <span className="profile-cursor-dot" style={{ left: across(cursorKm), top: down(cursorKm) }} />
            <span className="profile-cursor-label" style={{ left: `clamp(48px, ${across(cursorKm)}, calc(100% - 48px))` }}>
              km {Math.round(officialKm(stage, cursorKm))} · {elevationAt(stage, cursorKm).toLocaleString("en-US")} m
            </span>
          </>
        )}
      </div>
      <KonbiniTicks stage={stage} />
      <ClimbMarks stage={stage} />
      <div className="profile-labels">
        <span>
          {from}
          <DayTemps weather={weather} at={0} />
        </span>
        <span>
          {stage.distanceKm} km · ↑{stage.climbM.toLocaleString("en-US")} m · top {high.toLocaleString("en-US")} m
        </span>
        <span>
          {to}
          <DayTemps weather={weather} at={-1} />
        </span>
      </div>
    </div>
  );
}

function relative(index: number) {
  const minutes = ((index - NOW_INDEX) * STEP_MS) / 60_000;
  if (minutes === 0) return "Now";
  return minutes < 0 ? `${-minutes} min ago` : `in ${minutes} min`;
}

/** What each frame's bar shows: the rain at the spot, or for a stage, how much of it is wet and how hard. */
function useBars() {
  const stage = useStore(radar, (s) => s.stage);
  const levels = useStore(radar, (s) => s.levels);
  const route = useStore(radar, (s) => s.route);
  const frames = useStore(radar, (s) => s.frames);
  return frames.map((_, i) => {
    if (!stage) {
      const level = levels?.[i] ?? 0;
      return { level, fill: level / 8 };
    }
    const row = route?.[i] ?? [];
    const wet = row.filter((l) => l > 0).length;
    return { level: wet ? Math.max(...row) : 0, fill: wet / Math.max(1, row.length) };
  });
}

function Timeline() {
  const frames = useStore(radar, (s) => s.frames);
  const index = useStore(radar, (s) => s.index);
  const playing = useStore(radar, (s) => s.playing);
  const bars = useBars();
  const track = useRef<HTMLDivElement>(null);
  const count = frames.length;

  const seekTo = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const next = Math.round(fraction * (count - 1));
    if (next !== radar.get().index) seek(next);
  };

  const frame = frames[index];
  const forecast = frame?.forecast;

  return (
    <div className="timeline">
      <div className="timeline-head">
        <button className="play" onClick={togglePlay} disabled={!count} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="timeline-time">
          <span className="timeline-clock">{frame ? clock(frame.time) : "--:--"}</span>
          <span className={`timeline-relative${forecast ? " forecast" : ""}`}>{frame ? relative(index) : ""}</span>
        </div>
        <span className="timeline-zone">JST</span>
      </div>
      <div
        ref={track}
        className="track"
        role="slider"
        tabIndex={0}
        aria-label="Radar time"
        aria-valuemin={0}
        aria-valuemax={count - 1}
        aria-valuenow={index}
        aria-valuetext={frame ? `${clock(frame.time)}, ${relative(index)}` : undefined}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekTo(e.clientX);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && seekTo(e.clientX)}
        onKeyDown={(e) => {
          const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
          if (step) seek(Math.min(count - 1, Math.max(0, index + step)));
        }}
      >
        <div className="track-forecast" style={{ left: `${(NOW_INDEX / Math.max(1, count - 1)) * 100}%` }} />
        <div className="bars">
          {frames.map((f, i) => {
            const { level, fill } = bars[i];
            return (
              <span
                key={f.id}
                className={`bar${level ? "" : " dry"}${i === index ? " current" : ""}`}
                style={level ? { height: `${18 + fill * 82}%`, background: css(LEVELS[level].color, 1) } : undefined}
              />
            );
          })}
        </div>
        <div className="playhead" style={{ left: `${(index / Math.max(1, count - 1)) * 100}%` }} />
      </div>
      <div className="track-labels">
        <span>{frames[0] ? clock(frames[0].time) : ""}</span>
        <span className="track-now" style={{ left: `${(NOW_INDEX / Math.max(1, count - 1)) * 100}%` }}>
          Now
        </span>
        <span>{frames[count - 1] ? clock(frames[count - 1].time) : ""}</span>
      </div>
    </div>
  );
}
