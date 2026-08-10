import { z } from "zod";

export const appSettingsSchema = z.object({
  schemaVersion: z.literal(1),
  theme: z.enum(["light", "dark", "system"]),
  provider: z.object({
    baseUrl: z.string(),
    model: z.string(),
    rememberKey: z.boolean(),
  }),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 1,
  theme: "system",
  provider: {
    baseUrl: "https://api.openai.com/v1",
    model: "",
    rememberKey: false,
  },
};

const SETTINGS_KEY = "learnsphere.settings.v1";
const SESSION_API_KEY = "learnsphere.api-key.session";
const PERSISTED_API_KEY = "learnsphere.api-key.remembered";

export function loadAppSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_APP_SETTINGS;

  try {
    const rawSettings = window.localStorage.getItem(SETTINGS_KEY);
    if (!rawSettings) return DEFAULT_APP_SETTINGS;
    return appSettingsSchema.parse(JSON.parse(rawSettings));
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveAppSettings(settings: AppSettings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettingsSchema.parse(settings)));
}

export function loadApiKey() {
  if (typeof window === "undefined") return "";
  return (
    window.sessionStorage.getItem(SESSION_API_KEY) ??
    window.localStorage.getItem(PERSISTED_API_KEY) ??
    ""
  );
}

export function saveApiKey(apiKey: string, rememberKey: boolean) {
  const normalizedKey = apiKey.trim();
  window.sessionStorage.removeItem(SESSION_API_KEY);
  window.localStorage.removeItem(PERSISTED_API_KEY);

  if (!normalizedKey) return;

  const storage = rememberKey ? window.localStorage : window.sessionStorage;
  storage.setItem(rememberKey ? PERSISTED_API_KEY : SESSION_API_KEY, normalizedKey);
}

export function clearApiKey() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SESSION_API_KEY);
  window.localStorage.removeItem(PERSISTED_API_KEY);
}
