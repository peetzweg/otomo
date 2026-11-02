import { dismissInstallHint, isIosSafari, promptInstall, usePwa } from "../pwa";
import { ShareIcon } from "./icons";

/**
 * Suggests putting Otomo on the Home Screen: full screen, one tap away mid-ride. Android and desktop
 * Chrome get a real install button; iOS only has Share > Add to Home Screen, so it gets the steps.
 * Never shown once installed, or where neither is possible.
 */
export function InstallHint() {
  const installed = usePwa((s) => s.installed);
  const canPrompt = usePwa((s) => s.canPrompt);
  const dismissed = usePwa((s) => s.hintDismissed);
  if (installed || dismissed || (!canPrompt && !isIosSafari)) return null;

  return (
    <aside className="install">
      <img className="install-icon" src={`${import.meta.env.BASE_URL}apple-touch-icon-180x180.png`} alt="" />
      <div className="install-body">
        <p className="install-title">Add Otomo to your Home Screen</p>
        {canPrompt ? (
          <p className="install-text">Opens full screen, one tap away on the road.</p>
        ) : (
          <p className="install-text">
            Tap <ShareIcon /> Share, then <b>Add to Home Screen</b>.
          </p>
        )}
      </div>
      {canPrompt && (
        <button className="install-button" onClick={promptInstall}>
          Install
        </button>
      )}
      <button className="install-close" aria-label="Dismiss" onClick={dismissInstallHint}>
        ×
      </button>
    </aside>
  );
}
