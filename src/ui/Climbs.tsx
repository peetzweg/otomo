import type { Climb } from "../stages/climbs";
import { climbs, GRADE_SCALE, gradeColor, steps } from "../stages/climbs";
import type { Progress } from "../stages/progress";
import { routeLength, type Stage } from "../stages/stages";
import { etaAtKm } from "../stages/weather";
import { openClimb } from "./view";

const km1 = (km: number) => km.toFixed(1);
const pct = (grade: number) => `${grade.toFixed(1)}%`;
const metres = (m: number) => `${Math.round(m).toLocaleString("en-US")} m`;

/** "Toughest" and "easiest" only mean something with more than one climb to compare. */
function standing(climb: Climb, all: Climb[]) {
  if (all.length < 2) return undefined;
  if (climb.rank === 1) return "toughest";
  if (climb.rank === all.length) return "easiest";
}

const Mountain = () => (
  <svg viewBox="0 0 12 10" width="11" height="9" aria-hidden="true">
    <path d="M0 10 4.2 2.6l1.9 3.1L8.4 1 12 10Z" fill="currentColor" />
  </svg>
);

/** A climb's category as a badge, the way race profiles mark them. */
export function CategoryBadge({ climb, toughest }: { climb: Climb; toughest?: boolean }) {
  return (
    <span className={`climb-badge${toughest ? " toughest" : ""}`}>
      <Mountain />
      {climb.category === "HC" ? "HC" : climb.category}
    </span>
  );
}

/** Under the stage's profile: each climb's span as a bar, its badge centred on it, to tap for its page. */
export function ClimbMarks({ stage }: { stage: Stage }) {
  const all = climbs(stage);
  const length = routeLength(stage);
  return (
    <div className="climb-marks">
      {all.map((c) => (
        <span key={c.number} className="climb-span" style={{ left: `${(c.startKm / length) * 100}%`, width: `${((c.topKm - c.startKm) / length) * 100}%` }} />
      ))}
      {all.map((c) => (
        <button
          key={c.number}
          className="climb-mark"
          style={{ left: `${((c.startKm + c.topKm) / 2 / length) * 100}%` }}
          onClick={() => openClimb(c.number)}
          aria-label={`Climb ${c.number}: ${km1(c.lengthKm)} km at ${pct(c.averageGrade)}, category ${c.category}`}
        >
          <CategoryBadge climb={c} toughest={c.rank === 1 && all.length > 1} />
        </button>
      ))}
    </div>
  );
}

