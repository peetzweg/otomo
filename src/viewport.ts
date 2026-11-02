/**
 * Installed on an iPhone, the app should fill the screen edge to edge. iOS doesn't always agree: with a
 * translucent status bar the viewport (and, on some versions, the viewport units too) can come out
 * shorter than the screen, leaving an empty black strip at the bottom. Installed and full screen, the
 * screen's own height is the one number that's always right, so the app takes that.
 */
export const standalone =
  matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function fit() {
  const root = document.documentElement;
  const portrait = matchMedia("(orientation: portrait)").matches;
  const [short, long] = [Math.min(screen.width, screen.height), Math.max(screen.width, screen.height)];
  // Only when the app has the whole screen: an iPad window in split view is narrower than the screen.
  const fullScreen = Math.abs(innerWidth - (portrait ? short : long)) <= 2;
  if (!standalone || !fullScreen) return root.style.removeProperty("--app-height");
  root.style.setProperty("--app-height", `${Math.max(innerHeight, portrait ? long : short)}px`);
}

document.documentElement.classList.toggle("standalone", standalone);
fit();
addEventListener("resize", fit);
screen.orientation?.addEventListener("change", fit);
