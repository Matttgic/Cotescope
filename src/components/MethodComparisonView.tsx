import report from "@/data/method-comparison.json";
import { number, percent } from "@/lib/format";
export default function MethodComparisonView() {
  return (
    <section className="panel comparison-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            REPLAY CHRONOLOGIQUE · {report.methodVersion}
          </span>
          <h2>Comparer avant de conclure.</h2>
          <p>
            Archives publiques du {report.period.from} au {report.period.to}. La
            méthode décide à l’heure de chaque détection ; les règlements sont
            joints ensuite.
          </p>
        </div>
      </div>
      <div className="notice warning">
        <strong>
          Échantillon insuffisant pour démontrer un meilleur rendement.
        </strong>
        <p>
          {report.quality.rows.toLocaleString("fr-FR")} lignes examinées, dont{" "}
          {report.quality.rawReferenceRows.toLocaleString("fr-FR")} références
          brutes avec marge. Les candidats contrôlés admissibles apparaissent
          seulement dans la dernière journée.
        </p>
      </div>
      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Mesure</th>
              <th>Cotes-value contrôlé</th>
              <th>CoteScope robuste</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Sélections uniques</th>
              <td>{report.baseline.selected}</td>
              <td>{report.cotescope.selected}</td>
            </tr>
            <tr>
              <th>Résultats retrouvés</th>
              <td>{report.baseline.settled}</td>
              <td>{report.cotescope.settled}</td>
            </tr>
            <tr>
              <th>Sans résultat exploitable</th>
              <td>{report.baseline.missing + report.baseline.conflicting}</td>
              <td>{report.cotescope.missing + report.cotescope.conflicting}</td>
            </tr>
            <tr>
              <th>Couverture des résultats</th>
              <td>
                {report.baseline.coveragePct === null
                  ? "—"
                : number(report.baseline.coveragePct, 2) + " %"}
              </td>
              <td>
                {report.cotescope.coveragePct === null
                  ? "—"
                : number(report.cotescope.coveragePct, 2) + " %"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <details className="comparison-details">
        <summary>Voir les chiffres exploratoires et leurs limites</summary>
        <p>
          Mise fixe de 1 unité, sans frais, sur les seules prises réglées
          retrouvées. Ces groupes sont petits et différents ; leur ROI ne permet
          pas de classer les méthodes.
        </p>
        <p>
          Cotes-value contrôlé :{" "}
          {number(report.baseline.flatStakeProfitUnits, 2)} unités sur{" "}
          {report.baseline.settled} prises réglées (
          {report.baseline.flatStakeRoiPct === null
            ? "—"
            : percent(report.baseline.flatStakeRoiPct)}
          ). CoteScope : {number(report.cotescope.flatStakeProfitUnits, 2)}{" "}
          unités sur {report.cotescope.settled} prise(s) réglée(s) (
          {report.cotescope.flatStakeRoiPct === null
            ? "—"
            : percent(report.cotescope.flatStakeRoiPct)}
          ).
        </p>
        <ul>
          {report.limitations.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        <p>
          Rapport figé lors de la validation. Il ne représente pas les prises de
          votre journal personnel.
        </p>
      </details>
    </section>
  );
}
