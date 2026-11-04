"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { appConfig } from "@/config/app";
import { api, ApiError, type SessionStatus } from "@/lib/api";
import { tickNow, useNow } from "@/lib/clock";

interface KeyState {
  status: SessionStatus;
  minutesLeft: number | null;     // minutes until the key is forgotten (whichever deadline is first)
  dialogOpen: boolean;
  openDialog: (onReady?: () => void) => void;
  closeDialog: () => void;
  add: (apiKey: string) => Promise<void>;
  forget: () => Promise<void>;
  refresh: () => Promise<void>;
}

const inactive: SessionStatus = { active: false, idle_expires_at: null, absolute_expires_at: null };
const Ctx = createContext<KeyState | null>(null);

export function KeyProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(inactive);
  const now = useNow(appConfig.keyTickMs);
  const [dialogOpen, setDialogOpen] = useState(false);
  const onReady = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    try { setStatus(await api.session()); } catch { setStatus(inactive); }
  }, []);

  useEffect(() => {
    let alive = true;
    api.session().then((s) => { if (alive) setStatus(s); }, () => {});
    return () => { alive = false; };
  }, []);

  const deadline = status.active && status.idle_expires_at && status.absolute_expires_at
    ? Math.min(status.idle_expires_at, status.absolute_expires_at) : null;
  const expired = deadline !== null && now > 0 && deadline <= now;

  const value = useMemo<KeyState>(() => ({
    status: expired ? inactive : status,
    minutesLeft: deadline && now > 0 && !expired ? Math.floor((deadline - now) / 60) : null,
    dialogOpen,
    openDialog: (cb) => { onReady.current = cb ?? null; setDialogOpen(true); },
    closeDialog: () => { onReady.current = null; setDialogOpen(false); },
    add: async (apiKey) => {
      const s = await api.addKey(apiKey);   // throws ApiError on a bad key
      setStatus(s);
      tickNow();
      setDialogOpen(false);
      const cb = onReady.current; onReady.current = null; cb?.();
    },
    forget: async () => {
      try { await api.forgetKey(); } catch (e) { if (!(e instanceof ApiError)) throw e; }
      setStatus(inactive);
    },
    refresh,
  }), [status, expired, deadline, now, dialogOpen, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useKey(): KeyState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useKey must be used inside <KeyProvider>");
  return v;
}
