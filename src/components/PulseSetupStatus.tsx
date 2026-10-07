"use client";
import { useEffect, useState } from "react";
import type { PulsePilot } from "@/lib/pulsePilot";
export default function PulseSetupStatus() {
  const [state, setState] = useState("loading");
  const [pilot, setPilot] = useState<PulsePilot | null>(null);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/pulsescore/status", { cache: "no-store", signal: c.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const d = await r.json();
        setState(d.configured ? "configured" : "missing");
        setPilot(d.lastPilot || null);
      })
      .catch(() => {
        if (!c.signal.aborted) setState("error");
      });
    return () => c.abort();
  }, []);
  return (
    <section className="pulse-setup-status">
      <h3>PulseScore Pro</h3>
      <p>
        {state === "loading"
          ? "Lecture de la configuration…"
          : state === "configured"
            ? pilot
              ? "Clé configurée côté serveur."
              : "Clé configurée côté serveur. L’accès API reste à vérifier."
            : state === "missing"
              ? "Clé à renseigner dans les secrets de l’environnement sous le nom PULSESCORE_KEY."
              : "État de la configuration indisponible."}
      </p>
      {pilot && (
        <div className="pulse-pilot-result">
          <p>
            Dernier contrôle {pilot.ok ? "réussi" : "en échec"} le{" "}
            {new Date(pilot.checkedAt).toLocaleString("fr-FR", {
              timeZone: "Europe/Paris",
              timeZoneName: "short",
            })}{" "}
            · {pilot.bookmaker} / {pilot.sport} · 1 requête
            {pilot.events === null ? "" : ` · ${pilot.events} matchs`}.
          </p>
          {pilot.ok &&
            pilot.missingPriceTimestamps !== null &&
            pilot.missingPriceTimestamps > 0 && (
              <p>
                Horodatages de prix non identifiés :{" "}
                {pilot.missingPriceTimestamps}/{pilot.events}. L’heure de
                lecture ne garantit pas l’âge des cotes.
              </p>
            )}
          <p className="fine-print">
            Ce résultat décrit ce contrôle passé ; il ne valide pas une clé
            remplacée depuis.
          </p>
        </div>
      )}
      <p className="fine-print">
        Les fichiers publiés de cotes-value restent accessibles sans clé ici. Le
        contrôle direct est explicite, limité à une requête. Aucune collecte
        payante ne démarre en ouvrant cette page.
      </p>
    </section>
  );
}
