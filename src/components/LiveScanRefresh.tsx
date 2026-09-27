"use client";

import { useEffect } from "react";

const QUOTA_STORAGE_KEY = "cotescope.odds-quota.v1";
const MINUTE = 60 * 1000;

type QuotaSnapshot = {
  used?: number | null;
  remaining?: number | null;
};

function parisHour() {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  return Number(hour);
}

function quotaRatio() {
  try {
    const raw = window.localStorage.getItem(QUOTA_STORAGE_KEY);
    if (!raw) return 0;
    const quota = JSON.parse(raw) as QuotaSnapshot;
    const used = Number(quota.used);
    const remaining = Number(quota.remaining);
    const total = used + remaining;
    if (!Number.isFinite(used) || !Number.isFinite(remaining) || total <= 0) return 0;
    return used / total;
  } catch {
    return 0;
  }
}

function nextScanIntervalMs() {
  const hour = parisHour();
  const daytime = hour >= 8 || hour < 1;
  const ratio = quotaRatio();

  if (ratio >= 0.95) return null;
  if (ratio >= 0.85) return daytime ? 30 * MINUTE : 120 * MINUTE;
  if (ratio >= 0.70) return daytime ? 20 * MINUTE : 90 * MINUTE;
  return daytime ? 15 * MINUTE : 60 * MINUTE;
}

export default function LiveScanRefresh() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      const interval = nextScanIntervalMs();
      if (interval == null) return;

      timer = setTimeout(() => {
        if (document.visibilityState === "visible") {
          window.location.reload();
          return;
        }
        schedule();
      }, interval);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") schedule();
    };

    const onQuotaUpdate = () => schedule();

    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("storage", onQuotaUpdate);
    window.addEventListener("cotescope:quota", onQuotaUpdate);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("storage", onQuotaUpdate);
      window.removeEventListener("cotescope:quota", onQuotaUpdate);
    };
  }, []);

  return null;
}
