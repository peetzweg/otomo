import { useRef, useState } from "react";
import { css, LEVELS } from "./radar/jma";
import { followMe, locate, radar } from "./radar/radar";
import { useStore } from "./store";
import { LayersIcon, LegendIcon, LocateIcon } from "./ui/icons";
import { Diagnostics } from "./ui/Diagnostics";
import { InstallHint } from "./ui/InstallHint";
import { RadarMap } from "./ui/RadarMap";
import { Sheet } from "./ui/Sheet";
import { BASES, openFarewell, setBase, view } from "./ui/view";
import { Farewell } from "./ui/Farewell";
import { Welcome } from "./ui/Welcome";

export function App() {
  const [panel, setPanel] = useState<"legend" | "layers" | "diagnostics">();
  const toggle = (name: "legend" | "layers") => setPanel(panel === name ? undefined : name);
  const press = useRef<number>(undefined);
  const longPressed = useRef(false);
  // Pressed state by hand: iOS doesn't reliably apply :active on touch.
  const [pressed, setPressed] = useState(false);
  const release = () => {
    clearTimeout(press.current);
    setPressed(false);
  };
  const locating = useStore(radar, (s) => s.locating);
  const stage = useStore(radar, (s) => s.stage);
  const tracking = useStore(radar, (s) => s.tracking);
  const welcomed = useStore(view, (s) => s.welcomed);
  const farewell = useStore(view, (s) => s.farewell);

  return (
    <>
      <RadarMap />
      <header className="topbar">
        {/* The whole pill: a tap brings back the farewell (its thanks and the way to support);
            a long-press opens the diagnostics instead. */}
        <button
          className="pill brand"
          data-pressed={pressed || undefined}
          onPointerDown={() => {
            setPressed(true);
            longPressed.current = false;
            press.current = window.setTimeout(() => {
              longPressed.current = true;
              setPressed(false);
              setPanel("diagnostics");
            }, 700);
          }}
          onPointerUp={release}
          onPointerLeave={release}
          onPointerCancel={release}
          onClick={() => (longPressed.current ? (longPressed.current = false) : openFarewell())}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Otomo: thanks, and support it on Ko-fi"
        >
          <img className="brand-mascot" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          <span className="brand-name">otomo</span>
          <img className="brand-kofi" src={`${import.meta.env.BASE_URL}kofi/cup.png`} alt="" />
        </button>
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
      {welcomed && !farewell && !panel && <InstallHint />}
      {panel === "legend" && <Legend />}
      {panel === "layers" && <Layers onPick={() => setPanel(undefined)} />}
      {panel === "diagnostics" && <Diagnostics onClose={() => setPanel(undefined)} />}
      <Sheet />
      {/* After the tour, the farewell instead of the welcome. */}
      {farewell ? <Farewell /> : !welcomed && <Welcome />}
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
