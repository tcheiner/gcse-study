import en from "../../locales/en.json";

type Dict = { [k: string]: string | Dict };
const locales: Record<string, Dict> = { en };
let current: Dict = locales.en;

export function setLocale(code: string) {
  current = locales[code] ?? locales.en;
}

/** Look up a dotted key and fill {placeholders}. Returns the key itself if missing (visible in dev). */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const value = key.split(".").reduce<string | Dict | undefined>(
    (node, part) => (node && typeof node === "object" ? node[part] : undefined), current);
  if (typeof value !== "string") return key;
  return value.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
}

export function has(key: string): boolean {
  return t(key) !== key;
}
