import { routeLength, type Stage } from "../stages/stages";
import { tunnelLength, tunnels } from "../stages/tunnels";

/** Under the profile: a dark bar for each tunnel, as long as the tunnel. */
export function TunnelStrip({ stage }: { stage: Stage }) {
  const length = routeLength(stage);
  return (
    <div className="tunnel-strip" aria-hidden="true">
      {tunnels(stage).map((t) => (
        <i key={t.fromKm} style={{ left: `${(t.fromKm / length) * 100}%`, width: `max(2px, ${((t.toKm - t.fromKm) / length) * 100}%)` }} />
      ))}
    </div>
  );
}

/** In the full sheet: every tunnel along the stage, in route order. */
export function TunnelSection({ stage }: { stage: Stage }) {
  const all = tunnels(stage);
  const total = all.reduce((sum, t) => sum + t.lengthM, 0);
  return (
    <div className="tunnels">
      <h2 className="wx-title">Tunnels</h2>
      <p className="wx-caption">
        {all.length
          ? `${all.length} tunnel${all.length > 1 ? "s" : ""}, ${tunnelLength(total)} in all, from OpenStreetMap. Lights on, and expect it to be cool and damp inside.`
          : "No tunnels on this stage, as far as OpenStreetMap knows."}
      </p>
      {all.length > 0 && (
        <ol className="wx-list">
          {all.map((t) => (
            <li key={t.fromKm} className="wx-row tunnel-row">
              <span className="wx-time">km {Math.round(t.from)}</span>
              <img className="konbini-logo" src={`${import.meta.env.BASE_URL}tunnel.png`} alt="" />
              <span className="wx-place">
                <b>{t.name || "Tunnel"}</b>
              </span>
              <span className="wx-temp">
                <b>{tunnelLength(t.lengthM)}</b>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
