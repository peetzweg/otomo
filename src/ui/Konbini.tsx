import { BRAND_COLORS, brandIcon, BRANDS, konbini, NEAR_M, type Konbini } from "../stages/konbini";
import type { Stage } from "../stages/stages";
import { across, inside, type Span } from "./span";

/** Under the profile: a tick per store, in its chain's colour. Where they thin out shows at a glance. */
export function KonbiniTicks({ stage, span }: { stage: Stage; span: Span }) {
  return (
    <div className="konbini-ticks" aria-hidden="true">
      {konbini(stage).map(
        (s, i) => inside(span, s.routeKm) && <i key={i} style={{ left: `${across(span, s.routeKm) * 100}%`, background: BRAND_COLORS[s.brand] }} />,
      )}
    </div>
  );
}

const Logo = ({ brand }: { brand: Konbini["brand"] }) => <img className="konbini-logo" src={brandIcon(brand)} alt="" />;

/** The branch's own name, when it says more than the chain's ("ローソン 霧島国分店", not just "Lawson"). */
function branch(store: Konbini) {
  const rest = store.name.replace(/セブン-?イレブン|7-?eleven|ファミリーマート|familymart|ローソン|lawson/gi, "").trim();
  return rest ? store.name : "";
}

/** In the full sheet: every store along the stage, in route order. */
export function KonbiniSection({ stage }: { stage: Stage }) {
  const stores = konbini(stage);
  return (
    <div className="konbini">
      <h2 className="wx-title">Konbini</h2>
      <p className="wx-caption">
        7-Eleven, FamilyMart and Lawson within {NEAR_M} m of the route, from OpenStreetMap: it can miss the odd store.
      </p>
      <div className="konbini-counts">
        {BRANDS.map((brand) => (
          <span key={brand}>
            <Logo brand={brand} />
            {brand} <b>{stores.filter((s) => s.brand === brand).length}</b>
          </span>
        ))}
      </div>
      {stores.length ? (
        <ol className="wx-list konbini-list">
          {stores.map((s, i) => (
            <li key={i} className="wx-row konbini-row">
              <span className="wx-time">km {Math.round(s.km)}</span>
              <Logo brand={s.brand} />
              <span className="wx-place">
                <b>{s.brand}</b>
                {branch(s) && <small>{branch(s)}</small>}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="wx-caption">None found along this stage.</p>
      )}
    </div>
  );
}
