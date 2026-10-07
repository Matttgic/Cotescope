import Icon from "./Icon";

type Props = { isDemo: boolean };
export default function MethodView({ isDemo }: Props) {
  return (
    <>
      <div className="method-grid">
        {[
          [
            "01",
            "Comparer le même marché",
            "Même match, même période, mêmes issues et mêmes règles de règlement. Le provider H2H écarte les marchés incomplets et les références dont la marge dépasse 12 %.",
          ],
          [
            "02",
            "Retirer la marge",
            "La méthode power transforme les cotes de toutes les issues en probabilités dont la somme vaut 100 %. Elle produit une estimation du marché, pas une vérité sur le match.",
          ],
          [
            "03",
            "Mesurer l’écart",
            "EV = cote bookmaker / cote juste − 1. Sur un pari binaire, +5 % correspond à +0,50 € attendus pour 10 € misés si la probabilité estimée est correcte. Avec remboursement ou demi-règlement, cet écart de prix n’est pas une espérance inconditionnelle.",
          ],
          [
            "04",
            "Maîtriser l’exposition",
            "Le quart de Kelly est réservé aux marchés binaires, plafonné à 2 % de la bankroll. Les grosses cotes demandent des contrôles supplémentaires. Les paris corrélés restent à examiner manuellement.",
          ],
        ].map(([n, title, body]) => (
          <article className="panel method-card" key={n}>
            <span className="method-number">{n}</span>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">INSPIRÉ DE COTES-VALUE</span>
            <h2>Une meilleure sélection commence par une preuve.</h2>
          </div>
          <Icon name="shield" size={25} />
        </div>
        <div className="source-row">
          <span className="source-dot" />
          <strong>Pinnacle</strong>
          <span>Référence H2H du moteur CoteScope</span>
          <span className="pill">
            {isDemo ? "ILLUSTRATION" : "CACHE SERVEUR"}
          </span>
        </div>
        <div className="source-row">
          <span className="source-dot muted-dot" />
          <strong>Betfair / Polymarket / Kalshi</strong>
          <span>Raccordés via le flux publié de cotes-value</span>
          <span className="pill">FLUX COTES-VALUE</span>
        </div>
        <div className="method-limits">
          <h3>Ce que le score ne dit pas</h3>
          <p>
            Le score est heuristique. Ce n’est ni un taux de réussite, ni une
            certitude de gain. Le consensus, la stabilité et la liquidité ne
            sont pas mesurés par le provider CoteScope actuel. Le mode
            Cotes-value regroupe les références d’une même cote, sélectionne le
            consensus disponible et écarte les marchés suspects ou non
            conformes. Les résultats, handicaps, totaux, doubles chances, scores
            exacts et périodes canoniques sont raccordés. Le bilan importe les
            simulations publiées avec leurs preuves de prise et de règlement
            lorsqu’elles existent. Les demi-règlements sont suivis dans le
            journal personnel et le bilan. Chaque nouvelle prise conserve les
            preuves disponibles au moment de son enregistrement.
          </p>
          <h3>Fraîcheur et données live</h3>
          <p>
            La console écarte les snapshots de plus de 15 minutes et les matchs
            commencés. Le collecteur exige des cotes de moins de 120 secondes.
            Actualiser la page lit le cache ; cela ne déclenche pas de collecte
            payante.
          </p>
        </div>
      </section>
    </>
  );
}
