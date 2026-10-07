"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { mergeBets, normalizeBets, type Bet } from "@/lib/journal";

const STORAGE = "cotescope.bet-history.v1";
const KEY = "cotescope.tracker-sync-key.v1";
const DELETIONS = "cotescope.tracker-deletions.v1";
export function useJournal() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cloud, setCloud] = useState("local");
  const [cloudError, setCloudError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [key, setKey] = useState("");
  const current = useRef<Bet[]>([]);
  const deleted = useRef<string[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const persist = useCallback((next: Bet[]) => {
    current.current = next;
    setBets(next);
    try {
      localStorage.setItem(STORAGE, JSON.stringify(next));
      localStorage.setItem(DELETIONS, JSON.stringify(deleted.current));
    } catch {
      setStorageError(true);
    }
  }, []);

  useEffect(() => {
    try {
      const local = normalizeBets(
        JSON.parse(localStorage.getItem(STORAGE) || "[]"),
      );
      current.current = local;
      setBets(local);
      const pending: unknown = JSON.parse(
        localStorage.getItem(DELETIONS) || "[]",
      );
      deleted.current = Array.isArray(pending)
        ? pending.filter((v): v is string => typeof v === "string")
        : [];
      let token = localStorage.getItem(KEY) || "";
      if (!/^[a-f0-9]{64}$/i.test(token)) {
        token = [...crypto.getRandomValues(new Uint8Array(32))]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
        localStorage.setItem(KEY, token);
      }
      setKey(token);
    } catch {
      setStorageError(true);
    }
    setLoaded(true);
  }, []);

  const sync = useCallback(async () => {
    if (!key) return;
    setCloud("syncing");
    setCloudError("");
    const requireOk = async (response: Response) => {
      if (response.ok) return;
      let code = "sync_unavailable";
      try {
        const data = await response.json();
        if (data.error === "tracker_schema_upgrade_required") code = data.error;
      } catch {}
      throw new Error(code);
    };
    try {
      const headers = {
        "x-tracker-key": key,
        "content-type": "application/json",
      };
      for (const id of [...deleted.current]) {
        const response = await fetch(
          `/api/tracker?id=${encodeURIComponent(id)}`,
          { method: "DELETE", headers },
        );
        await requireOk(response);
        deleted.current = deleted.current.filter((v) => v !== id);
      }
      const snapshot = current.current.filter(
        (b) => !b.opportunityId.startsWith("demo-"),
      );
      for (let offset = 0; offset < snapshot.length; offset += 500) {
        const save = await fetch("/api/tracker", {
          method: "POST",
          headers,
          body: JSON.stringify({ bets: snapshot.slice(offset, offset + 500) }),
        });
        await requireOk(save);
      }
      const response = await fetch("/api/tracker", { headers });
      await requireOk(response);
      const data = await response.json();
      const remote = normalizeBets(data.bets).filter(
        (b) => !deleted.current.includes(b.id),
      );
      persist(mergeBets(current.current, remote));
      setCloud("connected");
    } catch (e) {
      setCloud("local");
      if (e instanceof Error && e.message === "tracker_schema_upgrade_required")
        setCloudError(
          "Le serveur doit être mis à jour pour synchroniser les preuves et les demi-règlements. Vos prises restent sauvegardées dans ce navigateur.",
        );
    }
  }, [key, persist]);

  const scheduleSync = useCallback(() => {
    queue.current = queue.current.then(sync).catch(() => setCloud("local"));
  }, [sync]);

  useEffect(() => {
    if (key) scheduleSync();
  }, [key, scheduleSync]);

  function update(next: Bet[]) {
    persist(next);
    if (cloud === "connected" || cloud === "syncing") scheduleSync();
  }
  function remove(id: string) {
    const bet = current.current.find((b) => b.id === id);
    if (bet && !bet.opportunityId.startsWith("demo-")) deleted.current.push(id);
    update(current.current.filter((b) => b.id !== id));
  }
  async function importKey(value: string) {
    const next = value.trim();
    if (!/^[a-f0-9]{64}$/i.test(next)) return false;
    if (next === key) {
      scheduleSync();
      return true;
    }
    await queue.current;
    // Changing identity must not push another identity's local bets to the cloud.
    deleted.current = [];
    persist(current.current.filter((b) => b.opportunityId.startsWith("demo-")));
    try {
      localStorage.setItem(KEY, next);
    } catch {
      setStorageError(true);
    }
    setCloud("local");
    setKey(next);
    return true;
  }
  return {
    bets,
    loaded,
    cloud,
    cloudError,
    storageError,
    update,
    remove,
    sync: scheduleSync,
    key,
    importKey,
  };
}
