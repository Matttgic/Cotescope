import { number, percent, shortTime } from "@/lib/format";
import { DEFAULT_FILTERS, type Filters } from "@/lib/scanner";
import type { Opportunity } from "@/lib/types";
import { useState } from "react";
import Icon from "./Icon";
import SectionTabs from "./SectionTabs";
import Stat from "./Stat";
import EventVisual from "./EventVisual";
import BookmakerBadge from "./BookmakerBadge";
import SportGlyph from "./SportGlyph";

type Props = {
  filters: Filters;
  items: Opportunity[];
  visible: Opportunity[];
  books: string[];
  sports: string[];
  isDemo: boolean;
  source: string;
  average: number;
  best?: Opportunity;
  loading: boolean;
  error: string;
  filter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  setFilters: (filters: Filters) => void;
  setNav: (nav: string) => void;
  onSelect: (item: Opportunity) => void;
};
export default function ScannerView({
  filters,
  items,
  visible,
  books,
  sports,
  isDemo,
  source,
  average,
  best,
  loading,
  error,
  filter,
  setFilters,
  setNav,
  onSelect,
}: Props) {
  const [tab, setTab] = useState("opportunities");
  const activeFilters = Object.keys(DEFAULT_FILTERS).filter(
    (key) =>
      key !== "sort" &&
      filters[key as keyof Filters] !== DEFAULT_FILTERS[key as keyof Filters],
  ).length;
  return (
    <>
      <SectionTabs
        id="scanner"
        label="Vues du scanner"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "opportunities", label: "Opportunités" },
          { id: "filters", label: "Filtres" },
          { id: "overview", label: "Synthèse" },
        ]}
      />
      {tab === "opportunities" && (
        <div
          className="sports-strip"
          role="group"
          aria-label="Filtrer rapidement par sport"
        >
          {["Tous", ...sports].map((sport) => (
            <button
              key={sport}
              aria-label={
                sport === "Tous"
                  ? "Afficher tous les sports"
                  : `Afficher : ${sport}`
              }
              aria-pressed={filters.sport === sport}
              onClick={() => filter("sport", sport)}
            >
              {sport === "Tous" ? (
                <Icon name="layers" size={16} />
              ) : (
                <SportGlyph sport={sport} size={16} />
              )}
              <span>
                {sport === "Tous"
                  ? "Tous"
                  : sport === "Football"
                    ? "Foot"
                    : sport === "Basketball"
                      ? "Basket"
                      : sport}
              </span>
            </button>
          ))}
        </div>
      )}
      <div
        role="tabpanel"
        id={`scanner-${tab}-panel`}
        aria-labelledby={`scanner-${tab}-tab`}
        tabIndex={0}
      >
        {tab === "opportunities" && (
          <section className="scanner-panel">
            <div className="section-heading">
              <div>
                <h2>
                  Les opportunités{" "}
                  <span className="count-badge">{visible.length}</span>
                </h2>
                <p>
                  {isDemo
                    ? "Exemples pour explorer votre stratégie de sélection."
                    : "Les signaux de plus de 15 minutes sont écartés."}
                </p>
              </div>
              <label className="sort-select">
                <span>Trier par</span>
                <select
                  aria-label="Trier les opportunités"
                  value={filters.sort}
                  onChange={(e) => filter("sort", e.target.value)}
                >
                  <option value="quality">Qualité</option>
                  <option value="ev">Écart de cote</option>
                  <option value="time">Heure du match</option>
                </select>
              </label>
            </div>
            <div className="scanner-quick-controls">
              <label className="search-field">
                <Icon name="search" size={17} />
                <input
                  aria-label="Rechercher un match"
                  placeholder="Équipe, match, compétition…"
                  value={filters.search}
                  onChange={(e) => filter("search", e.target.value)}
                />
              </label>
              <button
                className="button secondary"
                onClick={() => setTab("filters")}
              >
                <Icon name="settings" size={16} />
                Filtres
                {activeFilters > 0 && (
                  <span className="count-badge">{activeFilters}</span>
                )}
              </button>
              {activeFilters > 0 && (
                <button
                  className="text-button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                >
                  Réinitialiser
                </button>
              )}
            </div>
            <div className="opportunity-table">
              <div className="table-head">
                <span>Événement / sélection</span>
                <span>Bookmaker</span>
                <span>Cote / juste</span>
                <span>Écart estimé</span>
                <span>Qualité</span>
                <span />
              </div>
              {loading && !items.length ? (
                <div className="empty-state">
                  <div className="loading-ring" />
                  <h3>Lecture du radar…</h3>
                </div>
              ) : (
                visible.map((item) => (
                  <button
                    className="opportunity-row"
                    key={item.id}
                    onClick={() => onSelect(item)}
                    aria-label={
                      "Analyser " + item.event + ", " + item.selection
                    }
                  >
                    <span className="event-cell">
                      <EventVisual sport={item.sport} event={item.event} />
                      <span>
                        <span className="event-meta">
                          {item.competition}{" "}
                          <span>· {shortTime(item.startTime)}</span>
                        </span>
                        <strong>{item.event}</strong>
                        <span className="selection-text">
                          {item.selection}
                          <span> · {item.market}</span>
                        </span>
                      </span>
                    </span>
                    <span className="book-cell">
                      <BookmakerBadge name={item.bookmaker} />
                    </span>
                    <span className="odds-cell">
                      <strong>{number(item.bookmakerOdds, 2)}</strong>
                      <span>{number(item.fairOdds, 2)} juste</span>
                    </span>
                    <span className="ev-cell">
                      <strong>{percent(item.evPct)}</strong>
                      <span>EV théorique</span>
                    </span>
                    <span className="quality-cell">
                      <span>
                        <strong>{item.opportunityScore}</strong>
                        <small>/100</small>
                      </span>
                      <span className="score-track">
                        <i style={{ width: item.opportunityScore + "%" }} />
                      </span>
                    </span>
                    <span className="row-arrow">
                      <Icon name="arrow" size={17} />
                    </span>
                  </button>
                ))
              )}
              {!loading && visible.length === 0 && (
                <div className="empty-state">
                  <Icon name="radar" size={32} />
                  <h3>
                    {error
                      ? "Le radar attend ses données."
                      : "Aucun signal dans cette sélection."}
                  </h3>
                  <p>
                    {error
                      ? "Passez en démonstration pour découvrir les outils."
                      : "Essayez un autre sport ou assouplissez vos filtres."}
                  </p>
                  {!error && (
                    <button
                      className="button secondary"
                      onClick={() => setFilters(DEFAULT_FILTERS)}
                    >
                      Réinitialiser les filtres
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="table-footer">
              <span>
                <span className="status-dot" /> {visible.length} opportunités
                après filtres
              </span>
              <span>
                Cliquez sur une ligne pour analyser le prix{" "}
                <Icon name="arrow" size={13} />
              </span>
            </div>
          </section>
        )}
        {tab === "filters" && (
          <section className="scanner-panel scanner-filter-panel">
            <div className="section-heading">
              <div>
                <h2>Affinez votre sélection</h2>
                <p>
                  {visible.length} opportunités correspondent à vos filtres.
                </p>
              </div>
            </div>
            <div className="filters">
              <label className="search-field">
                <Icon name="search" size={17} />
                <input
                  aria-label="Rechercher un match"
                  placeholder="Équipe, match, compétition…"
                  value={filters.search}
                  onChange={(e) => filter("search", e.target.value)}
                />
              </label>
              <label>
                <span>Sport</span>
                <select
                  aria-label="Sport"
                  value={filters.sport}
                  onChange={(e) => filter("sport", e.target.value)}
                >
                  <option value="Tous">Tous les sports</option>
                  {sports.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Bookmaker</span>
                <select
                  aria-label="Bookmaker"
                  value={filters.bookmaker}
                  onChange={(e) => filter("bookmaker", e.target.value)}
                >
                  <option value="Tous">Tous les bookmakers</option>
                  {books.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Marché</span>
                <select
                  aria-label="Marché"
                  value={filters.market}
                  onChange={(e) => filter("market", e.target.value)}
                >
                  <option value="Tous">Tous les marchés</option>
                  {[
                    ...new Set(
                      items.map((o) => o.marketIdentity?.code || o.market),
                    ),
                  ]
                    .sort()
                    .map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                </select>
              </label>
              <label>
                <span>EV minimum</span>
                <select
                  aria-label="EV minimum"
                  value={filters.minEv}
                  onChange={(e) => filter("minEv", Number(e.target.value))}
                >
                  {[0, 2, 3, 5, 7].map((v) => (
                    <option key={v} value={v}>
                      {v} %
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="filter-details">
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={filters.guarded}
                  onChange={(e) => filter("guarded", e.target.checked)}
                />
                <span className="switch" />
                <Icon name="shield" size={14} />
                Garde-fou grosses cotes
              </label>
              <label>
                Cote max.{" "}
                <select
                  aria-label="Cote maximale"
                  value={filters.maxOdds}
                  onChange={(e) => filter("maxOdds", Number(e.target.value))}
                >
                  {[2, 3, 4, 6, 8].map((v) => (
                    <option key={v} value={v}>
                      {number(v, 2)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Score min.{" "}
                <select
                  aria-label="Score minimum"
                  value={filters.minScore}
                  onChange={(e) => filter("minScore", Number(e.target.value))}
                >
                  {[0, 70, 80, 85].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="text-button"
                onClick={() => setFilters(DEFAULT_FILTERS)}
              >
                Réinitialiser
              </button>
            </div>
            <div className="scanner-filter-actions">
              <button
                className="button primary"
                onClick={() => setTab("opportunities")}
              >
                Voir les opportunités ({visible.length})
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </section>
        )}
        {tab === "overview" && (
          <>
            <section className="hero-panel">
              <div className="hero-copy">
                <span className="eyebrow">
                  <span className="status-dot" /> RADAR DE VALUE
                </span>
                <h2>
                  Le marché fixe la cote.
                  <br />
                  <span>Vous mesurez la valeur.</span>
                </h2>
                <p>
                  Une cote attractive ne suffit pas. Priorité aux écarts
                  positifs, aux relevés récents et aux marchés cohérents.
                </p>
                <div className="hero-foot">
                  <span>
                    <Icon name="shield" size={16} />
                    Garde-fou {filters.guarded ? "activé" : "désactivé"}
                  </span>
                  <span>
                    {source === "cotes-value"
                      ? "France · Multi-référence"
                      : "France · Référence Pinnacle"}
                  </span>
                </div>
              </div>
              <div className="radar-visual" aria-hidden="true">
                <svg viewBox="0 0 300 240">
                  <defs>
                    <radialGradient id="radar-glow">
                      <stop stopColor="#949cff" stopOpacity=".18" />
                      <stop offset="1" stopColor="#949cff" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  <circle cx="155" cy="120" r="116" fill="url(#radar-glow)" />
                  {[30, 59, 89, 116].map((r) => (
                    <circle
                      key={r}
                      cx="155"
                      cy="120"
                      r={r}
                      fill="none"
                      stroke="#949cff"
                      strokeOpacity=".16"
                    />
                  ))}
                  <path
                    d="M39 120h232M155 4v232M73 38l164 164M73 202 237 38"
                    stroke="#949cff"
                    strokeOpacity=".10"
                  />
                  <path
                    d="M155 120 209 17a116 116 0 0 1 62 103Z"
                    fill="#949cff"
                    fillOpacity=".06"
                  />
                  <path
                    d="M155 120 254 61"
                    stroke="#949cff"
                    strokeOpacity=".65"
                  />
                  {[
                    [208, 76],
                    [92, 146],
                    [185, 161],
                  ].map(([x, y], i) => (
                    <g key={i}>
                      <circle
                        cx={x}
                        cy={y}
                        r="10"
                        fill="#949cff"
                        fillOpacity=".09"
                      />
                      <circle cx={x} cy={y} r="3" fill="#949cff" />
                    </g>
                  ))}
                </svg>
                <span className="radar-label">
                  DÉTECTER / COMPARER / MESURER
                </span>
              </div>
            </section>
            <section className="stats-grid" aria-label="Résumé du scanner">
              <Stat
                label="Opportunités retenues"
                value={visible.length.toString().padStart(2, "0")}
                detail={items.length + " signaux dans le relevé"}
                icon="radar"
              />
              <Stat
                label="Écart moyen"
                value={visible.length ? percent(average) : "—"}
                detail="EV estimée après filtres"
                icon="up"
                positive
              />
              <Stat
                label="Meilleur score"
                value={best ? best.opportunityScore + "/100" : "—"}
                detail="Heuristique, pas une probabilité"
                icon="shield"
              />
              <Stat
                label="Bookmakers couverts"
                value={books.length.toString().padStart(2, "0")}
                detail="Présents dans ce relevé"
                icon="layers"
              />
            </section>
            <div className="insight-grid">
              <article className="insight-card">
                <span className="insight-icon">
                  <Icon name="shield" size={21} />
                </span>
                <div>
                  <h3>La discipline avant l’écart.</h3>
                  <p>
                    Au-delà de 4,00 : score ≥ 85, EV ≥ 5 % et cote ≤ 8,00. Un
                    grand écart peut aussi signaler une erreur de marché.
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label="Voir la méthode"
                  onClick={() => setNav("Méthode")}
                >
                  <Icon name="arrow" />
                </button>
              </article>
              <article className="insight-card">
                <span className="insight-icon blue">
                  <Icon name="chart" size={21} />
                </span>
                <div>
                  <h3>Une idée n’est pas un résultat.</h3>
                  <p>
                    Enregistrez vos prises réelles, puis mesurez le ROI sur les
                    paris réglés. La démo reste dans un journal séparé.
                  </p>
                </div>
                <button
                  className="icon-button"
                  aria-label="Ouvrir la performance"
                  onClick={() => setNav("Performance")}
                >
                  <Icon name="arrow" />
                </button>
              </article>
            </div>
          </>
        )}
      </div>
    </>
  );
}
