"use client";
import { useState } from "react";
import { money } from "@/lib/format";
import Icon from "./Icon";
import PulseSetupStatus from "./PulseSetupStatus";
import SectionTabs from "./SectionTabs";
import type { useJournal } from "./useJournal";

export default function SettingsView({
  bankroll,
  setBankroll,
  journal,
  notify,
}: {
  bankroll: number;
  setBankroll: (value: number) => void;
  journal: ReturnType<typeof useJournal>;
  notify: (message: string) => void;
}) {
  const [tab, setTab] = useState("bankroll");
  const [syncDraft, setSyncDraft] = useState("");
  return (
    <>
      <SectionTabs
        id="settings"
        label="Rubriques des paramètres"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "bankroll", label: "Bankroll" },
          { id: "pulse", label: "PulseScore" },
          { id: "sync", label: "Synchronisation" },
        ]}
      />
      <section
        className="panel settings-panel"
        role="tabpanel"
        id={`settings-${tab}-panel`}
        aria-labelledby={`settings-${tab}-tab`}
        tabIndex={0}
      >
        {tab === "bankroll" && (
          <>
            <h2>Une bankroll, des limites.</h2>
            <p className="muted">
              Montant de référence pour les simulations de mise. Aucun compte
              bancaire n’est connecté.
            </p>
            <label className="settings-label">
              Bankroll de référence (€)
              <input
                type="number"
                min="1"
                max="1000000"
                value={bankroll}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isFinite(value) && value > 0 && value <= 1000000)
                    setBankroll(value);
                }}
              />
            </label>
            <div className="settings-info">
              <Icon name="shield" />
              <span>
                Quart de Kelly · plafond par prise{" "}
                <strong>{money(bankroll * 0.02)}</strong>
              </span>
            </div>
            <button
              className="button primary"
              onClick={() => {
                try {
                  localStorage.setItem("cotescope.bankroll", String(bankroll));
                  notify("Paramètres enregistrés.");
                } catch {
                  notify(
                    "Stockage indisponible : paramètres conservés pour cette session.",
                  );
                }
              }}
            >
              Enregistrer les paramètres
            </button>
          </>
        )}
        {tab === "pulse" && <PulseSetupStatus />}
        {tab === "sync" && (
          <div className="sync-settings">
            <h2>Votre journal entre appareils.</h2>
            <p>
              Cette clé donne accès à votre journal cloud. Conservez-la privée.
              Exportez votre journal avant de changer de clé : l’import remplace
              le journal local réel par celui de cette identité.
            </p>
            <button
              className="button secondary"
              disabled={!journal.key}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(journal.key);
                  notify("Clé de synchronisation copiée.");
                } catch {
                  notify("Le navigateur ne permet pas la copie.");
                }
              }}
            >
              Copier ma clé
            </button>
            <label>
              Clé à importer
              <input
                type="password"
                autoComplete="off"
                value={syncDraft}
                onChange={(e) => setSyncDraft(e.target.value)}
              />
            </label>
            <button
              className="button secondary"
              onClick={async () => {
                if (await journal.importKey(syncDraft)) {
                  setSyncDraft("");
                  notify("Identité changée ; connexion cloud en cours.");
                } else
                  notify("La clé doit contenir 64 caractères hexadécimaux.");
              }}
            >
              Importer la clé
            </button>
          </div>
        )}
      </section>
    </>
  );
}
