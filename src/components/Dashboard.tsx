"use client";

import { useEffect, useMemo, useState } from "react";
import { ANJ_SPORTS_BOOKMAKERS } from "@/lib/bookmakers";
import type { Opportunity, Sport } from "@/lib/types";

const SPORTS: Array<"Tous" | Sport> = ["Tous", "Football", "Tennis", "Basketball", "Rugby", "Handball", "Volleyball", "Hockey", "Baseball", "NFL", "MMA", "Boxe", "Cricket", "Darts", "Tennis de table", "Autre"];
const NAV = ["Scanner", "Arbitrages", "Boosts", "Tracker", "Analytics"];
const TRACKER_STORAGE_KEY = "cotescope.bet-history.v1";
const TRACKER_SYNC_KEY = "cotescope.tracker-sync-key.v1";
const TRACKER_KEY_PATTERN = /^[a-f0-9]{64}$/i;

type BetStatus = "open" | "win" | "loss" | "void";
type CloudState = "loading" | "connected" | "local";

type TrackedBet = {
  id: string;
  opportunityId: string;
  createdAt: string;
  updatedAt: string;
  sport: Sport;
  competition: string;
  event: string;
  market: string;
  selection: string;
  bookmaker: string;
  odds: number;
  stake: number;
  initialEvPct: number;
  opportunityScore: number;
  status: BetStatus;
};

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>;
}

function OpportunityCard({ item }: { item: Opportunity }) {
  return (
    <article className="opportunity-card">
      <div className="event-block"><span className="sport-pill">{item.sport}</span><strong>{item.event}</strong><small>{item.competition} · {item.startTime} · {item.market}</small></div>
      <div className="selection-block"><span>{item.selection}</span><strong>{item.bookmakerOdds.toFixed(2)}</strong><small>{item.bookmaker}{item.isBoost ? " · BOOST" : ""}</small></div>
      <div className="fair-block"><span>Cote juste</span><strong>{item.fairOdds.toFixed(2)}</strong><small>réf. {item.referenceOdds.toFixed(2)}</small></div>
      <div className="ev-block"><span>EV</span><strong>+{item.evPct.toFixed(1)}%</strong><small>{item.freshnessSeconds}s</small></div>
      <div className="score-block"><span>Score</span><strong>{item.opportunityScore}</strong><small>{item.confidence}</small></div>
    </article>
  );
}

function betProfit(bet: TrackedBet) {
  if (bet.status === "win") return bet.stake * (bet.odds - 1);
  if (bet.status === "loss") return -bet.stake;
  return 0;
}

function statusLabel(status: BetStatus) {
  if (status === "win") return "Gagné";
  if (status === "loss") return "Perdu";
  if (status === "void") return "Remboursé";
  return "Ouvert";
}

function formatTrackedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function generateSyncKey() {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function normalizeLocalBet(value: TrackedBet): TrackedBet {
  return {
    ...value,
    updatedAt: value.updatedAt || value.createdAt || new Date().toISOString(),
  };
}

function isDemoBet(bet: TrackedBet) {
  return bet.opportunityId.startsWith("demo-");
}

function mergeBetHistory(local: TrackedBet[], cloud: TrackedBet[]) {
  const byOpportunity = new Map<string, TrackedBet>();
  for (const bet of [...cloud, ...local]) {
    const normalized = normalizeLocalBet(bet);
    if (isDemoBet(normalized)) continue;
    const current = byOpportunity.get(normalized.opportunityId);
    const currentTime = current ? Date.parse(current.updatedAt || current.createdAt) : 0;
    const nextTime = Date.parse(normalized.updatedAt || normalized.createdAt);
    if (!current || nextTime >= currentTime) byOpportunity.set(normalized.opportunityId, normalized);
  }
  return Array.from(byOpportunity.values()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function opportunityToTrackedBet(item: Opportunity, suffix: number): TrackedBet {
  const now = new Date().toISOString();
  return {
    id: `auto-${item.id}-${suffix}`,
    opportunityId: item.id,
    createdAt: now,
    updatedAt: now,
    sport: item.sport,
    competition: item.competition,
    event: item.event,
    market: item.market,
    selection: item.selection,
    bookmaker: item.bookmaker,
    odds: item.bookmakerOdds,
    stake: 10,
    initialEvPct: item.evPct,
    opportunityScore: item.opportunityScore,
    status: "open",
  };
}

export default function Dashboard() {
  const [activeNav, setActiveNav] = useState("Scanner");
  const [sport, setSport] = useState<(typeof SPORTS)[number]>("Tous");
  const [minEv, setMinEv] = useState(2);
  const [maxOdds, setMaxOdds] = useState(4);
  const [showGuarded, setShowGuarded] = useState(false);
  const [trackedBets, setTrackedBets] = useState<TrackedBet[]>([]);
  const [trackerLoaded, setTrackerLoaded] = useState(false);
  const [syncKey, setSyncKey] = useState("");
  const [syncDraft, setSyncDraft] = useState("");
  const [cloudState, setCloudState] = useState<CloudState>("loading");
  const [syncMessage, setSyncMessage] = useState("");
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isDemo, setIsDemo] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function initializeTracker() {
      let localBets: TrackedBet[] = [];
      try {
        const raw = window.localStorage.getItem(TRACKER_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            localBets = parsed
              .map((bet) => normalizeLocalBet(bet as TrackedBet))
              .filter((bet) => !isDemoBet(bet));
          }
        }
      } catch {
        localBets = [];
      }

      let key = window.localStorage.getItem(TRACKER_SYNC_KEY)?.trim() ?? "";
      if (!TRACKER_KEY_PATTERN.test(key)) {
        key = generateSyncKey();
        window.localStorage.setItem(TRACKER_SYNC_KEY, key);
      }
      if (cancelled) return;
      setSyncKey(key);
      setSyncDraft(key);
      setTrackedBets(localBets);

      try {
        const response = await fetch("/api/tracker", { headers: { "x-tracker-key": key } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const cloudBets = Array.isArray(payload.bets)
          ? payload.bets.map((bet: TrackedBet) => normalizeLocalBet(bet)).filter((bet: TrackedBet) => !isDemoBet(bet))
          : [];
        const merged = mergeBetHistory(localBets, cloudBets);
        if (cancelled) return;
        setTrackedBets(merged);
        setCloudState("connected");
        setSyncMessage("Historique Neon synchronisé");
        if (merged.length > 0) {
          void fetch("/api/tracker", {
            method: "POST",
            headers: { "content-type": "application/json", "x-tracker-key": key },
            body: JSON.stringify({ bets: merged }),
          });
        }
      } catch {
        if (!cancelled) {
          setCloudState("local");
          setSyncMessage("Mode local · Neon non relié à Vercel");
        }
      } finally {
        if (!cancelled) setTrackerLoaded(true);
      }
    }

    void initializeTracker();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!trackerLoaded) return;
    try {
      window.localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(trackedBets));
    } catch {
      // Keep the current in-memory history if storage is unavailable.
    }
  }, [trackedBets, trackerLoaded]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/opportunities")
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        const demo = Boolean(payload.demo);
        setIsDemo(demo);
        setOpportunities(!demo && Array.isArray(payload.opportunities) ? payload.opportunities : []);
      })
      .catch(() => {
        if (!cancelled) {
          setOpportunities([]);
          setIsDemo(true);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => opportunities.filter((item) => {
    if (sport !== "Tous" && item.sport !== sport) return false;
    if (item.evPct < minEv) return false;
    if (!showGuarded && (!item.highOddsGuard || item.bookmakerOdds > maxOdds)) return false;
    return true;
  }), [opportunities, sport, minEv, maxOdds, showGuarded]);

  const trackedOpportunityIds = useMemo(() => new Set(trackedBets.map((bet) => bet.opportunityId)), [trackedBets]);
  const settledTracked = trackedBets.filter((bet) => bet.status === "win" || bet.status === "loss");
  const trackerStake = trackedBets.reduce((sum, bet) => sum + bet.stake, 0);
  const trackerSettledStake = settledTracked.reduce((sum, bet) => sum + bet.stake, 0);
  const trackerProfit = trackedBets.reduce((sum, bet) => sum + betProfit(bet), 0);
  const trackerRoi = trackerSettledStake > 0 ? (trackerProfit / trackerSettledStake) * 100 : 0;
  const openBets = trackedBets.filter((bet) => bet.status === "open").length;
  const winsTracked = trackedBets.filter((bet) => bet.status === "win").length;
  const settledBets = settledTracked.length;
  const winRate = settledBets > 0 ? (winsTracked / settledBets) * 100 : 0;
  const liveBoosts = opportunities.filter((item) => item.isBoost);

  async function saveCloud(bets: TrackedBet[], key = syncKey) {
    if (!TRACKER_KEY_PATTERN.test(key) || bets.length === 0) return;
    try {
      const response = await fetch("/api/tracker", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tracker-key": key },
        body: JSON.stringify({ bets }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setCloudState("connected");
      setSyncMessage("Sauvegardé dans Neon");
    } catch {
      setCloudState("local");
      setSyncMessage("Sauvegardé localement · cloud indisponible");
    }
  }

  function updateBet(id: string, patch: Partial<TrackedBet>) {
    const current = trackedBets.find((bet) => bet.id === id);
    if (!current) return;
    const updated: TrackedBet = { ...current, ...patch, updatedAt: new Date().toISOString() };
    setTrackedBets((bets) => bets.map((bet) => bet.id === id ? updated : bet));
    void saveCloud([updated]);
  }

  function removeBet(id: string) {
    setTrackedBets((current) => current.filter((bet) => bet.id !== id));
    if (!TRACKER_KEY_PATTERN.test(syncKey)) return;
    void fetch(`/api/tracker?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-tracker-key": syncKey },
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setCloudState("connected");
      setSyncMessage("Pari supprimé du cloud");
    }).catch(() => {
      setCloudState("local");
      setSyncMessage("Suppression locale · cloud indisponible");
    });
  }

  async function applySyncKey() {
    const key = syncDraft.trim().toLowerCase();
    if (!TRACKER_KEY_PATTERN.test(key)) {
      setSyncMessage("Clé invalide : 64 caractères hexadécimaux requis");
      return;
    }
    window.localStorage.setItem(TRACKER_SYNC_KEY, key);
    setSyncKey(key);
    setCloudState("loading");
    setSyncMessage("Synchronisation…");
    try {
      const response = await fetch("/api/tracker", { headers: { "x-tracker-key": key } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const cloudBets = Array.isArray(payload.bets)
        ? payload.bets.map((bet: TrackedBet) => normalizeLocalBet(bet)).filter((bet: TrackedBet) => !isDemoBet(bet))
        : [];
      const merged = mergeBetHistory(trackedBets, cloudBets);
      setTrackedBets(merged);
      setCloudState("connected");
      setSyncMessage("Clé importée · historique synchronisé");
      await saveCloud(merged, key);
    } catch {
      setCloudState("local");
      setSyncMessage("Clé enregistrée localement · cloud indisponible");
    }
  }

  async function copySyncKey() {
    if (!syncKey) return;
    try {
      await navigator.clipboard.writeText(syncKey);
      setSyncMessage("Clé cloud copiée");
    } catch {
      setSyncMessage("Copie impossible sur ce navigateur");
    }
  }

  useEffect(() => {
    if (!trackerLoaded || loading || isDemo || filtered.length === 0) return;
    const fresh = filtered.filter((item) => !trackedOpportunityIds.has(item.id));
    if (fresh.length === 0) return;

    const base = Date.now();
    const bets = fresh.map((item, index) => opportunityToTrackedBet(item, base + index));
    setTrackedBets((current) => mergeBetHistory(current, bets));
    void saveCloud(bets);
  }, [filtered, trackedOpportunityIds, trackerLoaded, loading, isDemo, syncKey]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><div className="brand-row"><div className="logo-mark">C</div><div><strong className="brand">CoteScope FR</strong><span className="badge">FRANCE ONLY</span></div></div><p>Scanner privé de value, arbitrages et boosts · Bookmakers ANJ uniquement</p></div>
        <div className="live-state"><i /> {loading ? "CHARGEMENT" : isDemo ? "SOURCE LIVE NON CONFIGURÉE" : "COTES LIVE"}</div>
      </header>

      <nav className="nav-tabs" aria-label="Sections">{NAV.map((item) => <button key={item} className={activeNav === item ? "active" : ""} onClick={() => setActiveNav(item)}>{item}{item === "Tracker" && trackedBets.length > 0 ? ` (${trackedBets.length})` : ""}</button>)}</nav>

      {activeNav === "Scanner" && <>
        <section className="metrics-grid"><Metric label="Opportunités" value={String(filtered.length)} hint="live après filtres" /><Metric label="EV max" value={`${Math.max(...filtered.map((x) => x.evPct), 0).toFixed(1)}%`} hint={isDemo ? "aucune donnée fictive" : "live"} /><Metric label="Score max" value={`${Math.max(...filtered.map((x) => x.opportunityScore), 0)}/100`} hint="qualité interne" /><Metric label="Bookmakers" value={String(ANJ_SPORTS_BOOKMAKERS.length)} hint="domaines ANJ configurés" /></section>
        <section className="panel filters"><div className="panel-heading"><div><span className="eyebrow">FILTRES</span><h2>Scanner de value</h2></div><span className="data-note">{isDemo ? "Aucune donnée live affichée tant que le fournisseur de cotes n’est pas activé" : "Données fournisseur · référence Pinnacle no-vig · enregistrement Tracker automatique"}</span></div><div className="filter-grid">
          <label>Sport<select value={sport} onChange={(e) => setSport(e.target.value as (typeof SPORTS)[number])}>{SPORTS.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>EV minimum<input type="range" min="0" max="10" step="0.5" value={minEv} onChange={(e) => setMinEv(Number(e.target.value))} /><b>{minEv.toFixed(1)}%</b></label>
          <label>Cote max standard<input type="range" min="1.5" max="8" step="0.25" value={maxOdds} onChange={(e) => setMaxOdds(Number(e.target.value))} /><b>{maxOdds.toFixed(2)}</b></label>
          <label className="switch-row"><input type="checkbox" checked={showGuarded} onChange={(e) => setShowGuarded(e.target.checked)} /><span>Afficher les opportunités bloquées par le garde-fou</span></label>
        </div></section>
        <section className="opportunity-list">{filtered.map((item) => <OpportunityCard key={item.id} item={item} />)}{filtered.length === 0 && <div className="empty-state">{isDemo ? "Aucune sélection fictive : branche le fournisseur de cotes live pour alimenter le Scanner." : "Aucune opportunité ne passe les filtres actuels."}</div>}</section>
      </>}

      {activeNav === "Arbitrages" && <section className="stack-section">
        <div className="section-title"><div><span className="eyebrow">SUREBETS</span><h2>Arbitrages détectés</h2></div><span className="data-note">live uniquement</span></div>
        <div className="panel empty-state">Le moteur d’arbitrage live n’est pas encore branché. Aucune donnée fictive n’est affichée.</div>
      </section>}

      {activeNav === "Boosts" && <section className="stack-section"><div className="section-title"><div><span className="eyebrow">BOOST WATCH</span><h2>Boosts intéressants</h2></div><span className="data-note">live uniquement</span></div>{liveBoosts.map((item) => <OpportunityCard key={item.id} item={item} />)}{liveBoosts.length === 0 && <div className="panel empty-state">Aucun boost live détecté.</div>}</section>}

      {activeNav === "Tracker" && <section className="stack-section">
        <div className="section-title"><div><span className="eyebrow">BET TRACKER</span><h2>Historique automatique CoteScope</h2></div><span className="data-note">{cloudState === "connected" ? "Neon cloud + secours local" : cloudState === "loading" ? "connexion cloud…" : "secours local"}</span></div>
        <div className="metrics-grid tracker-metrics"><Metric label="Paris enregistrés" value={String(trackedBets.length)} hint={`${openBets} ouverts`} /><Metric label="Mise cumulée" value={`${trackerStake.toFixed(2)} €`} hint="tous statuts" /><Metric label="Profit net" value={`${trackerProfit >= 0 ? "+" : ""}${trackerProfit.toFixed(2)} €`} hint="paris réglés" /><Metric label="ROI réalisé" value={`${trackerRoi >= 0 ? "+" : ""}${trackerRoi.toFixed(1)}%`} hint={settledBets > 0 ? `${winsTracked}/${settledBets} gagnés` : "aucun pari réglé"} /></div>
        <article className="panel">
          <div className="panel-heading"><div><span className="eyebrow">SYNC CLOUD</span><h2>{cloudState === "connected" ? "Neon connecté" : cloudState === "loading" ? "Connexion Neon" : "Mode local"}</h2></div><span className="data-note">{syncMessage}</span></div>
          <div className="bet-fields" style={{ marginTop: 14 }}>
            <label>Clé de synchronisation<input className="compact-input" type="password" value={syncDraft} onChange={(e) => setSyncDraft(e.target.value)} autoComplete="off" /></label>
            <button className="track-button" type="button" onClick={copySyncKey}>Copier la clé</button>
            <button className="track-button" type="button" onClick={applySyncKey}>Importer / synchroniser</button>
          </div>
        </article>
        {trackedBets.length === 0 ? <div className="panel empty-state">Les opportunités live affichées dans Scanner seront enregistrées ici automatiquement. Aucun clic n’est nécessaire.</div> : <div className="tracker-history">{trackedBets.map((bet) => {
          const profit = betProfit(bet);
          return <article className="panel bet-history-card" key={bet.id}>
            <div className="bet-main"><div><span className="sport-pill">{bet.sport}</span><strong>{bet.event}</strong><small>{formatTrackedDate(bet.createdAt)} · {bet.competition}</small></div><div><span>Sélection</span><strong>{bet.selection}</strong><small>{bet.market}</small></div></div>
            <div className="bet-fields">
              <label>Bookmaker<strong>{bet.bookmaker}</strong></label>
              <label>Cote prise<input className="compact-input" type="number" min="1.01" step="0.01" value={bet.odds} onChange={(e) => updateBet(bet.id, { odds: Math.max(1.01, Number(e.target.value) || 1.01) })} /></label>
              <label>Mise (€)<input className="compact-input" type="number" min="0" step="1" value={bet.stake} onChange={(e) => updateBet(bet.id, { stake: Math.max(0, Number(e.target.value) || 0) })} /></label>
              <label>Statut<select className="compact-select" value={bet.status} onChange={(e) => updateBet(bet.id, { status: e.target.value as BetStatus })}><option value="open">Ouvert</option><option value="win">Gagné</option><option value="loss">Perdu</option><option value="void">Remboursé</option></select></label>
              <div className="bet-result"><span>Résultat</span><strong className={profit > 0 ? "positive" : profit < 0 ? "negative" : ""}>{profit > 0 ? "+" : ""}{profit.toFixed(2)} €</strong><small>{statusLabel(bet.status)}</small></div>
            </div>
            <div className="bet-meta"><span>EV détection <strong>+{bet.initialEvPct.toFixed(1)}%</strong></span><span>Score <strong>{bet.opportunityScore}/100</strong></span><button className="delete-bet" onClick={() => removeBet(bet.id)}>Supprimer</button></div>
          </article>;
        })}</div>}
      </section>}

      {activeNav === "Analytics" && <section className="stack-section">
        <div className="metrics-grid"><Metric label="Profit net" value={`${trackerProfit >= 0 ? "+" : ""}${trackerProfit.toFixed(2)} €`} hint="historique réel Tracker" /><Metric label="ROI réalisé" value={`${trackerRoi >= 0 ? "+" : ""}${trackerRoi.toFixed(1)}%`} hint={`${settledBets} paris réglés`} /><Metric label="Réussite" value={`${winRate.toFixed(1)}%`} hint={settledBets > 0 ? `${winsTracked}/${settledBets} gagnés` : "aucun pari réglé"} /><Metric label="Mise réglée" value={`${trackerSettledStake.toFixed(2)} €`} hint="gagnés + perdus" /></div>
        <article className="panel"><div className="panel-heading"><div><span className="eyebrow">HISTORIQUE</span><h2>Performance réelle du Tracker</h2></div><span className="data-note">aucune donnée fictive</span></div>{trackedBets.length === 0 ? <div className="empty-state">Aucune détection enregistrée pour le moment.</div> : <div className="history-table">{trackedBets.map((row) => { const profit = betProfit(row); return <div className="history-row" key={row.id}><span>{row.sport}</span><span>{row.bookmaker}</span><span>@ {row.odds.toFixed(2)}</span><strong className={profit >= 0 ? "positive" : "negative"}>{profit >= 0 ? "+" : ""}{profit.toFixed(2)} €</strong><span>{statusLabel(row.status)}</span></div>; })}</div>}</article>
      </section>}

      <footer><strong>18+</strong> Les probabilités, écarts de cotes et scores sont des outils d’analyse, pas des garanties de gain. Vérifier la cote avant toute prise de pari.</footer>
    </main>
  );
}
