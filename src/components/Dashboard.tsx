"use client";
import { arbitrageRoiPct, arbitrageStakes } from "@/lib/arbitrage";
import { money, number, percent, shortTime, time } from "@/lib/format";
import {
  betsCsv,
  createBet,
  journalStats,
  journalForSource,
  JOURNAL_SOURCE_LABELS,
  type Bet,
} from "@/lib/journal";
import {
  DEFAULT_FILTERS,
  filterOpportunities,
  quoteAge,
  type Filters,
} from "@/lib/scanner";
import type { Opportunity } from "@/lib/types";
import type { DataSource } from "@/lib/dataSource";
import {
  REJECTION_LABELS,
  type DecisionDiagnostics,
} from "@/lib/decisionEngine";
import { fractionalKelly } from "@/lib/value";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ArbitrageView from "./ArbitrageView";
import Icon from "./Icon";
import Image from "next/image";
import JournalView from "./JournalView";
import MethodView from "./MethodView";
import MethodComparisonView from "./MethodComparisonView";
import PerformanceView from "./PerformanceView";
import EvidenceView from "./EvidenceView";
import SettingsView from "./SettingsView";
import SectionTabs from "./SectionTabs";
import ScannerView from "./ScannerView";
import { useJournal } from "./useJournal";

const NAV = [
  ["Scanner", "radar"],
  ["Journal", "journal"],
  ["Performance", "chart"],
  ["Outils", "layers"],
  ["Paramètres", "settings"],
];
export default function Dashboard({
  initialMode,
}: {
  initialMode: DataSource;
}) {
  const [nav, setNav] = useState("Scanner");
  const [performanceView, setPerformanceView] = useState("paper");
  const engineView = nav === "Performance" && performanceView === "engine";
  const paperView = nav === "Performance" && performanceView === "paper";
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [items, setItems] = useState<Opportunity[]>([]);
  const [mode, setMode] = useState<DataSource>(initialMode);
  const [isDemo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");
  const [source, setSource] = useState("");
  const [diagnostics, setDiagnostics] = useState<DecisionDiagnostics | null>(
    null,
  );
  const [now, setNow] = useState(0);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [stake, setStake] = useState(10);
  const [bankroll, setBankroll] = useState(1000);
  const [toast, setToast] = useState("");
  const [journalFilter, setJournalFilter] = useState("all");
  const [allJournalSources, setAllJournalSources] = useState(false);
  const [arbOdds, setArbOdds] = useState([2.12, 2.02]);
  const [arbStake, setArbStake] = useState(100);
  const [arbs, setArbs] = useState<
    Array<{
      id: string;
      event: string;
      outcomes: Array<{ selection: string; bookmaker: string; odds: number }>;
    }>
  >([]);
  const journal = useJournal();
  const request = useRef<AbortController | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const pageContent = useRef<HTMLDivElement>(null);
  const toolsView = ["Arbitrages", "Méthode", "Comparaison"].includes(nav);
  const primaryNav = toolsView ? "Outils" : nav;
  const feedView =
    ["Scanner", "Journal", "Performance"].includes(nav) &&
    !engineView &&
    !paperView;
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }, []);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        mode === "cotescope"
          ? "/api/cotescope"
          : mode === "cotes-value"
            ? "/api/cotes-value"
            : "/api/opportunities" + (mode ? "?mode=" + mode : ""),
        { signal: controller.signal, cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error === "database_not_configured"
            ? "Le scanner live attend une base Neon configurée et un premier scan. Vous pouvez explorer la démonstration."
            : data.error === "cotes_value_unavailable"
              ? "Le flux cotes-value est indisponible. Aucun exemple ne remplace les données réelles."
              : data.error === "cotescope_source_unavailable"
                ? "Les prix du flux cotes-value sont indisponibles pour la méthode CoteScope. Aucun exemple ne remplace les données réelles."
                : "Le relevé est indisponible. Réessayez dans un instant.",
        );
      setItems(Array.isArray(data.opportunities) ? data.opportunities : []);
      setDemo(Boolean(data.demo));
      setSource(data.source || "");
      setDiagnostics(data.diagnostics || null);
      setUpdated(data.generatedAt);
      setNow(Date.now());
    } catch (e) {
      if (controller.signal.aborted) return;
      setItems([]);
      setDiagnostics(null);
      setDemo(false);
      setError(e instanceof Error ? e.message : "Connexion indisponible.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [mode]);
  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);
  useEffect(() => {
    setNow(Date.now());
    try {
      const v = Number(localStorage.getItem("cotescope.bankroll"));
      if (v > 0 && Number.isFinite(v)) setBankroll(v);
    } catch {
      /* default */
    }
    const timer = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void load();
    }, 60000);
    return () => {
      clearInterval(timer);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [load]);
  useEffect(() => {
    if (nav !== "Arbitrages" || !isDemo) return;
    const controller = new AbortController();
    fetch("/api/arbitrages", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setArbs(d.arbitrages || []))
      .catch(() => {
        if (!controller.signal.aborted)
          notify("Exemples d’arbitrage indisponibles.");
      });
    return () => controller.abort();
  }, [nav, isDemo, notify]);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  useEffect(() => {
    pageContent.current?.scrollTo({ top: 0 });
  }, [nav, performanceView]);
  const visible = useMemo(
    () => filterOpportunities(items, filters, now),
    [items, filters, now],
  );
  const personal = journal.bets.filter(
    (b) => !b.opportunityId.startsWith("demo-"),
  );
  const demoBets = journal.bets.filter((b) =>
    b.opportunityId.startsWith("demo-"),
  );
  const journalDemo = mode === "demo";
  const displayedBets = journalForSource(journal.bets, mode, allJournalSources);
  const journalSourceLabel =
    !journalDemo && allJournalSources
      ? "Toutes les sources"
      : JOURNAL_SOURCE_LABELS[mode];
  const otherSourceCount = journalDemo
    ? 0
    : personal.length - journalForSource(personal, mode).length;
  const stats = journalStats(displayedBets);
  // The shared bankroll still reserves stakes from every personal source.
  const totalExposure = journalStats(journalDemo ? demoBets : personal).exposure;
  const methodExposure = selected?.method
    ? personal
        .filter(
          (b) =>
            b.status === "open" &&
            b.capture?.method?.eventKey === selected.method!.eventKey,
        )
        .reduce((sum, b) => sum + b.stake, 0)
    : 0;
  const books = [...new Set(items.map((o) => o.bookmaker))].sort();
  const sports = [...new Set(items.map((o) => o.sport))].sort();
  const average = visible.length
    ? visible.reduce((s, o) => s + o.evPct, 0) / visible.length
    : 0;
  const best = visible[0];
  const eligible =
    selected &&
    filterOpportunities(
      [selected],
      { ...DEFAULT_FILTERS, minEv: 0, minScore: 0, maxOdds: 8 },
      now,
    ).length > 0;
  const tracked =
    selected && journal.bets.some((b) => b.opportunityId === selected.id);
  const binary =
    !selected?.marketIdentity ||
    selected.marketIdentity.settlement === "binary";
  const kelly =
    selected && binary
      ? bankroll *
        (selected.method?.stakeFraction ??
          fractionalKelly(selected.bookmakerOdds, 1 / selected.fairOdds))
      : 0;
  const roi = arbitrageRoiPct(arbOdds);
  const stakes = arbitrageStakes(arbOdds, arbStake);
  function filter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }
  function exportJournal() {
    const url = URL.createObjectURL(
      new Blob([betsCsv(displayedBets)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "cotescope-" + (journalDemo ? "demo" : "journal") + ".csv";
    link.click();
    URL.revokeObjectURL(url);
    notify(displayedBets.length + " pari(s) exporté(s).");
  }
  function exportProofs() {
    const data = {
      schema: "cotescope.journal.v2",
      exportedAt: new Date().toISOString(),
      demo: journalDemo,
      source: !journalDemo && allJournalSources ? "all" : mode,
      bets: displayedBets,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download =
      "cotescope-preuves-" + (journalDemo ? "demo" : "journal") + ".json";
    link.click();
    URL.revokeObjectURL(url);
  }
  function record() {
    if (
      !selected ||
      !eligible ||
      tracked ||
      !journal.loaded ||
      !Number.isFinite(stake) ||
      stake <= 0 ||
      (selected.method && (methodExposure > 0 || stake > bankroll * 0.01)) ||
      stake > bankroll - totalExposure
    )
      return;
    journal.update([createBet(selected, stake), ...journal.bets]);
    notify(
      isDemo
        ? "Simulation ajoutée au journal démo."
        : "Pari ajouté à votre journal.",
    );
    setSelected(null);
  }
  function updateBet(bet: Bet, changes: Partial<Bet>) {
    journal.update(
      journal.bets.map((b) =>
        b.id === bet.id
          ? {
              ...b,
              ...changes,
              capture: b.capture,
              updatedAt: new Date().toISOString(),
            }
          : b,
      ),
    );
  }
  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="CoteScope, accueil">
          <span className="brand-symbol">
            <Image
              src="/brands/cotescope-mark.svg"
              alt=""
              width={42}
              height={42}
            />
          </span>
          <span>
            Cote<span className="brand-light">Scope</span>
            <small>LE PRIX. PAS LE PRONOSTIC.</small>
          </span>
        </a>
        <div className="sidebar-label">ESPACE D’ANALYSE</div>
        <nav aria-label="Navigation principale">
          {NAV.map(([label, icon]) => (
            <button
              key={label}
              onClick={() => setNav(label === "Outils" ? "Arbitrages" : label)}
              className={primaryNav === label ? "nav-item active" : "nav-item"}
              aria-current={primaryNav === label ? "page" : undefined}
              aria-label={label}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {label === "Scanner" && (
                <small>{visible.length.toString().padStart(2, "0")}</small>
              )}
              {label === "Journal" && displayedBets.length > 0 && (
                <small>{displayedBets.length}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="bankroll-card">
            <div>
              <Icon name="wallet" size={17} />
              <span>Bankroll de référence</span>
            </div>
            <strong>{money(bankroll)}</strong>
            <button onClick={() => setNav("Paramètres")}>
              Ajuster les paramètres <Icon name="arrow" size={14} />
            </button>
          </div>
          <p>
            <span className="status-dot" />{" "}
            {journal.cloud === "connected"
              ? "Journal synchronisé"
              : "Journal local"}
          </p>
          <span className="sidebar-version">COTESCOPE / FR · 02</span>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <a className="mobile-brand" href="/" aria-label="CoteScope, accueil">
            <Image
              src="/brands/cotescope-mark.svg"
              alt=""
              width={28}
              height={28}
            />
            <span>CoteScope</span>
          </a>
          <div className="breadcrumb">
            Espace personnel <span>/</span> <strong>{nav}</strong>
          </div>
          <div className="topbar-actions">
            <span
              className={
                "mode-tag " +
                (engineView ? "" : isDemo ? "demo" : error ? "offline" : "")
              }
            >
              <span className="status-dot" />
              {paperView
                ? "Test automatique virtuel"
                : engineView
                  ? "Simulations cotes-value"
                  : nav === "Journal" || (nav === "Performance" && performanceView === "journal")
                    ? "Journal · " + journalSourceLabel
                  : loading
                    ? "Actualisation"
                    : isDemo
                      ? "Démonstration"
                      : error
                        ? "Indisponible"
                        : source === "cotes-value"
                          ? "Cotes-value"
                          : source === "cotescope"
                            ? "CoteScope robuste"
                            : "Cache live"}
            </span>
            <button
              className="icon-button"
              aria-label="Ouvrir les paramètres"
              onClick={() => setNav("Paramètres")}
            >
              <Icon name="settings" />
            </button>
          </div>
        </header>
        <div className="page-content" ref={pageContent} key={primaryNav}>
          <div
            className={
              "page-heading" + (nav === "Scanner" ? " scanner-heading" : "")
            }
          >
            {nav === "Scanner" && (
              <Image
                src="/media/sports-night.webp"
                alt=""
                fill
                sizes="(max-width: 600px) 100vw, (max-width: 1000px) 85vw, 75vw"
                priority
                className="scanner-cover"
              />
            )}
            <div>
              <div className="eyebrow">
                {nav === "Scanner"
                  ? "L’AVANTAGE EST DANS LES DÉTAILS"
                  : "VOTRE LABORATOIRE DE VALUE"}
              </div>
              <h1>
                {nav === "Scanner"
                  ? "Repérez le bon prix."
                  : nav === "Journal"
                    ? "Gardez une trace."
                    : nav === "Performance"
                      ? "Mesurez votre méthode."
                      : nav === "Arbitrages"
                        ? "Équilibrez les issues."
                        : nav === "Méthode"
                          ? "La méthode, à livre ouvert."
                          : nav === "Comparaison"
                            ? "Évaluez les deux méthodes."
                            : "Votre cadre de travail."}
              </h1>
              <p>
                {nav === "Scanner"
                  ? "Comparez les cotes. Comprenez l’écart. Décidez avec méthode."
                  : nav === "Journal"
                    ? "Vos prises enregistrées, leurs mises et leurs résultats, par source."
                    : nav === "Performance"
                      ? engineView
                        ? "Les simulations publiées, leurs résultats et les clôtures vérifiables."
                        : paperView
                          ? "Une bankroll virtuelle de 1 000 €, suivie automatiquement côté serveur."
                          : "Des résultats réalisés, un échantillon visible, aucune promesse."
                      : nav === "Arbitrages"
                        ? "Un calculateur pour répartir une mise entre des issues exclusives."
                        : nav === "Méthode"
                          ? "Ce qui est mesuré, ce qui est estimé et ce qu’il reste à vérifier."
                          : nav === "Comparaison"
                            ? "Les décisions, les résultats disponibles et les limites de la comparaison."
                            : "Bankroll, accès aux données et synchronisation du journal."}
              </p>
            </div>
            {feedView && (
              <button
                className="button secondary refresh-button"
                onClick={() => void load()}
                disabled={loading}
              >
                <Icon name="refresh" size={16} />
                {loading ? "Actualisation…" : "Actualiser"}
              </button>
            )}
          </div>
          {feedView && (
            <div className="feed-toolbar">
              <div className="segmented" aria-label="Source des données">
                <button
                  className={mode === "cotescope" ? "active" : ""}
                  aria-pressed={mode === "cotescope"}
                  onClick={() => {
                    setMode("cotescope");
                    setAllJournalSources(false);
                    setSelected(null);
                  }}
                >
                  CoteScope
                </button>
                <button
                  className={mode === "demo" ? "active" : ""}
                  aria-pressed={mode === "demo"}
                  onClick={() => {
                    setMode("demo");
                    setAllJournalSources(false);
                    setSelected(null);
                  }}
                >
                  Démo
                </button>
                <button
                  className={mode === "live" ? "active" : ""}
                  aria-pressed={mode === "live"}
                  onClick={() => {
                    setMode("live");
                    setAllJournalSources(false);
                    setSelected(null);
                  }}
                >
                  Live
                </button>
                <button
                  className={mode === "cotes-value" ? "active" : ""}
                  aria-pressed={mode === "cotes-value"}
                  onClick={() => {
                    setMode("cotes-value");
                    setAllJournalSources(false);
                    setSelected(null);
                  }}
                >
                  Cotes-value
                </button>
              </div>
              <p>
                {isDemo
                  ? "Données illustratives · aucun prix réel"
                  : source === "cotes-value"
                    ? "Flux réel · marchés contrôlés · consensus prioritaire"
                    : source === "cotescope"
                      ? "Méthode robuste · avantage prudent · prix cotes-value"
                      : "Snapshots serveur · les cotes peuvent évoluer"}
              </p>
              {updated && !error && (
                <span className="last-update">
                  <Icon name="clock" size={13} />
                  Lecture à {shortTime(updated)}
                </span>
              )}
            </div>
          )}
          {nav === "Scanner" && mode === "cotescope" && diagnostics && (
            <details className="panel decision-diagnostics">
              <summary>
                {diagnostics.selected} sélection(s) CoteScope ·{" "}
                {diagnostics.candidates} candidats publiés examinés
              </summary>
              <p>
                Une sélection par match reconnu. Les seuils sont fixes ; la
                rentabilité de cette méthode reste à mesurer.{" "}
                {diagnostics.invalidRows} ligne(s) invalide(s) exclue(s).
              </p>
              <dl className="decision-reasons">
                {Object.entries(diagnostics.rejected).map(([reason, count]) => (
                  <div key={reason}>
                    <dt>{REJECTION_LABELS[reason] || reason}</dt>
                    <dd>{count}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          {error && feedView && (
            <div role="alert" className="notice warning">
              <Icon name="info" />
              <span>{error}</span>
              <button onClick={() => setMode("demo")}>
                Explorer la démo <Icon name="arrow" size={15} />
              </button>
            </div>
          )}
          {journal.storageError && (
            <div role="alert" className="notice warning">
              Le stockage du navigateur est indisponible. Exportez votre journal
              avant de fermer cette page.
            </div>
          )}
          {nav === "Scanner" && (
            <ScannerView
              filters={filters}
              items={items}
              visible={visible}
              books={books}
              sports={sports}
              isDemo={isDemo}
              source={source}
              average={average}
              best={best}
              loading={loading}
              error={error}
              filter={filter}
              setFilters={setFilters}
              setNav={setNav}
              onSelect={(item) => {
                setStake(10);
                setSelected(item);
              }}
            />
          )}
          {nav === "Journal" && (
            <JournalView
              isDemo={journalDemo}
              sourceLabel={journalSourceLabel}
              otherSourceCount={otherSourceCount}
              allSources={allJournalSources}
              setAllSources={setAllJournalSources}
              displayedBets={displayedBets}
              stats={stats}
              journal={journal}
              journalFilter={journalFilter}
              setJournalFilter={setJournalFilter}
              updateBet={updateBet}
              notify={notify}
              setNav={setNav}
              exportJournal={exportJournal}
              exportProofs={exportProofs}
            />
          )}
          {nav === "Performance" && (
            <PerformanceView
              view={performanceView}
              setView={setPerformanceView}
              isDemo={journalDemo}
              displayedBets={displayedBets}
              stats={stats}
              setNav={setNav}
            />
          )}
          {toolsView && (
            <>
              <SectionTabs
                id="tools"
                label="Outils d’analyse"
                value={nav}
                onChange={setNav}
                tabs={[
                  { id: "Arbitrages", label: "Arbitrages" },
                  { id: "Méthode", label: "Méthode" },
                  { id: "Comparaison", label: "Comparaison" },
                ]}
              />
              <div
                role="tabpanel"
                id={`tools-${nav}-panel`}
                aria-labelledby={`tools-${nav}-tab`}
                tabIndex={0}
              >
                {nav === "Arbitrages" && (
                  <ArbitrageView
                    isDemo={isDemo}
                    arbOdds={arbOdds}
                    setArbOdds={setArbOdds}
                    arbStake={arbStake}
                    setArbStake={setArbStake}
                    roi={roi}
                    stakes={stakes}
                    arbs={arbs}
                  />
                )}
                {nav === "Méthode" && <MethodView isDemo={isDemo} />}
                {nav === "Comparaison" && <MethodComparisonView />}
              </div>
            </>
          )}
          {nav === "Paramètres" && (
            <SettingsView
              bankroll={bankroll}
              setBankroll={setBankroll}
              journal={journal}
              notify={notify}
            />
          )}
          <footer className="footer">
            <span>
              <span className="footer-brand">CoteScope</span> Une méthode. Pas
              une promesse.
            </span>
            <span>
              18+ · Risque de perte · Joueurs Info Service : 09 74 75 13 13
            </span>
          </footer>
        </div>
      </main>
      <dialog
        ref={dialog}
        className="detail-dialog"
        onCancel={() => setSelected(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelected(null);
        }}
      >
        {selected && (
          <div className="dialog-inner">
            <div className="dialog-top">
              <span className="eyebrow">
                ANALYSE DU PRIX {isDemo && "· DÉMO"}
              </span>
              <button
                className="icon-button"
                aria-label="Fermer l’analyse"
                onClick={() => setSelected(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            <span className="event-meta">
              {selected.competition} · {time(selected.startTime)}
            </span>
            <h2>{selected.event}</h2>
            <p className="dialog-selection">
              {selected.selection} <span>· {selected.market}</span>
            </p>
            <div className="detail-prices">
              <div>
                <span>{selected.bookmaker}</span>
                <strong>{number(selected.bookmakerOdds, 2)}</strong>
                <small>Cote proposée</small>
              </div>
              <Icon name="arrow" />
              <div>
                <span>{selected.reference || "Pinnacle"}</span>
                <strong>{number(selected.fairOdds, 2)}</strong>
                <small>Cote juste estimée</small>
              </div>
              <div className="detail-ev">
                <span>Écart estimé</span>
                <strong>{percent(selected.evPct)}</strong>
                <small>
                  {binary ? "EV théorique" : "Écart de prix conditionnel"}
                </small>
              </div>
            </div>
            <div className="formula">
              <span>LE CALCUL</span>
              <code>
                {number(selected.bookmakerOdds, 2)} /{" "}
                {number(selected.fairOdds, 2)} − 1 = {percent(selected.evPct)}
              </code>
            </div>
            <div className="detail-facts">
              <span>
                {binary ? "Probabilité estimée" : "Probabilité conditionnelle"}{" "}
                <strong>{number(100 / selected.fairOdds)} %</strong>
              </span>
              <span>
                Âge du relevé{" "}
                <strong>{Math.round(quoteAge(selected, now))} s</strong>
              </span>
              <span>
                Cote brute référence{" "}
                <strong>
                  {selected.referenceOdds > 1
                    ? number(selected.referenceOdds, 2)
                    : "Non conservée"}
                </strong>
              </span>
            </div>
            {selected.references && selected.references.length > 0 && (
              <div className="reference-list">
                <span className="eyebrow">RÉFÉRENCES PUBLIÉES</span>
                {selected.references.map((r) => (
                  <div key={r.name}>
                    <span>
                      {r.name}
                      <small className="reference-stamp">
                        Lecture {time(r.observedAt)}
                      </small>
                    </span>
                    <strong>{number(r.fairOdds, 2)}</strong>
                  </div>
                ))}
              </div>
            )}
            {selected.evidence && <EvidenceView evidence={selected.evidence} />}
            <p className="quality-note">
              <Icon name="info" size={16} />
              {selected.qualityNote ||
                "Score heuristique : les composantes de qualité ne sont pas toutes mesurées."}
            </p>
            <div className="stake-panel">
              {selected.method && (
                <div className="notice method-proof">
                  <strong>CoteScope · {selected.method.version}</strong>
                  <p>
                    Avantage central {percent(selected.method.nominalEdgePct)} →
                    prudent {percent(selected.method.conservativeEdgePct)}.
                    Retrait de{" "}
                    {number(selected.method.probabilityBuffer * 100, 2)} points
                    de probabilité ; {selected.method.referenceCount}{" "}
                    référence(s) horodatée(s). Ce scénario de stress ne
                    constitue pas un intervalle de confiance.
                  </p>
                </div>
              )}
              <h3>Simuler la mise</h3>
              {binary ? (
                <p>
                  Quart de Kelly : <strong>{money(kelly)}</strong> · plafond{" "}
                  {selected.method ? "1" : "2"} % de {money(bankroll)}. Ce
                  calcul suppose une probabilité correcte.
                </p>
              ) : (
                <p>
                  Remboursement ou règlement partiel possible. Le Kelly binaire
                  et l’espérance en euros sont désactivés : ils nécessitent les
                  probabilités de chaque scénario de règlement.
                </p>
              )}
              <label>
                Mise à enregistrer (€)
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={stake}
                  onChange={(e) => setStake(Number(e.target.value))}
                />
              </label>
              <div className="stake-results">
                <span>
                  Gain si entièrement gagné{" "}
                  <strong>{money(stake * (selected.bookmakerOdds - 1))}</strong>
                </span>
                <span>
                  Perte si entièrement perdu{" "}
                  <strong className="text-danger">−{money(stake)}</strong>
                </span>
                <span>
                  Espérance théorique{" "}
                  <strong className="text-accent">
                    {binary
                      ? money((stake * selected.evPct) / 100)
                      : "Non calculée"}
                  </strong>
                </span>
              </div>
            </div>
            {!eligible && (
              <div className="notice warning">
                Signal périmé ou bloqué par le garde-fou. L’enregistrement est
                désactivé.
              </div>
            )}
            {stake > bankroll - totalExposure && (
              <p className="text-danger">
                La mise dépasse la bankroll disponible après exposition.
              </p>
            )}
            {selected.method &&
              (methodExposure > 0 || stake > bankroll * 0.01) && (
                <p className="text-danger">
                  CoteScope limite les prises à 1 % de la bankroll et à une
                  prise ouverte par match reconnu.
                </p>
              )}
            <button
              className="button primary full-width"
              disabled={
                Boolean(
                  selected.method &&
                    (methodExposure > 0 || stake > bankroll * 0.01),
                ) ||
                !eligible ||
                !!tracked ||
                !journal.loaded ||
                !Number.isFinite(stake) ||
                stake <= 0 ||
                stake > bankroll - totalExposure
              }
              onClick={record}
            >
              <Icon name={tracked ? "check" : "plus"} size={17} />
              {tracked
                ? "Déjà dans le journal"
                : isDemo
                  ? "Ajouter au journal démo"
                  : "Enregistrer ma prise"}
            </button>
            <p className="fine-print">
              {isDemo
                ? "Simulation uniquement. Aucune donnée n’est envoyée au cloud."
                : "Vérifiez la cote et le marché chez le bookmaker. Ceci enregistre une prise déclarée ; aucun pari n’est placé."}
            </p>
          </div>
        )}
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
