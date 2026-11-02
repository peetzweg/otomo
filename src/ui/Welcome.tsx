import { useState, type CSSProperties } from "react";
import { finishWelcome } from "./view";

const FEATURES = [
  {
    title: "Rain on your stage",
    text: "The Japan Meteorological Agency's radar, 250\u00a0m sharp and new every 5 minutes: the last 90 minutes and the next hour, on the route and on the climbs.",
  },
  { title: "Know the climbs", text: "Drag along the elevation profile and a marker shows where that top or valley is on the map." },
  { title: "Where you are", text: "Tap the arrow: your km, what's left to climb, and the next checkpoint." },
  { title: "Weather along the route", text: "Tap the sun: the forecast at the start, the checkpoints, the top and the finish, for when you'll be there." },
  { title: "Map, topo, satellite", text: "Switch under the layers button, whatever helps you read the road." },
];

/**
 * The first thing a rider sees, once: what Otomo means, what it does, and a send-off. Slides up like the
 * main sheet; its lines arrive one after another, so the eye reads them in order.
 */
export function Welcome() {
  const [leaving, setLeaving] = useState(false);
  return (
    <div className={`welcome${leaving ? " leaving" : ""}`}>
      <section className="welcome-sheet" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <img className="welcome-mascot" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
        <p className="welcome-event">Rad Race · Tour de Friends 9 · Japan</p>
        <h1 id="welcome-title" className="welcome-name">
          お供 <span>otomo</span>
        </h1>
        <p className="welcome-meaning">
          In Japanese, <b>otomo</b> is the companion you bring along on a journey. This one rides with you through Kyushu.
        </p>
        <ul className="welcome-features">
          {FEATURES.map((f, i) => (
            <li key={f.title} style={{ "--i": i } as CSSProperties}>
              <b>{f.title}</b>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
        <p className="welcome-wish">
          気をつけてね! Ride safe, look out for each other, and have the best days on the bike. 🚲
        </p>
        <button
          className="welcome-go"
          onClick={() => {
            setLeaving(true);
            // Gone once the slide-out (280 ms) is done; a timer, since with reduced motion nothing animates.
            setTimeout(finishWelcome, 300);
          }}

        >
          いってきます! <span>Let's ride</span>
        </button>
        <p className="welcome-note">Made by a rider, for the riders. Not an official Rad Race app.</p>
      </section>
    </div>
  );
}
