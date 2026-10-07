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
            "Le collecteur fournit des probabilités de référence déjà corrigées de la marge. CoteScope les recalcule en une médiane pondérée, sans reprendre le Consensus publié : Pinnacle 1, Betfair 0,85, Polymarket et Kalshi 0,5. Ces poids sont heuristiques.",
          ],
          [
            "03",
            "Tester l’avantage prudent",
            "CoteScope retire 0,4 point de probabilité, la moitié du désaccord entre références et jusqu’à 0,4 point pour l’âge des prix. Une référence isolée ajoute 0,6 point. Le prix doit rester avantageux d’au moins 2 % après ce scénario de stress. Ce scénario n’est pas une borne statistique.",
          ],
          [
            "04",
            "Maîtriser l’exposition",
            "Une sélection par match reconnu, quart de Kelly sur la probabilité prudente et prises plafonnées à 1 % de la bankroll. Les marchés avec remboursement ou demi-règlement sont exclus de cette méthode faute de probabilités de règlement. Le journal conserve leur suivi dans le mode de comparaison cotes-value.",
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
            <span className="eyebrow">
              DÉCISION COTESCOPE · PRIX COTES-VALUE
            </span>
            <h2>Une meilleure sélection commence par une preuve.</h2>
          </div>
          <Icon name="shield" size={25} />
        </div>
        <div className="source-row">
          <span className="source-dot" />
          <strong>Pinnacle</strong>
          <span>
            Seule référence autorisée isolément : association ≥ 0,95 et relevé ≤
            3 minutes
          </span>
          <span className="pill">
            {isDemo ? "ILLUSTRATION" : "RÉFÉRENCE UNITAIRE"}
          </span>
        </div>
        <div className="source-row">
          <span className="source-dot muted-dot" />
          <strong>Betfair / Polymarket / Kalshi</strong>
          <span>
            Références unitaires horodatées ; association ≥ 0,90 et lecture à
            moins de 2 minutes du prix
          </span>
          <span className="pill">FLUX COTES-VALUE</span>
        </div>
        <div className="method-limits">
          <h3>Ce que le score ne dit pas</h3>
          <p>
            Le score représente une qualité documentaire heuristique. La méthode
            CoteScope ne prédit pas les performances sportives : elle évalue
            différemment les prix de référence publiés par le collecteur
            existant. Les composants sans horodatage propre et le Consensus
            agrégé ne comptent pas comme références supplémentaires. Aucun
            avantage de liquidité ou de stabilité temporelle n’est inventé. Les
            seuils ne sont pas ajustés aux gains historiques. La comparaison
            chronologique disponible dans Outils → Comparaison est trop courte
            pour démontrer un rendement supérieur.
          </p>
          <h3>Fraîcheur et données live</h3>
          <p>
            La collecte reste celle de cotes-value : son univers est déjà
            filtré. CoteScope écarte les matchs commencés, les relevés de plus
            de 15 minutes et les références désynchronisées. Une référence
            isolée expire après 3 minutes. Actualiser la page relit le flux
            public sans appel payant. La sélection par match dépend de
            l’identité disponible ; des alias différents peuvent empêcher de
            reconnaître deux événements identiques.
          </p>
        </div>
      </section>
    </>
  );
}
