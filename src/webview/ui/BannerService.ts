// src/webview/ui/BannerService.ts — Error/warning/info banner display
//
// Stateless DOM manipulation for displaying notification banners in the terminal container.
// Extracted from main.ts for modularity.

/** Auto-dismiss timeout for info-severity banners (ms). */
const INFO_BANNER_DISMISS_MS = 5000;

/**
 * Display an error/warning/info banner in the given container element.
 * Severity determines the background color: error=red, warn=amber, info=blue.
 * Info banners auto-dismiss after 5 seconds. All banners have a dismiss button.
 */
export function showBanner(container: HTMLElement, message: string, severity: "error" | "warn" | "info"): void {
  const banner = document.createElement("div");
  banner.className = `error-banner error-banner-${severity}`;

  const messageSpan = document.createElement("span");
  messageSpan.className = "error-banner-message";
  messageSpan.textContent = message;
  banner.appendChild(messageSpan);

  const dismissBtn = document.createElement("button");
  dismissBtn.className = "error-banner-dismiss";
  dismissBtn.textContent = "\u00d7"; // x
  dismissBtn.addEventListener("click", () => {
    banner.remove();
  });
  banner.appendChild(dismissBtn);

  container.insertBefore(banner, container.firstChild);

  // Auto-dismiss info banners after 5 seconds
  if (severity === "info") {
    setTimeout(() => {
      if (banner.parentElement) {
        banner.remove();
      }
    }, INFO_BANNER_DISMISS_MS);
  }
}
