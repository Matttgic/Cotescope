"use client";

import { useEffect, useMemo, useState } from "react";
import { DEMO_ARBITRAGES, DEMO_HISTORY, DEMO_OPPORTUNITIES } from "@/data/demo";
import { ANJ_SPORTS_BOOKMAKERS } from "@/lib/bookmakers";
import { arbitrageRoiPct, arbitrageStakes } from "@/lib/arbitrage";
import type { Opportunity, Sport } from "@/lib/types";

const SPORTS: Array<"Tous" | Sport> = ["Tous", "Football", "Tennis", "Basketball", "Rugby", "Handball", "Volleyball", "Hockey", "Baseball", "NFL", "MMA", "Boxe", "Cricket", "Darts", "Tennis de table", "Autre"];
const NAV = ["Scanner", "Arbitrages", "Boosts", "Tracker", "Analytics"];

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>;
}

function OpportunityCard({ item, onTrack }: { item: Opportunity; onTrack: (item: Opportunity) => void }) {
  return (
    <article className="opportunity-card">
      <div className="event-block"><span className="sport-pill">{item.sport}</span><strong>{item.event}</strong><small>{item.competition} · {item.startTime} · {item.market}</small></div>
      <div className="selection-block"><span>{item.selection}</span><strong>{item.bookmakerOdds.toFixed(2)}</strong><small>{item.bookmaker}{item.isBoost ? " · BOOST" : ""}</small></div>
      <div className="fair-block"><span>Cote juste</span><strong>{item.fairOdds.toFixed(2)}</strong><small>réf. {item.referenceOdds.toFixed(2)}</small></div>
      <div className="ev-block"><span>EV</span><strong>+{item.evPct.toFixed(1)}%</strong><small>{item.freshnessSeconds}s</small></div>
      <div className="score-block"><span>Score</span><strong>{item.opportunityScore}</strong><small>{item.confidence}</small></div>
      <button className="track-button" onClick={() => onTrack(item)}>Suivre</button>
    </article>
  );
}

