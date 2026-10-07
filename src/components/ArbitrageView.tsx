import { arbitrageRoiPct } from "@/lib/arbitrage";
import { money, number, percent } from "@/lib/format";
import type { Dispatch, SetStateAction } from "react";
import Icon from "./Icon";

type Props = {
  isDemo: boolean;
  arbOdds: number[];
  setArbOdds: Dispatch<SetStateAction<number[]>>;
  arbStake: number;
  setArbStake: (value: number) => void;
  roi: number;
  stakes: number[];
  arbs: Array<{
    id: string;
    event: string;
    outcomes: Array<{ selection: string; bookmaker: string; odds: number }>;
  }>;
};
export default function ArbitrageView({
  isDemo,
  arbOdds,
  setArbOdds,
  arbStake,
  setArbStake,
  roi,
  stakes,
  arbs,
}: Props) {
  return (
    <div className="analytics-grid">
      <section className="panel calculator">
        <span className="eyebrow">RÉPARTITION DE MISE</span>
        <h2>Deux issues, un calcul.</h2>
        <p>
          Utilisez uniquement des marchés identiques, exhaustifs et sans issue
          de remboursement.
        </p>
        <div className="calculator-inputs">
          {arbOdds.map((odds, i) => (
            <label key={i}>
              Cote issue {i + 1}
              <input
                type="number"
                aria-label={"Cote issue " + (i + 1)}
                min="1.01"
                step="0.01"
                value={odds}
                onChange={(e) =>
                  setArbOdds((current) =>
                    current.map((v, j) =>
                      j === i
                        ? Math.max(1.01, Number(e.target.value) || 1.01)
                        : v,
                    ),
                  )
                }
              />
            </label>
          ))}
          <label>
            Mise totale (€)
            <input
              type="number"
              min="1"
              step="1"
              value={arbStake}
              onChange={(e) =>
                setArbStake(Math.max(1, Number(e.target.value) || 1))
              }
            />
          </label>
        </div>
        <div className="calculator-result">
          <span>ROI théorique</span>
          <strong className={roi > 0 ? "text-accent" : ""}>
            {roi > 0 ? percent(roi) : "Pas d’arbitrage"}
          </strong>
          <p>
            {roi > 0
              ? "Issue 1 : " +
                money(stakes[0]) +
                " · Issue 2 : " +
                money(stakes[1])
              : "La somme des probabilités implicites est supérieure ou égale à 100 %."}
          </p>
          {roi > 0 && (
            <small>
              Gain minimum après arrondi :{" "}
              {money(
                Math.min(...arbOdds.map((o, i) => o * stakes[i])) -
                  stakes.reduce((s, v) => s + v, 0),
              )}
            </small>
          )}
        </div>
        <p className="fine-print">
          Les limites de mise, commissions, arrondis et règles de règlement
          peuvent supprimer l’avantage. Aucun placement automatique.
        </p>
      </section>
      <section className="panel">
        <h2>{isDemo ? "Exemples de démonstration" : "Détection live"}</h2>
        <p className="muted">
          {isDemo
            ? "Cliquez pour charger les cotes dans le calculateur."
            : "Le moteur d’arbitrage live n’est pas raccordé. Aucun arbitrage réel n’est annoncé."}
        </p>
        {isDemo &&
          arbs.map((arb) => (
            <button
              className="arb-example"
              key={arb.id}
              onClick={() => setArbOdds(arb.outcomes.map((o) => o.odds))}
            >
              <strong>{arb.event}</strong>
              <span>
                {arb.outcomes
                  .map((o) => o.bookmaker + " " + number(o.odds, 2))
                  .join(" · ")}
              </span>
              <b>{percent(arbitrageRoiPct(arb.outcomes.map((o) => o.odds)))}</b>
              <Icon name="arrow" size={15} />
            </button>
          ))}
      </section>
    </div>
  );
}
