#!/usr/bin/env node
// Offline replay only. Never makes a provider request or uses outcomes in selection.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { createHash } = require("node:crypto");
const { loadTS } = require("../tests/load-ts.cjs");
const { decideCoteScope, candidateKey, DECISION_POLICY, METHOD_VERSION } =
  loadTS("src/lib/decisionEngine.ts");
const { adaptCotesValue } = loadTS("src/lib/cotesValue.ts");
const { engineProfit } = loadTS("src/lib/engineHistory.ts");
const options = process.argv.slice(2);
const get = (flag) => options[options.indexOf(flag) + 1];
if (!options.includes("--data-dir") || !options.includes("--out")) {
  console.error(
    "Usage: node scripts/compare-methods.cjs --data-dir DIRECTORY --out REPORT.json",
  );
  process.exit(2);
}
const dir = path.resolve(get("--data-dir"));
const files = fs
  .readdirSync(dir)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl\.gz$/.test(f))
  .sort();
if (!files.length) throw Error("Missing detection archives");
const snapshots = new Map(),
  receipts = [];
let rowCount = 0,
  missingReferenceTime = 0,
  missingAssociation = 0,
  rawReferenceRows = 0;
const firstSeen = new Map();
for (const file of files) {
  const bytes = fs.readFileSync(path.join(dir, file));
  const rows = zlib
    .gunzipSync(bytes)
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  receipts.push({
    file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    rows: rows.length,
  });
  for (const row of rows) {
    const t = Date.parse(row.detecte);
    if (!Number.isFinite(t))
      throw Error("Invalid detection timestamp in " + file);
    snapshots.set(t, [...(snapshots.get(t) || []), row]);
    const key = candidateKey(row);
    firstSeen.set(key, Math.min(firstSeen.get(key) ?? Infinity, t));
    rowCount++;
    if (!row.lu_reference) missingReferenceTime++;
    if (row.score_association == null) missingAssociation++;
    if (row.reference === "Pinnacle brut") rawReferenceRows++;
  }
}
const selections = { baseline: [], cotescope: [] };
const seen = { baseline: new Set(), cotescope: new Set() },
  seenEvents = new Set();
const rejected = {},
  perDay = {};
for (const [t, rows] of [...snapshots].sort(([a], [b]) => a - b)) {
  const day = new Date(t).toISOString().slice(0, 10);
  perDay[day] ||= { snapshots: 0, rows: 0, baseline: 0, cotescope: 0 };
  perDay[day].snapshots++;
  perDay[day].rows += rows.length;
  const own = decideCoteScope(rows, t);
  for (const [reason, count] of Object.entries(own.diagnostics.rejected))
    rejected[reason] = (rejected[reason] || 0) + count;
  const baseline = adaptCotesValue(rows, t).opportunities.filter(
    (o) => o.marketIdentity?.settlement === "binary" && o.bookmakerOdds <= 6,
  );
  for (const [method, candidates] of [
    ["baseline", baseline],
    ["cotescope", own.opportunities],
  ]) {
    for (const o of candidates) {
      const key = o.id.replace(/^(cv|cs)-/, "");
      if (
        seen[method].has(key) ||
        (method === "cotescope" && seenEvents.has(o.method.eventKey))
      )
        continue;
      seen[method].add(key);
      if (method === "cotescope") seenEvents.add(o.method.eventKey);
      selections[method].push({
        key,
        detectedAt: new Date(t).toISOString(),
        startTime: o.startTime,
        odds: o.bookmakerOdds,
        edgePct: o.evPct,
        event: o.event,
        sport: o.sport,
        eventKey: o.method?.eventKey,
      });
      perDay[day][method]++;
    }
  }
}
// Settlement labels are joined only AFTER every selection is frozen.
const settlementFile = fs.readFileSync(path.join(dir, "settlements.json"));
const history = JSON.parse(settlementFile);
const outcomes = new Map();
const allowed = new Set([
  "gagne",
  "perdu",
  "demi_gagne",
  "demi_perdu",
  "rembourse",
]);
let invalidSettlements = 0;
for (const row of history) {
  const start = Date.parse(row.debut),
    settled = Date.parse(row.regle_le);
  if (!allowed.has(row.statut)) continue;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(settled) ||
    settled < start ||
    typeof row.mise !== "number" ||
    row.mise <= 0 ||
    typeof row.cote !== "number" ||
    typeof row.gain !== "number" ||
    Math.abs(engineProfit(row.statut, row.mise, row.cote) - row.gain) > 0.02
  ) {
    invalidSettlements++;
    continue;
  }
  const key = candidateKey(row);
  if (!outcomes.has(key)) outcomes.set(key, new Set());
  outcomes.get(key).add(row.statut);
}
const evaluate = (trades) => {
  let settled = 0,
    missing = 0,
    conflicting = 0,
    profit = 0,
    wins = 0,
    losses = 0,
    voids = 0;
  const matched = [];
  for (const trade of trades) {
    const labels = outcomes.get(trade.key);
    if (!labels) {
      missing++;
      continue;
    }
    if (labels.size !== 1) {
      conflicting++;
      continue;
    }
    const status = [...labels][0];
    const unit = engineProfit(status, 1, trade.odds);
    settled++;
    profit += unit;
    if (status === "gagne") wins++;
    else if (status === "perdu") losses++;
    else if (status === "rembourse") voids++;
    matched.push({ ...trade, status, profitUnits: unit });
  }
  return {
    selected: trades.length,
    settled,
    missing,
    conflicting,
    coveragePct: trades.length ? (settled / trades.length) * 100 : null,
    flatStakeProfitUnits: profit,
    flatStakeRoiPct: settled ? (profit / settled) * 100 : null,
    wins,
    losses,
    voids,
    averageQuotedEdgePct: trades.length
      ? trades.reduce((s, t) => s + t.edgePct, 0) / trades.length
      : null,
    matched,
  };
};
const baseline = evaluate(selections.baseline),
  cotescope = evaluate(selections.cotescope);
