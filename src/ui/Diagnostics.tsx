import { useEffect, useState } from "react";
import { standalone } from "../viewport";

/** Measures a CSS length by rendering it: how the browser resolves 100dvh, env(safe-area-inset-top), … */
function measure(css: string) {
  const probe = document.createElement("div");
  probe.style.cssText = `position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;height:${css}`;
  document.body.append(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return Math.round(px);
}

function readings() {
  const root = document.getElementById("root")!.getBoundingClientRect();
  return [
    ["Version", `${__COMMIT__} · ${__BUILT_AT__.slice(0, 16).replace("T", " ")} UTC`],
    ["Installed", `${standalone} (display-mode ${matchMedia("(display-mode: standalone)").matches}, navigator ${String((navigator as Navigator & { standalone?: boolean }).standalone)})`],
    ["Screen", `${screen.width} × ${screen.height} @${devicePixelRatio}x`],
    ["Window", `${innerWidth} × ${innerHeight}`],
    ["Visual viewport", `${Math.round(visualViewport?.width ?? 0)} × ${Math.round(visualViewport?.height ?? 0)}`],
    ["Document", `${document.documentElement.clientWidth} × ${document.documentElement.clientHeight}`],
    ["App box", `${Math.round(root.top)} → ${Math.round(root.bottom)} (${Math.round(root.height)})`],
    ["--app-height", getComputedStyle(document.documentElement).getPropertyValue("--app-height") || "unset"],
    ["100vh / dvh / svh / lvh", ["100vh", "100dvh", "100svh", "100lvh"].map(measure).join(" / ")],
    ["Safe area t / b", `${measure("env(safe-area-inset-top, 0px)")} / ${measure("env(safe-area-inset-bottom, 0px)")}`],
    ["System", navigator.userAgent.match(/(iPhone|iPad|Android)[^;)]*;?[^)]*/)?.[0] ?? navigator.platform],
  ];
}

/** Hidden: long-press the otomo pill. What the device says about its own size, for chasing layout bugs. */
export function Diagnostics({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState(readings);
  useEffect(() => {
    const update = () => setRows(readings());
    addEventListener("resize", update);
    return () => removeEventListener("resize", update);
  }, []);
  return (
    <aside className="legend diagnostics" aria-label="Diagnostics">
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <button className="install-button" onClick={onClose}>
        Close
      </button>
    </aside>
  );
}
