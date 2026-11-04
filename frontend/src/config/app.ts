// App-wide configuration. No user-facing text here (see locales/).
export const appConfig = {
  /** Browser-facing path prefix; next.config.ts rewrites it to the subject backend. */
  apiPaths: { english: "/api/english" },
  /** Default backend for local dev when ENGLISH_API_URL is unset. */
  defaultEnglishApiUrl: "http://127.0.0.1:8000",
  /** Optional timer targets in minutes; 0 = no limit. */
  timerTargets: [0, 10, 15, 20, 30],
  defaultTimerTarget: 15,
  defaultTariff: 12,
  /** How often the key indicator re-checks its countdown (ms). */
  keyTickMs: 15_000,
  /** Mirrors backends/english/config/settings.yaml `session` (display only; the server enforces). */
  keySession: { idleMinutes: 20, absoluteMinutes: 120 },
  /** Where students create a Claude key. */
  claudeConsoleUrl: "https://platform.claude.com/settings/keys",
} as const;
