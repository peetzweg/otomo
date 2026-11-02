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
