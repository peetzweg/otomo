import { useState } from "react";
import { css, LEVELS } from "./radar/jma";
import { followMe, locate, NOW_INDEX, radar } from "./radar/radar";
import { clock } from "./radar/summary";
import { useStore } from "./store";
import { LayersIcon, LegendIcon, LocateIcon } from "./ui/icons";
import { InstallHint } from "./ui/InstallHint";
import { RadarMap } from "./ui/RadarMap";
import { Sheet } from "./ui/Sheet";
import { BASES, setBase, view } from "./ui/view";
import { Welcome } from "./ui/Welcome";

export function App() {
  const [panel, setPanel] = useState<"legend" | "layers">();
  const toggle = (name: "legend" | "layers") => setPanel(panel === name ? undefined : name);
  const locating = useStore(radar, (s) => s.locating);
  const stage = useStore(radar, (s) => s.stage);
  const tracking = useStore(radar, (s) => s.tracking);
  const updated = useStore(radar, (s) => s.frames[NOW_INDEX]?.time);
  const welcomed = useStore(view, (s) => s.welcomed);

  return (
    <>
      <RadarMap />
      <header className="topbar">
        <div className="pill brand">
          <img className="brand-mascot" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          <span className="brand-name">otomo</span>
          {updated && <span className="brand-updated">Radar {clock(updated)}</span>}
        </div>
        <div className="actions">
          <button className={`round${panel === "layers" ? " on" : ""}`} onClick={() => toggle("layers")} aria-label="Map style" aria-pressed={panel === "layers"}>
            <LayersIcon />
          </button>
          <button className={`round${panel === "legend" ? " on" : ""}`} onClick={() => toggle("legend")} aria-label="Legend" aria-pressed={panel === "legend"}>
            <LegendIcon />
          </button>
          <button
            className={`round${locating ? " busy" : ""}${tracking ? " on" : ""}`}
            // On a stage, follow along it; otherwise check the rain where you are.
            onClick={() => (stage ? followMe() : locate())}
            aria-label={stage ? "Follow my position along the stage" : "Rain at my location"}
          >
            <LocateIcon />
          </button>
        </div>
      </header>
      {/* One thing at a time: the welcome first, then the install hint. */}
      {welcomed && !panel && <InstallHint />}
      {panel === "legend" && <Legend />}
      {panel === "layers" && <Layers onPick={() => setPanel(undefined)} />}
      <Sheet />
      {!welcomed && <Welcome />}
    </>
  );
}

function Layers({ onPick }: { onPick: () => void }) {
  const base = useStore(view, (s) => s.base);
  return (
    <aside className="legend layers" aria-label="Map style">
      <div className="layers-options" role="radiogroup">
        {BASES.map((option) => (
          <button
            key={option.id}
            role="radio"
            aria-checked={base === option.id}
            className={`layers-option layers-${option.id}`}
            onClick={() => {
              setBase(option.id);
              onPick();
            }}
          >
            {/* Each style over Sakurajima, rendered from the app itself (scripts/layers/render.mjs). */}
            <picture className="layers-swatch">
              <source srcSet={`${import.meta.env.BASE_URL}layers/${option.id}-dark.jpg`} media="(prefers-color-scheme: dark)" />
              <img src={`${import.meta.env.BASE_URL}layers/${option.id}-light.jpg`} alt="" />
            </picture>
            {option.label}
          </button>
        ))}
      </div>
      <p className="legend-unit">Satellite: 国土地理院 (GSI), Japan only</p>
    </aside>
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
