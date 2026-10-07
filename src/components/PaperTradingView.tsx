"use client";
import { useEffect, useState } from "react";
import { money, number, percent, time, statuses } from "@/lib/format";
import type { PaperMode, PaperState, PaperTrade } from "@/lib/paperTrading";
import { paperMetrics } from "@/lib/paperTrading";
import Stat from "./Stat";
type Portfolio = {
  mode: string;
  state: PaperState | null;
  metrics: ReturnType<typeof paperMetrics>;
  latest: PaperTrade[];
};
type Data = {
  version: string;
  simulation: boolean;
  cronConfigured: boolean;
  portfolios: Portfolio[];
};
export default function PaperTradingView() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [mode, setMode] = useState<PaperMode>("cotescope"),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const r = await fetch("/api/paper", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await r.json();
        if (!r.ok)
          throw Error(
            body.error === "database_not_configured"
              ? "La simulation attend une base Neon configurée."
              : "La simulation est momentanément indisponible.",
          );
        setData(body);
        setError("");
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Connexion indisponible.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [reload]);
  const portfolio = data?.portfolios.find((p) => p.mode === mode),
    m = portfolio?.metrics,
    state = portfolio?.state;
  const heartbeat = state?.lastCycleAt ? Date.parse(state.lastCycleAt) : 0;
  const stale = heartbeat > 0 && Date.now() - heartbeat > 20 * 60000;
  return (
    <div className="paper-view">
      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">TEST PROSPECTIF · ARGENT VIRTUEL</span>
            <h2>Votre bankroll se teste toute seule.</h2>
            <p>
              Trois portefeuilles de 1 000 € virtuels. Sélection, prises Kelly
              et règlements côté serveur, même lorsque le site est fermé.
            </p>
          </div>
          <button
            className="button secondary"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setReload((r) => r + 1);
            }}
          >
            Actualiser le test
          </button>
        </div>
        {error && (
          <div className="notice warning" role="alert">
            {error}
          </div>
        )}
        {data && (
          <div
            className={
              "notice " +
              (!heartbeat || stale || !data.cronConfigured ? "warning" : "")
            }
            role="status"
          >
            <strong>
              {!data.cronConfigured
                ? "Planification à configurer"
                : !heartbeat
                  ? "En attente du premier cycle automatique"
                  : stale
                    ? "Automatisation à vérifier"
                    : "Simulation automatique active"}
            </strong>
            <p>
              {!data.cronConfigured
                ? "Le même CRON_SECRET doit être configuré dans Vercel et GitHub Actions."
                : !heartbeat
                  ? "La tâche planifiée doit réussir pour commencer le test. Le bilan reste à 1 000 € tant qu’aucune prise n’est enregistrée."
                  : `Dernier cycle réussi : ${time(state!.lastCycleAt!)} · ${state!.cycleCount} cycle(s).`}
            </p>
          </div>
        )}
        <div
          className="segmented paper-mode"
          aria-label="Portefeuille de simulation"
        >
          <button
            className={mode === "cotescope" ? "active" : ""}
            aria-pressed={mode === "cotescope"}
            onClick={() => setMode("cotescope")}
          >
            CoteScope prudent
          </button>
          <button
            className={mode === "cotescope-balanced" ? "active" : ""}
            aria-pressed={mode === "cotescope-balanced"}
            onClick={() => setMode("cotescope-balanced")}
          >
            CoteScope équilibré
          </button>
          <button
            className={mode === "cotes-value" ? "active" : ""}
            aria-pressed={mode === "cotes-value"}
            onClick={() => setMode("cotes-value")}
          >
            Témoin cotes-value
          </button>
        </div>
        <p className="fine-print">
          Quart de Kelly · maximum 1 % de bankroll par prise · 10 % d’exposition
          totale · une prise par match reconnu · cotes ≤ 4. Les trois
          portefeuilles utilisent les mêmes limites de risque.
        </p>
        <p className="fine-print" data-testid="paper-profile">
          {mode === "cotescope-balanced"
            ? "Équilibré : pénalités de prudence de base, de référence unique et d’âge divisées par deux. Le seuil d’avantage de 2 %, la pénalité de désaccord et les contrôles de qualité sont conservés."
            : mode === "cotescope"
              ? "Prudent : marge de sécurité complète sur les probabilités, puis au moins 2 % d’avantage théorique."
              : "Témoin : sélections de l’adaptateur cotes-value avec les mêmes limites de mise et d’exposition."}
        </p>
      </section>
      {m && (
        <>
          <section className="stats-grid">
            <Stat
              label="Bankroll comptable"
              value={money(m.equity)}
              detail={"Départ " + money(m.initialBankroll)}
              icon="wallet"
            />
            <Stat
              label="Profit réalisé"
              value={money(m.net)}
              detail={m.settled + " prises réglées · virtuel"}
              icon="chart"
              positive={m.net > 0}
            />
            <Stat
              label="Cash disponible"
              value={money(m.cashAvailable)}
              detail={money(m.exposure) + " réservés aux prises ouvertes"}
              icon="shield"
            />
            <Stat
              label="ROI des prises réglées"
              value={m.roiPct === null ? "—" : percent(m.roiPct)}
              detail={
                money(m.settledStakes) +
                " de mises réglées, remboursements inclus"
              }
              icon="up"
            />
          </section>
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>La bankroll au fil des règlements.</h2>
                <p>
                  Les profits sont comptabilisés lorsque le résultat est lu,
                  sans réécrire la courbe dans le passé.
                </p>
              </div>
            </div>
            {m.curve.length < 2 ? (
              <div className="empty-chart">
                <h3>Le test commence à 1 000 €.</h3>
                <p>
                  La courbe évoluera après les premiers résultats disponibles.
                </p>
              </div>
            ) : (
              <PaperCurve values={m.curve.map((p) => p.value)} />
            )}
            <p className="fine-print">
              Évolution de bankroll {percent(m.returnPct)} · baisse maximale
              réalisée {number(m.maxDrawdownPct, 2)} % · {m.open} prises
              ouvertes · {m.pendingResults} résultats attendus.
            </p>
          </section>
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Les dernières prises automatiques.</h2>
                <p>
                  Prix simulés à la cote publiée ; aucune exécution chez un
                  bookmaker n’est supposée prouvée.
                </p>
              </div>
              <span className="pill">{m.trades} PRISE(S)</span>
            </div>
            {!portfolio?.latest.length && (
              <p className="muted">
                Aucun signal admissible depuis le démarrage du test. La
                simulation attend la prochaine collecte.
              </p>
            )}
            <div className="paper-trades">
              {portfolio?.latest.map((t) => (
                <details key={t.key} className="paper-trade">
                  <summary>
                    <span>
                      <strong>{t.event}</strong>
                      <small>
                        {t.selection} · {t.bookmaker}
                      </small>
                    </span>
                    <span>
                      {money(t.stake)} à {number(t.odds, 2)}
                      <small>
                        {statuses[t.status]}
                        {t.settlement ? " · " + money(t.settlement.profit) : ""}
                      </small>
                    </span>
                  </summary>
                  <p>
                    Prise {time(t.createdAt)} · {t.market} · avantage enregistré{" "}
                    {percent(t.price.evPct)}.{" "}
                    {t.price.method
                      ? `Méthode ${t.price.method.version}.`
                      : "Adaptateur cotes-value contrôlé."}
                  </p>
                  <p>
                    {t.settlement
                      ? `Résultat publié par cotes-value, lu le ${time(t.settlement.readAt)}.`
                      : "Les résultats absents ou contradictoires restent en attente ; aucun remboursement automatique n’est inventé."}
                  </p>
                </details>
              ))}
            </div>
          </section>
          <section className="panel method-note">
            <h2>Mesurer un test, pas promettre un rendement.</h2>
            <p>
              Test prospectif depuis{" "}
              {state ? time(state.startedAt) : "le premier cycle réussi"}. Les
              dates de départ des portefeuilles peuvent différer ; leurs bilans
              doivent être comparés sur une période commune. Les résultats
              proviennent du collecteur cotes-value ; les frais, limites
              opérateurs et écarts entre prix affiché et prix réellement
              disponible ne sont pas simulés. Les signaux non publiés par ce
              collecteur restent absents. Un petit échantillon positif ne prouve
              pas la rentabilité.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
function PaperCurve({ values }: { values: number[] }) {
  const min = Math.min(...values),
    max = Math.max(...values),
    range = Math.max(1, max - min);
  const points = values
    .map(
      (v, i) =>
        `${50 + (i / (values.length - 1)) * 660},${180 - ((v - min) / range) * 130}`,
    )
    .join(" ");
  return (
    <div className="equity-chart">
      <svg
        viewBox="0 0 760 220"
        role="img"
        aria-label={"Bankroll virtuelle : " + money(values.at(-1)!)}
      >
        <line x1="50" x2="710" y1="180" y2="180" stroke="#26324c" />
        <polyline
          points={points}
          fill="none"
          stroke="#a7abff"
          strokeWidth="3"
        />
        <text x="0" y="185" fill="#a2adc5" fontSize="12">
          {number(min, 0)} €
        </text>
        <text x="0" y="45" fill="#a2adc5" fontSize="12">
          {number(max, 0)} €
        </text>
        <text x="50" y="210" fill="#a2adc5" fontSize="12">
          Démarrage
        </text>
        <text x="710" y="210" textAnchor="end" fill="#a2adc5" fontSize="12">
          Dernier règlement lu
        </text>
      </svg>
    </div>
  );
}