const common = new Set(
  baseline.matched
    .filter((b) => cotescope.matched.some((c) => c.key === b.key))
    .map((b) => b.key),
);
const report = {
  schema: "cotescope.comparison.v1",
  methodVersion: METHOD_VERSION,
  generatedAt: new Date().toISOString(),
  sourceRevision: options.includes("--source-revision")
    ? get("--source-revision")
    : null,
  period: { from: files[0].slice(0, 10), to: files.at(-1).slice(0, 10) },
  policy: DECISION_POLICY,
  sources: receipts,
  settlementsSha256: createHash("sha256").update(settlementFile).digest("hex"),
  quality: {
    rows: rowCount,
    snapshots: snapshots.size,
    distinctCandidates: firstSeen.size,
    rawReferenceRows,
    missingReferenceTime,
    missingAssociation,
    invalidSettlements,
  },
  baseline: { ...baseline, matched: undefined },
  cotescope: { ...cotescope, matched: undefined },
  commonSelections: common.size,
  perDay,
  rejected,
  conclusion:
    "Comparaison exploratoire conditionnelle aux candidats déjà publiés par cotes-value. Aucune supériorité démontrée.",
  limitations: [
    `${files.length} jour(s) seulement ; dernier jour partiel. Aucun échantillon prospectif indépendant.`,
    "Archives présélectionnées par cotes-value à partir de 2 % d’écart : les prix et paris non publiés sont absents.",
    "Référence de comparaison : ancien adaptateur contrôlé, marchés binaires et cotes ≤ 6 ; pas toutes les simulations Python.",
    "Prises à la première détection admissible. CoteScope limite à une prise par match reconnu ; la référence peut cumuler plusieurs marchés.",
    "Mise fixe de 1 unité, sans capitalisation, limites opérateurs, commission ni frais ; ROI sur prises réglées, remboursements inclus.",
    "Règlements publiés avec gain cohérent et heure postérieure au début ; résultats indépendants non vérifiés.",
    "Résultats manquants et conflits exclus du ROI et conservés dans le décompte de couverture. Les cohortes réglées peuvent différer.",
    "Probabilités, correspondances et contrôle des marchés fournis par le collecteur existant ; pas de modèle sportif autonome.",
    "Seuils et poids heuristiques fixes. La marge prudente ne constitue pas une borne statistique.",
  ],
};
fs.mkdirSync(path.dirname(path.resolve(get("--out"))), { recursive: true });
fs.writeFileSync(get("--out"), JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      quality: report.quality,
      baseline: report.baseline,
      cotescope: report.cotescope,
      commonSelections: common.size,
      perDay,
    },
    null,
    2,
  ),
);
