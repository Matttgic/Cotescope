"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ENGINE_FILTERS,
  ENGINE_REFERENCES,
  ENGINE_STATUSES,
  engineStats,
  filterEngineBets,
  type EngineBet,
  type EngineFilters,
} from "@/lib/engineHistory";
import { money, percent, number, time } from "@/lib/format";
import Stat from "./Stat";
const BANDS: Record<string, string> = {
  A: "2 à 3 %",
  B: "3 à 4 %",
  C: "4 à 5 %",
  D: "5 à 7 %",
  E: "7 % et plus",
  X: "Cotes > 10 · ≥ 3 %",
};
const stamp = (v: string | null) =>
  v && Number.isFinite(Date.parse(v))
    ? new Date(v).toLocaleString("fr-FR", {
        timeZone: "Europe/Paris",
        timeZoneName: "short",
      })
    : "Non conservé";
export default function EnginePerformanceView() {
  const [bets, setBets] = useState<EngineBet[]>([]),
    [filters, setFilters] = useState<EngineFilters>(ENGINE_FILTERS);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [fetched, setFetched] = useState("");
  const [excluded, setExcluded] = useState(0),
    [page, setPage] = useState(0);
  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/cotes-value/history", {
        signal,
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.bets))
        throw new Error(
          "Historique cotes-value indisponible. Réessayez pour lire les simulations publiées.",
        );
      setBets(data.bets);
      setFetched(data.fetchedAt);
      setExcluded(data.excluded || 0);
      setPage(0);
    } catch (e) {
      if (!signal.aborted) {
        setBets([]);
        setError(e instanceof Error ? e.message : "Connexion indisponible.");
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    return () => c.abort();
  }, [load, reload]);
  const visible = useMemo(
    () => filterEngineBets(bets, filters),
    [bets, filters],
  );
  const stats = engineStats(visible);
  const change = (key: keyof EngineFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };
  const rows = visible.slice(page * 30, (page + 1) * 30);
  const dates = bets
    .map((b) => b.detectedAt)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return (
    <div className="engine-performance">
      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SIMULATIONS PUBLIÉES · COTES-VALUE</span>
            <h2>Le moteur à l’épreuve des résultats.</h2>
            <p>
              Fichier actif paris.json · archives mensuelles exclues. Aucune
              prise réelle n’est déduite de ces simulations.
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => setReload((v) => v + 1)}
            disabled={loading}
          >
            {loading ? "Chargement…" : "Actualiser le bilan"}
          </button>
        </div>
        {error && (
          <div className="notice warning" role="alert">
            {error}
          </div>
        )}
        {!loading && !error && (
          <p className="fine-print">
            {bets.length} lignes publiées acceptées · {excluded} écartées ·
            lecture {stamp(fetched)}
            {dates.length > 0 &&
              ` · détections du ${time(dates[0])} au ${time(dates[dates.length - 1])}`}
          </p>
        )}
        <div className="engine-filters">
          <label>
            Référence
            <select
              aria-label="Référence du bilan"
              value={filters.reference}
              onChange={(e) => change("reference", e.target.value)}
            >
              <option>Uniques</option>
              {ENGINE_REFERENCES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Tranche d’écart
            <select
              aria-label="Tranche d’écart"
              value={filters.simulation}
              onChange={(e) => change("simulation", e.target.value)}
            >
              <option value="Tous">Toutes</option>
              {Object.entries(BANDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {k} · {v}
                </option>
              ))}
            </select>
          </label>
          {(["sport", "bookmaker", "market"] as const).map((key) => (
            <label key={key}>
              {key === "sport"
                ? "Sport"
                : key === "bookmaker"
                  ? "Bookmaker"
                  : "Marché"}
              <select
                aria-label={`${key} du bilan`}
                value={filters[key]}
                onChange={(e) => change(key, e.target.value)}
              >
                <option value="Tous">Tous</option>
                {[
                  ...new Set(
                    bets.map((b) =>
                      key === "market" ? b.market.code : b[key],
                    ),
                  ),
                ]
                  .sort()
                  .map((v) => (
                    <option key={v}>{v}</option>
                  ))}
              </select>
            </label>
          ))}
          <label>
            Statut
            <select
              aria-label="Statut du bilan"
              value={filters.status}
              onChange={(e) => change("status", e.target.value)}
            >
              <option value="Tous">Tous</option>
              {Object.entries(ENGINE_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="engine-search">
            Rechercher
            <input
              type="search"
              aria-label="Rechercher dans le bilan"
              value={filters.search}
              onChange={(e) => change("search", e.target.value)}
              placeholder="Match, sélection, compétition…"
            />
          </label>
        </div>
        <p className="fine-print">
          Uniques : première détection par bookmaker, match, marché, période,
          ligne et issue, avant les filtres. Pinnacle brut : témoin avec marge,
          isolé des uniques.
        </p>
      </section>
      <section className="stats-grid">
        <Stat
          label="Profit simulé"
          value={loading || error ? "—" : money(stats.net)}
          detail={`${stats.verified} règlements arithmétiquement vérifiés`}
          icon="chart"
          positive={stats.net > 0}
        />
        <Stat
          label="ROI simulé"
          value={stats.roi === null ? "—" : percent(stats.roi)}
          detail={`${money(stats.stakes)} · remboursements inclus`}
          icon="up"
        />
        <Stat
          label="CLV de clôture"
          value={stats.clvPct === null ? "—" : percent(stats.clvPct)}
          detail={`${stats.clvCount} / ${stats.closed} réglés · moyenne non pondérée`}
          icon="check"
        />
        <Stat
          label="Exposition simulée"
          value={loading || error ? "—" : money(stats.exposure)}
          detail={`${stats.total - stats.closed} ouverts ou à régler`}
          icon="layers"
        />
      </section>
      <section className="panel method-note">
        <h3>Ce que ces chiffres permettent de vérifier</h3>
        <p>
          La CLV est recalculée à partir de la cote prise et de la cote juste de
          clôture, avec un relevé horodaté dans les 30 minutes avant le début.
          Les valeurs incohérentes et les paris ouverts sont exclus de sa
          moyenne. Avant le 7 octobre 2026, l’heure publiée peut être celle du
          cycle, à quelques minutes près.
        </p>
        <p>
          {stats.conflicts} règlement(s) incohérent(s) exclu(s) du ROI ·{" "}
          {stats.missingSettlementProof} règlement(s) sans preuve de score
          publiée. Un gain cohérent avec le statut ne valide pas le score du
          match. La rentabilité future ne se déduit pas de ce bilan.
        </p>
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Par tranche d’écart</h2>
            <p>
              Tranches disjointes du moteur · les autres filtres restent
              appliqués.
            </p>
          </div>
        </div>
        <div className="engine-band-grid">
          {Object.entries(BANDS).map(([band, label]) => {
            const s = engineStats(visible.filter((b) => b.simulation === band));
            return (
              <div className="engine-band" key={band}>
                <strong>
                  {band} · {label}
                </strong>
                <span>
                  {s.closed} réglés · ROI{" "}
                  {s.roi === null ? "—" : percent(s.roi)}
                </span>
                <span>
                  CLV {s.clvPct === null ? "—" : percent(s.clvPct)} ·{" "}
                  {s.clvCount}/{s.closed}
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>
              Chaque résultat, sa trace{" "}
              <span className="count-badge">{visible.length}</span>
            </h2>
            <p>
              Ouvrez une simulation pour vérifier les prix et les preuves
              publiées.
            </p>
          </div>
          <button
            className="text-button"
            onClick={() => {
              setFilters(ENGINE_FILTERS);
              setPage(0);
            }}
          >
            Réinitialiser le bilan
          </button>
        </div>
        {!loading && !visible.length && !error && (
          <p className="muted">Aucune simulation dans cette sélection.</p>
        )}
        {rows.map((b) => (
          <details className="engine-bet" key={b.id}>
            <summary>
              <span>
                <strong>{b.event}</strong>
                <small>
                  {b.bookmaker} · {b.reference} · {b.market.label}
                </small>
                <small>
                  {b.selection} · {time(b.detectedAt)}
                </small>
              </span>
              <span className="engine-outcome">
                <strong>{ENGINE_STATUSES[b.status]}</strong>
                <small
                  className={
                    b.profitVerified && b.profit! < 0
                      ? "text-danger"
                      : "text-accent"
                  }
                >
                  {b.profit === null
                    ? "En attente"
                    : b.profitVerified
                      ? money(b.profit)
                      : "Gain non vérifié"}
                </small>
                <small>CLV {b.clvPct === null ? "—" : percent(b.clvPct)}</small>
              </span>
            </summary>
            <div className="engine-proof">
              <dl>
                <dt>Cote prise / mise</dt>
                <dd>
                  {number(b.odds, 3)} / {money(b.stake)}
                </dd>
                <dt>Écart initial</dt>
                <dd>
                  {percent(b.evPct)} · tranche {b.simulation}
                </dd>
                <dt>Match de référence</dt>
                <dd>{b.referenceEvent || "Non conservé"}</dd>
                <dt>Lecture initiale</dt>
                <dd>{stamp(b.referenceReadAt)}</dd>
                <dt>Début du match</dt>
                <dd>{stamp(b.startTime)}</dd>
                <dt>Cote juste de clôture</dt>
                <dd>
                  {b.closingOdds === null
                    ? "Non conservée"
                    : number(b.closingOdds, 4)}
                </dd>
                <dt>Lecture de clôture</dt>
                <dd>{stamp(b.closingReadAt)}</dd>
                <dt>CLV retenue</dt>
                <dd>
                  {b.clvPct === null
                    ? b.clvReason
                    : `${percent(b.clvPct)} · ${b.clvReason}`}
                </dd>
                <dt>Gain publié</dt>
                <dd>
                  {b.reportedProfit === null
                    ? "Absent"
                    : money(b.reportedProfit)}{" "}
                  ·{" "}
                  {b.profit === null
                    ? "non réglé"
                    : b.profitVerified
                      ? "calcul cohérent avec le statut"
                      : "exclu du ROI"}
                </dd>
              </dl>
              <h4>Preuve de prise</h4>
              {b.takenProof ? (
                <pre>{JSON.stringify(b.takenProof, null, 2)}</pre>
              ) : (
                <p className="muted">Aucune preuve de prise publiée.</p>
              )}
              <h4>Preuve de règlement</h4>
              {b.settlementProof ? (
                <pre>{JSON.stringify(b.settlementProof, null, 2)}</pre>
              ) : (
                <p className="muted">
                  Aucune preuve de score publiée. Le statut provient du moteur.
                </p>
              )}
            </div>
          </details>
        ))}
        {visible.length > 30 && (
          <div className="engine-pagination">
            <button
              className="button secondary"
              disabled={page === 0}
              onClick={() => setPage((v) => v - 1)}
            >
              Précédent
            </button>
            <span>
              Page {page + 1} / {Math.ceil(visible.length / 30)}
            </span>
            <button
              className="button secondary"
              disabled={(page + 1) * 30 >= visible.length}
              onClick={() => setPage((v) => v + 1)}
            >
              Suivant
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
