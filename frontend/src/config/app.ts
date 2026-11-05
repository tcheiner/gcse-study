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
  /** Sample compositions for "Fill with a sample", in order (text in locales/en.json `samples`). */
  sampleIds: ["descriptive", "narrative"],
  /** How often the key indicator re-checks its countdown (ms). */
  keyTickMs: 15_000,
  /** Mirrors backends/english/config/settings.yaml `session` (display only; the server enforces). */
  keySession: { idleMinutes: 20, absoluteMinutes: 120 },
  /** Shown in the site and print footers (a constant: the clock must not be read during render). */
  copyrightYear: 2026,
  /** Where students create a Claude key. */
  claudeConsoleUrl: "https://platform.claude.com/settings/keys",
  /** Steps in the "How do I get a key?" popover; text lives in locales under key.help.steps / key.help.links. */
  keyHelpSteps: [
    { id: "signup", url: "https://platform.claude.com/" },
    { id: "credit", url: "https://platform.claude.com/settings/billing" },
    { id: "limit", url: "https://platform.claude.com/settings/limits" },
    { id: "create", url: "https://platform.claude.com/settings/keys" },
    { id: "copy" },
    { id: "paste" },
  ],
} as const;
