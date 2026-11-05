// App-wide configuration. No user-facing text here (see locales/).
export const appConfig = {
  /** Browser-facing path prefix; next.config.ts rewrites it to the subject backend. */
  apiPaths: { english: "/api/english" },
  /** Default backend for local dev when ENGLISH_API_URL is unset. */
  defaultEnglishApiUrl: "http://127.0.0.1:8000",
  /** Optional timer targets in minutes; 0 = no limit. */
  timerTargets: [0, 30, 45, 60],
  defaultTimerTarget: 45,
  /** Composition (Cambridge 0990 Paper 2 Section B) is marked out of 40. */
  defaultTariff: 40,
  /** Marking runs as a background job; the page checks this often (ms) and gives up after maxWaitMs. */
  jobs: { pollMs: 2000, maxWaitMs: 5 * 60_000 },
  /** How often the key indicator re-checks its countdown (ms). */
  keyTickMs: 15_000,
  /** Mirrors backends/english/config/settings.yaml `session` (display only; the server enforces). */
  keySession: { idleMinutes: 20, absoluteMinutes: 120 },
  /** Where students create a Claude key. */
  claudeConsoleUrl: "https://platform.claude.com/settings/keys",
} as const;
