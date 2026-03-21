// @vitest-environment jsdom
// src/webview/ui/BannerService.test.ts — Unit tests for BannerService

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showBanner } from "./BannerService";

// ─── Setup ──────────────────────────────────────────────────────────

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

// ─── Tests ──────────────────────────────────────────────────────────

describe("showBanner", () => {
  it("creates a banner with correct DOM structure", () => {
    showBanner(container, "Something went wrong", "error");

    const banner = container.querySelector(".error-banner");
    expect(banner).not.toBeNull();
    expect(banner?.classList.contains("error-banner-error")).toBe(true);

    const message = banner?.querySelector(".error-banner-message");
    expect(message?.textContent).toBe("Something went wrong");

    const dismiss = banner?.querySelector(".error-banner-dismiss");
    expect(dismiss).not.toBeNull();
    expect(dismiss?.textContent).toBe("\u00d7");
  });

  it("inserts banner as the first child of the container", () => {
    const existing = document.createElement("div");
    existing.className = "existing";
    container.appendChild(existing);

    showBanner(container, "test", "warn");

    expect(container.firstElementChild?.classList.contains("error-banner")).toBe(true);
    expect(container.children.length).toBe(2);
  });

  it("removes banner when dismiss button is clicked", () => {
    showBanner(container, "dismiss me", "error");

    const dismiss = container.querySelector(".error-banner-dismiss") as HTMLElement;
    expect(dismiss).not.toBeNull();
    dismiss.click();

    expect(container.querySelector(".error-banner")).toBeNull();
  });

  it("auto-dismisses info banners after 5000ms", () => {
    showBanner(container, "info message", "info");
    expect(container.querySelector(".error-banner")).not.toBeNull();

    vi.advanceTimersByTime(4999);
    expect(container.querySelector(".error-banner")).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(container.querySelector(".error-banner")).toBeNull();
  });

  it("does NOT auto-dismiss error or warn banners", () => {
    showBanner(container, "error stays", "error");
    showBanner(container, "warn stays", "warn");

    vi.advanceTimersByTime(10000);

    const banners = container.querySelectorAll(".error-banner");
    expect(banners.length).toBe(2);
  });

  it("applies correct severity CSS class for each severity", () => {
    const severities = ["error", "warn", "info"] as const;
    for (const severity of severities) {
      const c = document.createElement("div");
      showBanner(c, `${severity} message`, severity);
      const banner = c.querySelector(".error-banner");
      expect(banner?.classList.contains(`error-banner-${severity}`)).toBe(true);
    }
  });
});
