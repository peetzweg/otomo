import { useState } from "react";
import { css, LEVELS } from "./radar/jma";
import { locate, NOW_INDEX, radar } from "./radar/radar";
import { clock } from "./radar/summary";
import { useStore } from "./store";
import { LegendIcon, LocateIcon } from "./ui/icons";
import { RadarMap } from "./ui/RadarMap";
import { Sheet } from "./ui/Sheet";

export function App() {
  const [legend, setLegend] = useState(false);
  const locating = useStore(radar, (s) => s.locating);
  const updated = useStore(radar, (s) => s.frames[NOW_INDEX]?.time);

  return (
    <>
      <RadarMap />
      <header className="topbar">
        <div className="pill brand">
          <span className="brand-name">ameblitz</span>
          {updated && <span className="brand-updated">Radar {clock(updated)}</span>}
        </div>
        <div className="actions">
          <button className={`round${legend ? " on" : ""}`} onClick={() => setLegend(!legend)} aria-label="Legend" aria-pressed={legend}>
            <LegendIcon />
          </button>
          <button className={`round${locating ? " busy" : ""}`} onClick={() => locate()} aria-label="Rain at my location">
            <LocateIcon />
          </button>
        </div>
      </header>
      {legend && <Legend />}
      <Sheet />
    </>
  );
}

function Legend() {
  return (
    <aside className="legend" aria-label="Rain intensity in millimetres per hour">
      <div className="legend-ramp">
        {LEVELS.slice(1).map((level) => (
          <span key={level.from + level.word} style={{ background: css(level.color, 1) }} title={level.word} />
        ))}
      </div>
      <div className="legend-steps">
        <span />
        {LEVELS.slice(2).map((level) => (
          <span key={level.from}>{level.from}</span>
        ))}
      </div>
      <p className="legend-unit">mm/h · tap the map to check a spot</p>
      <p className="legend-unit">
        Radar: <a href="https://www.jma.go.jp/bosai/nowc/">気象庁 高解像度降水ナウキャスト</a>, recoloured
      </p>
    </aside>
  );
}
