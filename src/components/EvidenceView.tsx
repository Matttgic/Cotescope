import { number } from "@/lib/format";
import type { Opportunity } from "@/lib/types";
const stamp = (v: string) =>
  Number.isFinite(Date.parse(v))
    ? new Date(v).toLocaleString("fr-FR", {
        timeZone: "Europe/Paris",
        timeZoneName: "short",
      })
    : "Non conservé";
export default function EvidenceView({
  evidence,
}: {
  evidence: NonNullable<Opportunity["evidence"]>;
}) {
  return (
    <section className="reference-list evidence-list">
      <h3>Preuves de comparaison</h3>
      <dl>
        <dt>Détection bookmaker</dt>
        <dd>{stamp(evidence.detectedAt)}</dd>
        <dt>Lecture de la référence</dt>
        <dd>{stamp(evidence.referenceReadAt)}</dd>
        <dt>Match de référence</dt>
        <dd>{evidence.referenceEvent}</dd>
        <dt>Identifiant de référence</dt>
        <dd>{evidence.referenceId}</dd>
        <dt>Équipes inversées</dt>
        <dd>
          {evidence.inverted === null
            ? "Non conservé"
            : evidence.inverted
              ? "Oui · ordre harmonisé par le moteur"
              : "Non"}
        </dd>
        <dt>Association des noms</dt>
        <dd>
          {evidence.association === null
            ? "Non conservée"
            : number(evidence.association, 3)}
        </dd>
        <dt>Contrôle du marché</dt>
        <dd>
          Conforme ·{" "}
          {evidence.controlCount === null
            ? "effectif non conservé"
            : `${evidence.controlCount} observations`}
          {evidence.controlMedian === null
            ? ""
            : ` · médiane ${number(evidence.controlMedian, 4)}`}
        </dd>
      </dl>
      {evidence.components.length > 0 && (
        <>
          <p className="eyebrow">COMPOSANTES DU CONSENSUS · COTES JUSTES</p>
          {evidence.components.map((c) => (
            <div key={c.name}>
              <span>{c.name}</span>
              <strong>{number(c.fairOdds, 3)}</strong>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
