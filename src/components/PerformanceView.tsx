import EnginePerformanceView from "./EnginePerformanceView";
import PaperTradingView from "./PaperTradingView";
import { money, number, percent } from "@/lib/format";
import { journalStats, type Bet } from "@/lib/journal";
import EquityChart from "./EquityChart";
import Icon from "./Icon";
import Stat from "./Stat";

type Props = {
  isDemo: boolean;
  displayedBets: Bet[];
  stats: ReturnType<typeof journalStats>;
  setNav: (value: string) => void;
  view: string;
  setView: (value: string) => void;
};
export default function PerformanceView({
  isDemo,
  displayedBets,
  stats,
  setNav,
  view,
  setView,
}: Props) {
  return (
    <>
      <div
        className="performance-tabs"
        role="group"
        aria-label="Source du bilan"
      >
        <button
          className={view === "paper" ? "button primary" : "button secondary"}
          aria-pressed={view === "paper"}
          onClick={() => setView("paper")}
        >
          Test automatique
        </button>
        <button
          className={view === "journal" ? "button primary" : "button secondary"}
          aria-pressed={view === "journal"}
          onClick={() => setView("journal")}
        >
          Mon journal
        </button>
        <button
          className={view === "engine" ? "button primary" : "button secondary"}
          aria-pressed={view === "engine"}
          onClick={() => setView("engine")}
        >
          Bilan cotes-value
        </button>
      </div>
      {view === "paper" ? (
        <PaperTradingView />
      ) : view === "engine" ? (
        <EnginePerformanceView />
      ) : (
        <>
          <section className="stats-grid">
            <Stat
              label="Profit réalisé"
              value={money(stats.net)}
              detail={isDemo ? "Simulations uniquement" : "Journal personnel"}
              icon="chart"
              positive={stats.net > 0}
            />
            <Stat
              label="ROI"
              value={stats.roi === null ? "—" : percent(stats.roi)}
              detail={money(stats.stakes) + " · hors remboursements"}
              icon="up"
            />
            <Stat
              label="Taux de réussite"
              value={
                stats.winRate === null ? "—" : number(stats.winRate) + " %"
              }
              detail={
                stats.hasPartial
                  ? "Demi-règlements · taux binaire non calculé"
                  : stats.settled + " paris gagnés ou perdus"
              }
              icon="check"
            />
            <Stat
              label="Échantillon"
              value={String(stats.settled)}
              detail={
                stats.settled < 100
                  ? "Trop petit pour conclure à un avantage"
                  : "À interpréter avec la variance et les cotes"
              }
              icon="layers"
            />
          </section>
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Le résultat de vos décisions</h2>
                <p>
                  Profit des paris réglés par date d’enregistrement · les mises
                  ouvertes sont exclues.
                </p>
              </div>
              <span className="pill">{isDemo ? "SIMULATION" : "JOURNAL"}</span>
            </div>
            <EquityChart bets={displayedBets} />
          </section>
          <div className="analytics-grid">
            <section className="panel">
              <h2>Par bookmaker</h2>
              {[...new Set(displayedBets.map((b) => b.bookmaker))].map(
                (book) => {
                  const s = journalStats(
                    displayedBets.filter((b) => b.bookmaker === book),
                  );
                  return (
                    <div className="breakdown" key={book}>
                      <strong>{book}</strong>
                      <span>{s.settled} réglés</span>
                      <span
                        className={s.net < 0 ? "text-danger" : "text-accent"}
                      >
                        {money(s.net)}
                      </span>
                      <span>{s.roi === null ? "—" : percent(s.roi)}</span>
                    </div>
                  );
                },
              )}
              {!displayedBets.length && (
                <p className="muted">
                  Les performances apparaîtront après vos premières prises.
                </p>
              )}
            </section>
            <section className="panel method-note">
              <Icon name="info" size={23} />
              <h2>Le ROI n’est qu’une partie de l’histoire.</h2>
              <p>
                Un petit échantillon peut être positif par hasard. La CLV exige
                une cote de clôture réellement relevée : elle n’est pas inventée
                ici.
              </p>
              <button className="text-button" onClick={() => setNav("Méthode")}>
                Comprendre les limites <Icon name="arrow" size={15} />
              </button>
            </section>
          </div>
        </>
      )}
    </>
  );
}
