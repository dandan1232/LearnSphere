import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_APP_SETTINGS,
  loadApiKey,
  loadAppSettings,
  saveApiKey,
  saveAppSettings,
} from "@/lib/storage/settings";

describe("browser settings", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("falls back safely when saved settings are malformed", () => {
    localStorage.setItem("learnsphere.settings.v1", "not-json");
    expect(loadAppSettings()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("keeps an API key in the current session by default", () => {
    saveApiKey("  session-secret  ", false);
    expect(loadApiKey()).toBe("session-secret");
    expect(localStorage.getItem("learnsphere.api-key.remembered")).toBeNull();
  });

  it("persists only the non-secret provider settings", () => {
    saveAppSettings({
      ...DEFAULT_APP_SETTINGS,
      theme: "dark",
      provider: {
        baseUrl: "https://example.com/v1",
        model: "example-model",
        rememberKey: true,
      },
    });

    const rawSettings = localStorage.getItem("learnsphere.settings.v1") ?? "";
    expect(rawSettings).not.toContain("secret");
    expect(loadAppSettings().theme).toBe("dark");
  });
});
