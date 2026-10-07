import { money, number, percent, statuses, time } from "@/lib/format";
import { journalStats, profit, type Bet, type BetStatus } from "@/lib/journal";
import Icon from "./Icon";
import EvidenceView from "./EvidenceView";
import Stat from "./Stat";
import type { useJournal } from "./useJournal";

type Props = {
  isDemo: boolean;
  displayedBets: Bet[];
  stats: ReturnType<typeof journalStats>;
  journal: ReturnType<typeof useJournal>;
  journalFilter: string;
  setJournalFilter: (value: string) => void;
  updateBet: (bet: Bet, changes: Partial<Bet>) => void;
  notify: (message: string) => void;
  setNav: (nav: string) => void;
  exportJournal: () => void;
  exportProofs: () => void;
};
export default function JournalView({
  isDemo,
  displayedBets,
  stats,
  journal,
  journalFilter,
  setJournalFilter,
  updateBet,
  notify,
  setNav,
  exportJournal,
  exportProofs,
}: Props) {
  return (
    <>
      <section className="stats-grid">
        <Stat
          label="Paris enregistrés"
          value={String(displayedBets.length)}
          detail={
            isDemo
              ? "Journal de simulation séparé"
              : "Prises ajoutées volontairement"
          }
          icon="journal"
        />
        <Stat
          label="Exposition ouverte"
          value={money(stats.exposure)}
          detail="Somme des mises en cours"
          icon="wallet"
        />
        <Stat
          label="Profit réalisé"
          value={money(stats.net)}
          detail={stats.settled + " paris avec gain ou perte"}
          icon="chart"
          positive={stats.net > 0}
        />
        <Stat
          label="ROI réalisé"
          value={stats.roi === null ? "—" : percent(stats.roi)}
          detail="Mises avec gain ou perte · hors remboursements"
          icon="up"
        />
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>{isDemo ? "Journal de démonstration" : "Votre journal"}</h2>
            <p>
              {isDemo
                ? "Ces simulations ne sont jamais envoyées au cloud."
                : journal.cloud === "connected"
                  ? "Synchronisation cloud active."
                  : "Sauvegarde dans ce navigateur. Exportez pour conserver une copie."}
            </p>
          </div>
          <div className="inline-actions">
            <button
              className="button secondary"
              onClick={journal.sync}
              disabled={journal.cloud === "syncing"}
            >
              {journal.cloud === "syncing"
                ? "Synchronisation…"
                : "Synchroniser"}
            </button>
            <button
              className="button secondary"
              onClick={exportProofs}
              disabled={!displayedBets.length}
            >
              Exporter les preuves
            </button>
            <button
              className="button secondary"
              onClick={exportJournal}
              disabled={!displayedBets.length}
            >
              <Icon name="download" size={16} />
              Exporter CSV
            </button>
          </div>
        </div>
        {journal.cloudError && (
          <p className="notice warning" role="alert">
            {journal.cloudError}
          </p>
        )}
        <p className="fine-print">
          Les demi-gains et demi-pertes utilisent la moitié du gain ou de la
          perte. Le ROI du journal exclut les remboursements complets ; le bilan
          du moteur les inclut.
        </p>
        <div className="journal-tabs">
          {[
            ["all", "Tous"],
            ["open", "En cours"],
            ["settled", "Réglés"],
          ].map(([key, label]) => (
            <button
              className={journalFilter === key ? "active" : ""}
              key={key}
              onClick={() => setJournalFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {displayedBets
          .filter(
            (b) =>
              journalFilter === "all" ||
              (journalFilter === "open"
                ? b.status === "open"
                : b.status !== "open"),
          )
          .map((bet) => (
            <article className="bet-card" key={bet.id}>
              <div className="bet-event">
                <span className="event-meta">
                  {bet.sport} · {time(bet.createdAt)}
                </span>
                <h3>{bet.event}</h3>
                <p>
                  {bet.selection} · {bet.bookmaker} · @{number(bet.odds, 2)}
                </p>
              </div>
              <label>
                Mise (€)
                <input
                  aria-label={"Mise " + bet.event}
                  type="number"
                  min="0"
                  step="0.5"
                  value={bet.stake}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (Number.isFinite(value) && value >= 0)
                      updateBet(bet, { stake: value });
                  }}
                />
              </label>
              <label>
                Résultat
                <select
                  aria-label={"Résultat " + bet.event}
                  value={bet.status}
                  onChange={(e) =>
                    updateBet(bet, {
                      status: e.target.value as BetStatus,
                    })
                  }
                >
                  {Object.entries(statuses).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="bet-profit">
                <span>Profit net</span>
                <strong
                  className={
                    profit(bet) < 0
                      ? "text-danger"
                      : profit(bet) > 0
                        ? "text-accent"
                        : ""
                  }
                >
                  {money(profit(bet))}
                </strong>
              </div>
              <button
                className="icon-button"
                aria-label={"Supprimer " + bet.event}
                onClick={() => {
                  journal.remove(bet.id);
                  notify("Pari supprimé du journal.");
                }}
              >
                <Icon name="close" size={17} />
              </button>
              <details className="bet-capture">
                <summary>Preuves de la prise</summary>
                {bet.capture ? (
                  <div>
                    <p>
                      Capturée le {time(bet.capture.capturedAt)} · cote proposée{" "}
                      {number(bet.capture.bookmakerOdds, 3)} · cote juste{" "}
                      {number(bet.capture.fairOdds, 3)} ·{" "}
                      {bet.capture.reference}
                    </p>
                    <p>
                      Écart initial {percent(bet.capture.evPct)} ·{" "}
                      {bet.capture.marketIdentity?.label || bet.market} ·
                      lecture{" "}
                      {bet.capture.observedAt
                        ? time(bet.capture.observedAt)
                        : "non conservée"}
                      .
                    </p>
                    {bet.capture.evidence && (
                      <EvidenceView evidence={bet.capture.evidence} />
                    )}
                  </div>
                ) : (
                  <p className="muted">
                    Ancienne prise sans capture de prix. Aucune preuve n’est
                    reconstruite après coup.
                  </p>
                )}
              </details>
            </article>
          ))}
        {!displayedBets.length && (
          <div className="empty-state">
            <Icon name="journal" size={32} />
            <h3>Votre journal est une page blanche.</h3>
            <p>
              Ouvrez une opportunité dans le scanner et ajoutez votre prise.
            </p>
            <button
              className="button primary"
              onClick={() => setNav("Scanner")}
            >
              Explorer le scanner <Icon name="arrow" size={16} />
            </button>
          </div>
        )}
      </section>
    </>
  );
}
