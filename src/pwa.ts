import { registerSW } from "virtual:pwa-register";
import { createStore, useStore } from "./store";

/** The browser's install prompt (Chrome, Edge, Android); not in the DOM typings yet. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const standalone = () =>
  matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const HINT_KEY = "otomo.installHintDismissed";

const pwa = createStore({
  /** Running from the home screen rather than in a browser tab. */
  installed: standalone(),
  /** Chrome/Android offered an install prompt we can show on our own button. */
  canPrompt: false,
  hintDismissed: localStorage.getItem(HINT_KEY) === "1",
});
export const usePwa = <S>(selector: (state: ReturnType<typeof pwa.get>) => S) => useStore(pwa, selector);

/**
 * iOS has no install prompt, only Share > Add to Home Screen. `navigator.standalone` exists only in
 * iOS Safari, which makes it a capability check rather than user-agent sniffing.
 */
export const isIosSafari = "standalone" in navigator;

let installPrompt: InstallPromptEvent | undefined;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event as InstallPromptEvent;
  pwa.set({ canPrompt: true });
});

window.addEventListener("appinstalled", () => {
  installPrompt = undefined;
  pwa.set({ installed: true, canPrompt: false });
});

export async function promptInstall() {
  if (!installPrompt) return;
  await installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = undefined;
  pwa.set({ canPrompt: false, installed: outcome === "accepted" });
}

export function dismissInstallHint() {
  localStorage.setItem(HINT_KEY, "1");
  pwa.set({ hintDismissed: true });
}

/*
 * Updates. Most people never really quit a Home Screen app, so waiting for a fresh start isn't enough;
 * coming back after a while counts as one too. The rule: a new version is swapped in only at a moment
 * that already feels like the app (re)opening, never under your finger.
 *
 * - Look for one on launch, every hour while open, and on coming back after AWAY_MS or more.
 * - Swap it in on coming back after AWAY_MS, before you've touched anything; or, if it only turns up in
 *   the first SETTLE_MS of a (re)start, as long as you still haven't. Otherwise it waits for the next.
 * - A force quit still does it too: the next launch starts on the new version.
 */

/** Away this long (in the background, screen off), coming back is treated like opening the app. */
const AWAY_MS = 10 * 60_000;
/** How long after a (re)start a found update may still reload the app, if you haven't touched it. */
const SETTLE_MS = 15_000;
const CHECK_EVERY_MS = 60 * 60_000;

let startedAt = performance.now();
let touched = false;
let ready = false;
let hiddenAt: number | undefined;
for (const type of ["pointerdown", "keydown"]) {
  window.addEventListener(type, () => (touched = true), { capture: true });
}
const settling = () => !touched && performance.now() - startedAt < SETTLE_MS;

const updateServiceWorker = registerSW({
  onNeedRefresh() {
    ready = true;
    if (settling()) updateServiceWorker(true);
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => navigator.onLine && registration.update().catch(() => {});
    setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt === undefined || Date.now() - hiddenAt < AWAY_MS) return;
      // Back after a while: as good as a fresh start.
      startedAt = performance.now();
      touched = false;
      if (ready) updateServiceWorker(true);
      else check();
    });
  },
});
