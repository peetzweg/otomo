import { useEffect, useRef } from "react";
import { css, inCoverage, LEVELS, STEP_MS } from "../radar/jma";
import { NOW_INDEX, radar, seek, togglePlay } from "../radar/radar";
import { clock, summarize } from "../radar/summary";
import { useStore } from "../store";
import { PauseIcon, PlayIcon } from "./icons";

/** The panel over the bottom of the map: what the rain does here, and the timeline to scrub through it. */
export function Sheet() {
  const status = useStore(radar, (s) => s.status);
  const frames = useStore(radar, (s) => s.frames);
  const levels = useStore(radar, (s) => s.levels);
  const place = useStore(radar, (s) => s.place);
  const sheet = useRef<HTMLElement>(null);

  // Map controls sit just above the sheet, whatever its height.
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      document.documentElement.style.setProperty("--sheet-height", `${entry.borderBoxSize[0].blockSize}px`),
    );
    observer.observe(sheet.current!);
    return () => observer.disconnect();
  }, []);

  const where = { gps: "Your location", pin: "Pinned spot", default: "Tokyo Station" }[place.source];
  const covered = inCoverage(place.lng, place.lat);
  const summary =
    status === "offline"
      ? { title: "Can't reach the radar", detail: "Check your connection; ameblitz tries again every minute" }
      : !covered
        ? { title: "Outside the radar", detail: "JMA's nowcast covers Japan and the seas around it" }
        : levels && frames.length
          ? summarize(frames, levels)
          : { title: "Reading the radar…", detail: " " };

  return (
    <section ref={sheet} className="sheet" aria-label="Rain forecast">
      <p className="sheet-where">{where}</p>
      <h1 className="sheet-title">{summary.title}</h1>
      <p className="sheet-detail">{summary.detail}</p>
      <Timeline />
    </section>
  );
}

function relative(index: number) {
  const minutes = ((index - NOW_INDEX) * STEP_MS) / 60_000;
  if (minutes === 0) return "Now";
  return minutes < 0 ? `${-minutes} min ago` : `in ${minutes} min`;
}

function Timeline() {
  const frames = useStore(radar, (s) => s.frames);
  const index = useStore(radar, (s) => s.index);
  const levels = useStore(radar, (s) => s.levels);
  const playing = useStore(radar, (s) => s.playing);
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
            const level = levels?.[i] ?? 0;
            return (
              <span
                key={f.id}
                className={`bar${level ? "" : " dry"}${i === index ? " current" : ""}`}
                style={level ? { height: `${18 + (level / 8) * 82}%`, background: css(LEVELS[level].color, 1) } : undefined}
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