/** In the full sheet: the stage's climbs in route order, rated. */
export function ClimbList({ stage }: { stage: Stage }) {
  const all = climbs(stage);
  const total = all.reduce((sum, c) => sum + c.gainM, 0);
  return (
    <div className="climbs">
      <h2 className="wx-title">Climbs</h2>
      <p className="wx-caption">
        {all.length
          ? `${all.length} climb${all.length > 1 ? "s" : ""} of 100 m or more: ${metres(total)} of the stage's ${metres(stage.climbM)}. Rated by the FIETS index, steepness counting most.`
          : "No climb of 100 m or more on this stage."}
      </p>
      <ol className="wx-list">
        {all.map((c) => {
          const tag = standing(c, all);
          return (
            <li key={c.number}>
              <button className="wx-row climb-row" onClick={() => openClimb(c.number)}>
                <CategoryBadge climb={c} toughest={c.rank === 1 && all.length > 1} />
                <span className="wx-place">
                  <b>
                    Climb {c.number}
                    {tag && <span className={`climb-tag ${tag}`}>{tag}</span>}
                  </b>
                  <small>
                    km {Math.round(c.start)}–{Math.round(c.top)} · top {metres(c.topElevation)}
                  </small>
                </span>
                <span className="wx-temp">
                  <b>{pct(c.averageGrade)}</b>
                  <small>
                    {km1(c.lengthKm)} km · +{metres(c.gainM)}
                  </small>
                </span>
                <span className="climb-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** What the sheet's head says on a climb's page. */
export function climbHeadline(stage: Stage, climb: Climb) {
  const all = climbs(stage);
  const tag = standing(climb, all);
  return {
    where: `Climb ${climb.number} of ${all.length} · ${climb.category === "HC" ? "HC" : `Cat ${climb.category}`}${tag ? ` · ${tag} of the stage` : ""}`,
    title: `${km1(climb.lengthKm)} km at ${pct(climb.averageGrade)}`,
  };
}

const CHART_W = 1000;
const CHART_H = 150;

/** The climb in steps, each coloured by its gradient, with its % over it: a race-book climb profile. */
function GradientChart({ stage, climb }: { stage: Stage; climb: Climb }) {
  const parts = steps(stage, climb);
  const low = climb.startElevation;
  const range = Math.max(climb.gainM, 100);
  const x = (km: number) => ((km - climb.startKm) / (climb.topKm - climb.startKm)) * CHART_W;
  const y = (m: number) => CHART_H - 2 - ((m - low) / range) * (CHART_H - 28);
  // Labels only where they fit: every step on a short climb, every other on a long one.
  const every = parts.length > 12 ? 2 : 1;
  return (
    <div className="climb-chart">
      <div className="climb-plot">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden="true">
        {parts.map((s) => (
          <path
            key={s.fromKm}
            d={`M${x(s.fromKm)},${CHART_H} L${x(s.fromKm)},${y(s.from)} L${x(s.toKm)},${y(s.to)} L${x(s.toKm)},${CHART_H} Z`}
            fill={gradeColor(s.grade)}
          />
        ))}
        <path
          d={parts.map((s, i) => `${i ? "" : `M${x(s.fromKm)},${y(s.from)} `}L${x(s.toKm)},${y(s.to)}`).join(" ")}
          className="climb-line"
        />
      </svg>
      {parts.map(
        (s, i) =>
          i % every === 0 && (
            <span key={s.fromKm} className="climb-grade" style={{ left: `${((x(s.fromKm) + x(s.toKm)) / 2 / CHART_W) * 100}%`, bottom: 4 }}>
              {Math.round(s.grade)}
            </span>
          ),
      )}
      </div>
      <div className="climb-axis">
        <span>
          km {km1(climb.start)} · {metres(climb.startElevation)}
        </span>
        <span>
          {metres(climb.topElevation)} · km {km1(climb.top)}
        </span>
      </div>
    </div>
  );
}

/** Where you are on the climb, if you're near it. */
function OnTheClimb({ stage, climb, riding }: { stage: Stage; climb: Climb; riding: Progress | undefined }) {
  if (!riding) return null;
  const scale = stage.distanceKm / routeLength(stage);
  const p = stage.profile;
  const at = (km: number) => p[Math.min(p.length - 1, Math.round(km / 0.5))];
  if (riding.km < climb.startKm) {
    return <p className="sheet-progress riding">Starts in {km1((climb.startKm - riding.km) * scale)} km</p>;
  }
  if (riding.km > climb.topKm) return <p className="sheet-progress">Done ✓</p>;
  return (
    <p className="sheet-progress riding">
      {km1((riding.km - climb.startKm) * scale)} km in · {km1((climb.topKm - riding.km) * scale)} km and {metres(Math.max(0, climb.topElevation - at(riding.km)))} to the top
    </p>
  );
}

/** A climb's page: its numbers, its gradient profile, and the way to the climbs either side. */
export function ClimbPage({ stage, climb, riding }: { stage: Stage; climb: Climb; riding: Progress | undefined }) {
  const all = climbs(stage);
  const before = all.find((c) => c.number === climb.number - 1);
  const after = all.find((c) => c.number === climb.number + 1);
  const stats = [
    ["Gain", `+${metres(climb.gainM)}`],
    ["Average", pct(climb.averageGrade)],
    ["Steepest km", pct(climb.steepestKm)],
    ["Length", `${km1(climb.lengthKm)} km`],
    ["Top", metres(climb.topElevation)],
    ["At the top", `~${etaAtKm(stage, climb.topKm)}`],
  ];
  return (
    <div className="climb-page">
      <div className="climb-nav">
        <button className="climb-back" onClick={() => openClimb(undefined)}>
          ‹ {stage.name}
        </button>
        <span>
          <button disabled={!before} onClick={() => before && openClimb(before.number)} aria-label="Previous climb">
            ‹
          </button>
          <button disabled={!after} onClick={() => after && openClimb(after.number)} aria-label="Next climb">
            ›
          </button>
        </span>
      </div>
      <OnTheClimb stage={stage} climb={climb} riding={riding} />
      <GradientChart stage={stage} climb={climb} />
      <div className="climb-scale" aria-label="Gradient colours">
        {GRADE_SCALE.map((g) => (
          <span key={g.label}>
            <i style={{ background: g.color }} />
            {g.label}
          </span>
        ))}
        <span className="climb-scale-unit">%</span>
      </div>
      <dl className="climb-stats">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
