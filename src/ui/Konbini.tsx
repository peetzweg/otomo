import { BRAND_COLORS, brandIcon, BRANDS, gaps, konbini, NEAR_M, type Konbini } from "../stages/konbini";
import { routeLength, type Stage } from "../stages/stages";

/** Under the profile: a tick per store, in its chain's colour. Where they thin out shows at a glance. */
export function KonbiniTicks({ stage }: { stage: Stage }) {
  const length = routeLength(stage);
  return (
    <div className="konbini-ticks" aria-hidden="true">
      {konbini(stage).map((s, i) => (
        <i key={i} style={{ left: `${(s.routeKm / length) * 100}%`, background: BRAND_COLORS[s.brand] }} />
      ))}
    </div>
  );
}

const Logo = ({ brand }: { brand: Konbini["brand"] }) => <img className="konbini-logo" src={brandIcon(brand)} alt="" />;

const where = (s: Konbini | undefined, fallback: string) => (s ? `${s.brand} at km ${Math.round(s.km)}` : fallback);

/** In the full sheet: how many there are, and the long stretches without one. */
export function KonbiniSection({ stage }: { stage: Stage }) {
  const stores = konbini(stage);
  const long = gaps(stage).slice(0, 3);
  return (
    <div className="konbini">
      <h2 className="wx-title">Konbini</h2>
      <p className="wx-caption">
        7-Eleven, FamilyMart and Lawson within {NEAR_M} m of the route, from OpenStreetMap: it can miss the odd store, so
        treat a gap as "probably nothing".
      </p>
      <div className="konbini-counts">
        {BRANDS.map((brand) => (
          <span key={brand}>
            <Logo brand={brand} />
            {brand} <b>{stores.filter((s) => s.brand === brand).length}</b>
          </span>
        ))}
      </div>
      {long.length > 0 && (
        <ol className="wx-list">
          {long.map((g) => (
            <li key={g.from} className="wx-row konbini-gap">
              <span className="wx-time">{Math.round(g.length)} km</span>
              <span className="wx-place">
                <b>
                  Nothing from km {Math.round(g.from)} to {Math.round(g.to)}
                </b>
                <small>
                  Stock up at the {where(g.before, "start")}; next: {where(g.after, "the finish")}
                </small>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
