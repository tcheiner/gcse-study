"use client";

import { useSyncExternalStore } from "react";

// A shared, ticking "now" (epoch seconds). 0 on the server and before the first tick,
// so components never read the clock during render (required by Cache Components).
let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  now = Date.now() / 1000;
  listeners.forEach((l) => l());
}

function subscribe(intervalMs: number) {
  return (listener: () => void) => {
    listeners.add(listener);
    if (!timer) { timer = setInterval(tick, intervalMs); queueMicrotask(tick); }
    return () => {
      listeners.delete(listener);
      if (!listeners.size && timer) { clearInterval(timer); timer = null; }
    };
  };
}

export function useNow(intervalMs: number): number {
  return useSyncExternalStore(subscribe(intervalMs), () => now, () => 0);
}

/** Force an immediate tick (e.g. right after a key is added). */
export function tickNow() { tick(); }
