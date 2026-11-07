import { useState, type CSSProperties } from "react";
import { STAGES } from "../stages/stages";
import { finishFarewell } from "./view";

/** The whole tour in numbers, from the app's own data. */
function tourInNumbers() {
  const km = STAGES.reduce((sum, s) => sum + s.distanceKm, 0);
  const climbed = STAGES.reduce((sum, s) => sum + s.climbM, 0);
  return [
    { value: String(STAGES.length), label: "stages" },
    { value: km.toFixed(1), label: "km" },
    { value: climbed.toLocaleString("en-US"), label: "m climbed" },
  ];
}

/** Shown once after the last stage: well done, what's next, and thanks. Built like the welcome sheet. */
export function Farewell() {
  const [leaving, setLeaving] = useState(false);
  return (
    <div className={`welcome${leaving ? " leaving" : ""}`}>
      <section className="welcome-sheet farewell" role="dialog" aria-modal="true" aria-labelledby="farewell-title">
        <header className="farewell-head">
          <img className="farewell-mascot" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          <div>
            <p className="farewell-event">Rad Race · Tour de Friends 9</p>
            <h1 id="farewell-title" className="farewell-title">
              Well done!
            </h1>
          </div>
        </header>
        <p className="farewell-text">
          Tour de Friends 9 is over. I hope you enjoyed riding with <b>Otomo</b>.
        </p>
        <ul className="farewell-numbers">
          {tourInNumbers().map((n, i) => (
            <li key={n.label} style={{ "--i": i } as CSSProperties}>
              <b>{n.value}</b>
              <span>{n.label}</span>
            </li>
          ))}
        </ul>
        {/* The news: the reason to keep it on the Home Screen. */}
        <p className="farewell-news">
          Otomo is just starting. I plan on making it available for <b>your own routes</b>!
          <span>Keep Otomo on your Home Screen: it updates itself, and the news will show up right here.</span>
        </p>
        <p className="farewell-text">
          Got an idea for it? Write to <a href="mailto:phil.czek@gmail.com">phil.czek@gmail.com</a>, or tell me on the bus.
        </p>
        <p className="farewell-text farewell-wish">Have a safe trip home, or enjoy the rest of your holidays in Japan.</p>
        <p className="farewell-signature">— Philip</p>
        <div className="farewell-kofi">
          <span>Enjoyed Otomo and want to support me?</span>
          <a href="https://ko-fi.com/peetzweg" target="_blank" rel="noopener">
            <img src={`${import.meta.env.BASE_URL}kofi/support_me_on_kofi_beige.png`} alt="Support me on Ko-fi" />
          </a>
        </div>
        <button
          className="welcome-go"
          onClick={() => {
            setLeaving(true);
            // Gone once the slide-out (280 ms) is done; a timer, since with reduced motion nothing animates.
            setTimeout(finishFarewell, 300);
          }}
        >
          See you!
        </button>
      </section>
    </div>
  );
}