export default function Dashboard() {
  const [activeNav, setActiveNav] = useState("Scanner");
  const [sport, setSport] = useState<(typeof SPORTS)[number]>("Tous");
  const [minEv, setMinEv] = useState(2);
  const [maxOdds, setMaxOdds] = useState(4);
  const [showGuarded, setShowGuarded] = useState(false);
  const [tracked, setTracked] = useState<Opportunity[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>(DEMO_OPPORTUNITIES);
  const [isDemo, setIsDemo] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/opportunities")
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        setOpportunities(Array.isArray(payload.opportunities) ? payload.opportunities : []);
        setIsDemo(Boolean(payload.demo));
      })
      .catch(() => {
        if (!cancelled) {
          setOpportunities(DEMO_OPPORTUNITIES);
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

  const historyProfit = DEMO_HISTORY.reduce((sum, x) => sum + x.profit, 0);
  const historyStake = DEMO_HISTORY.reduce((sum, x) => sum + x.stake, 0);
  const roi = historyStake > 0 ? (historyProfit / historyStake) * 100 : 0;
  const wins = DEMO_HISTORY.filter((x) => x.result === "win").length;
  const avgClv = DEMO_HISTORY.reduce((sum, x) => sum + x.clvPct, 0) / DEMO_HISTORY.length;

  function track(item: Opportunity) {
    setTracked((current) => current.some((x) => x.id === item.id) ? current : [...current, item]);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><div className="brand-row"><div className="logo-mark">C</div><div><strong className="brand">CoteScope FR</strong><span className="badge">FRANCE ONLY</span></div></div><p>Scanner privé de value, arbitrages et boosts · Bookmakers ANJ uniquement</p></div>
        <div className="live-state"><i /> {loading ? "CHARGEMENT" : isDemo ? "MODE DÉMO" : "COTES LIVE"}</div>
      </header>

      <nav className="nav-tabs" aria-label="Sections">{NAV.map((item) => <button key={item} className={activeNav === item ? "active" : ""} onClick={() => setActiveNav(item)}>{item}{item === "Tracker" && tracked.length > 0 ? ` (${tracked.length})` : ""}</button>)}</nav>

      {activeNav === "Scanner" && <>
        <section className="metrics-grid"><Metric label="Opportunités" value={String(filtered.length)} hint="après filtres" /><Metric label="EV max" value={`${Math.max(...filtered.map((x) => x.evPct), 0).toFixed(1)}%`} hint={isDemo ? "démo" : "live"} /><Metric label="Score max" value={`${Math.max(...filtered.map((x) => x.opportunityScore), 0)}/100`} hint="qualité interne" /><Metric label="Bookmakers" value={String(ANJ_SPORTS_BOOKMAKERS.length)} hint="domaines ANJ configurés" /></section>
        <section className="panel filters"><div className="panel-heading"><div><span className="eyebrow">FILTRES</span><h2>Scanner de value</h2></div><span className="data-note">{isDemo ? "Données fictives de démonstration" : "Données fournisseur · référence Pinnacle no-vig"}</span></div><div className="filter-grid">
          <label>Sport<select value={sport} onChange={(e) => setSport(e.target.value as (typeof SPORTS)[number])}>{SPORTS.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>EV minimum<input type="range" min="0" max="10" step="0.5" value={minEv} onChange={(e) => setMinEv(Number(e.target.value))} /><b>{minEv.toFixed(1)}%</b></label>
          <label>Cote max standard<input type="range" min="1.5" max="8" step="0.25" value={maxOdds} onChange={(e) => setMaxOdds(Number(e.target.value))} /><b>{maxOdds.toFixed(2)}</b></label>
          <label className="switch-row"><input type="checkbox" checked={showGuarded} onChange={(e) => setShowGuarded(e.target.checked)} /><span>Afficher les opportunités bloquées par le garde-fou</span></label>
        </div></section>
        <section className="opportunity-list">{filtered.map((item) => <OpportunityCard key={item.id} item={item} onTrack={track} />)}{filtered.length === 0 && <div className="empty-state">Aucune opportunité ne passe les filtres actuels.</div>}</section>
      </>}

      {activeNav === "Arbitrages" && <section className="stack-section">
        <div className="section-title"><div><span className="eyebrow">SUREBETS</span><h2>Arbitrages détectés</h2></div><span className="data-note">Répartition sur 100 €</span></div>
        {DEMO_ARBITRAGES.map((arb) => {
          const odds = arb.outcomes.map((x) => x.odds);
          const arbRoi = arbitrageRoiPct(odds);
          const stakes = arbitrageStakes(odds, 100);
          return <article className="panel arb-card" key={arb.id}><div><span className="sport-pill">{arb.sport}</span><h3>{arb.event}</h3><small>{arb.market} · fraîcheur {arb.freshnessSeconds}s</small></div><div className="arb-outcomes">{arb.outcomes.map((outcome, index) => <div key={outcome.selection}><span>{outcome.selection}</span><strong>{outcome.odds.toFixed(2)}</strong><small>{outcome.bookmaker} · mise {stakes[index].toFixed(2)} €</small></div>)}</div><div className="arb-roi"><span>Rendement théorique si les cotes restent disponibles</span><strong>+{arbRoi.toFixed(2)}%</strong></div></article>;
        })}
      </section>}

      {activeNav === "Boosts" && <section className="stack-section"><div className="section-title"><div><span className="eyebrow">BOOST WATCH</span><h2>Boosts intéressants</h2></div><span className="data-note">comparés à la cote juste</span></div>{opportunities.filter((x) => x.isBoost).map((item) => <OpportunityCard key={item.id} item={item} onTrack={track} />)}</section>}

      {activeNav === "Tracker" && <section className="stack-section"><div className="section-title"><div><span className="eyebrow">BET TRACKER</span><h2>Paris suivis</h2></div><span className="data-note">persistance Supabase à brancher</span></div>{tracked.length === 0 ? <div className="panel empty-state">Ajoute une opportunité depuis Scanner ou Boosts.</div> : tracked.map((item) => <article className="panel tracked-card" key={item.id}><div><strong>{item.event}</strong><small>{item.market} · {item.selection}</small></div><div><span>Cote prise</span><strong>{item.bookmakerOdds.toFixed(2)}</strong><small>{item.bookmaker}</small></div><div><span>EV initiale</span><strong>+{item.evPct.toFixed(1)}%</strong><small>score {item.opportunityScore}/100</small></div><div className="open-pill">OUVERT</div></article>)}</section>}

      {activeNav === "Analytics" && <section className="stack-section">
        <div className="metrics-grid"><Metric label="Profit démo" value={`${historyProfit >= 0 ? "+" : ""}${historyProfit.toFixed(2)} €`} hint="5 paris réglés" /><Metric label="ROI" value={`${roi.toFixed(1)}%`} hint={`${wins}/${DEMO_HISTORY.length} gagnés`} /><Metric label="CLV moyen" value={`${avgClv >= 0 ? "+" : ""}${avgClv.toFixed(1)}%`} hint="vs closing line" /><Metric label="Mise totale" value={`${historyStake.toFixed(0)} €`} hint="10 € / pari" /></div>
        <article className="panel"><div className="panel-heading"><div><span className="eyebrow">HISTORIQUE</span><h2>Performance lisible</h2></div><span className="data-note">échantillon démo</span></div><div className="history-table">{DEMO_HISTORY.map((row) => <div className="history-row" key={row.id}><span>{row.sport}</span><span>{row.bookmaker}</span><span>@ {row.odds.toFixed(2)}</span><strong className={row.profit >= 0 ? "positive" : "negative"}>{row.profit >= 0 ? "+" : ""}{row.profit.toFixed(2)} €</strong><span>CLV {row.clvPct >= 0 ? "+" : ""}{row.clvPct.toFixed(1)}%</span></div>)}</div></article>
      </section>}

      <footer><strong>18+</strong> Les probabilités, écarts de cotes et scores sont des outils d’analyse, pas des garanties de gain. Vérifier la cote avant toute prise de pari.</footer>
    </main>
  );
}
