import { registerSW } from "virtual:pwa-register";

/** How long after a fresh start a found update may still reload the app, if you haven't touched it yet. */
const LAUNCH_WINDOW_MS = 15_000;
const launchedAt = performance.now();
let touched = false;
for (const type of ["pointerdown", "keydown"]) {
  window.addEventListener(type, () => (touched = true), { capture: true, once: true });
}

/**
 * As in bookblitz: an update is swapped in only right after a fresh start, before you've touched
 * anything. Otherwise it waits for the next time the system restarts the app.
 */
const updateServiceWorker = registerSW({
  onNeedRefresh() {
    if (performance.now() - launchedAt < LAUNCH_WINDOW_MS && !touched) updateServiceWorker(true);
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && navigator.onLine) registration.update().catch(() => {});
    });
  },
});
