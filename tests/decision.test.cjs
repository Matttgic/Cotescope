const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTS } = require("./load-ts.cjs");
const { decideCoteScope, DECISION_POLICY } = loadTS(
  "src/lib/decisionEngine.ts",
);
const { captureOpportunity, normalizeCapture } = loadTS(
  "src/lib/betCapture.ts",
);
const { filterOpportunities, DEFAULT_FILTERS } = loadTS("src/lib/scanner.ts");
const now = Date.parse("2026-10-07T18:00:00Z");
const row = (patch = {}) => ({
  bookmaker: "Winamax",
  sport: "football",
  ligue: "Ligue",
  match_id: "a",
  domicile: "A",
  exterieur: "B",
  debut: "2026-10-07T19:00:00Z",
  detecte: "2026-10-07T17:59:00Z",
  lu_reference: "2026-10-07T17:59:00Z",
  marche: "RESULTAT_1N2",
  periode: "MATCH",
  ligne: null,
  issue: "DOM",
  pari: "A",
  cote: 2.3,
  proba_juste: 0.5,
  reference: "Pinnacle",
  match_id_reference: "ref-a",
  match_reference: "A - B",
  score_association: 0.98,
  controle: { statut: "conforme", n: 1000, mediane: 0.95 },
  suspect: null,
  ...patch,
});
test("own decision does not trust upstream EV, Consensus, settlement or closing information", () => {
  const original = decideCoteScope([row()], now);
  const altered = decideCoteScope(
    [
      row({
        ecart: 99,
        statut: "perdu",
        gain: -100,
        cote_juste_cloture: 1.1,
        clv: 99,
      }),
      row({
        reference: "Consensus",
        proba_juste: 0.99,
        composantes: { Pinnacle: 1.01, Betfair: 1.01 },
      }),
    ],
    now,
  );
  assert.deepEqual(altered.opportunities, original.opportunities);
  assert.equal(original.opportunities.length, 1);
  const o = original.opportunities[0];
  assert.ok(o.evPct < o.method.nominalEdgePct);
  assert.ok(o.method.stakeFraction <= DECISION_POLICY.maxStakeFraction);
  assert.ok(
    Math.abs(o.evPct - (o.bookmakerOdds / o.fairOdds - 1) * 100) < 1e-10,
  );
});
test("a nominal 3 percent edge can be rejected by the independent stress policy", () => {
  const result = decideCoteScope([row({ cote: 2.06 })], now);
  assert.equal(result.opportunities.length, 0);
  assert.equal(result.diagnostics.rejected.edge, 1);
});
test("source duplicates, aggregates and untimed components cannot create corroboration", () => {
  const one = row({ reference: "Betfair" });
  const result = decideCoteScope(
    [
      one,
      one,
      row({ reference: "Consensus", composantes: { Pinnacle: 2, Betfair: 2 } }),
    ],
    now,
  );
  assert.equal(result.opportunities.length, 0);
  assert.equal(result.diagnostics.rejected.reference, 1);
  const accepted = decideCoteScope(
    [row(), row(), row({ reference: "Betfair", proba_juste: 0.49 })],
    now,
  ).opportunities[0];
  assert.equal(accepted.method.referenceCount, 2);
});
test("desynchronized, future, timezone-less and weakly matched evidence is rejected", () => {
  for (const patch of [
    { lu_reference: "2026-10-07T17:54:00Z" },
    { lu_reference: "2026-10-07T18:02:00Z" },
    { detecte: "2026-10-07T17:59:00" },
    { score_association: 0.89 },
    { match_id_reference: null },
    { debut: "2026-10-07T17:00:00Z" },
    { suspect: "marché incorrect" },
    { controle: null },
  ])
    assert.equal(
      decideCoteScope([row(patch)], now).opportunities.length,
      0,
      JSON.stringify(patch),
    );
  assert.equal(
    decideCoteScope([row({ score_association: 0.92 })], now).opportunities
      .length,
    0,
  );
  assert.equal(
    decideCoteScope(
      [
        row({ score_association: 0.92 }),
        row({ reference: "Betfair", score_association: 0.92 }),
      ],
      now,
    ).opportunities.length,
    1,
  );
});
test("latest quote is used even if it eliminates an earlier favourable edge", () => {
  const later = row({
    detecte: "2026-10-07T18:00:00Z",
    lu_reference: "2026-10-07T18:00:00Z",
    cote: 1.9,
  });
  assert.equal(decideCoteScope([row(), later], now).opportunities.length, 0);
});
test("refunds, split settlements and isolated high odds are not given a binary recommendation", () => {
  for (const patch of [
    { marche: "DRAW_NO_BET" },
    { marche: "TOTAL", issue: "PLUS", ligne: 2 },
    { marche: "TOTAL", issue: "PLUS", ligne: 2.25 },
    { cote: 5, proba_juste: 0.23 },
  ])
    assert.equal(decideCoteScope([row(patch)], now).opportunities.length, 0);
});
test("median and stress buffer reduce sensitivity to optimistic references and reject severe disagreement", () => {
  const one = decideCoteScope(
    [row(), row({ reference: "Betfair", proba_juste: 0.49 })],
    now,
  ).opportunities[0];
  const three = decideCoteScope(
    [
      row(),
      row({ reference: "Betfair", proba_juste: 0.49 }),
      row({ reference: "Kalshi", proba_juste: 0.55 }),
    ],
    now,
  ).opportunities[0];
  assert.equal(three.method.centralProbability, 0.5);
  assert.ok(
    three.method.conservativeProbability < one.method.conservativeProbability,
  );
  assert.equal(
    decideCoteScope(
      [row(), row({ reference: "Betfair", proba_juste: 0.35 })],
      now,
    ).opportunities.length,
    0,
  );
});
test("only one market and bookmaker per recognized event is selected, deterministically", () => {
  const rows = [
    row(),
    row({ bookmaker: "Betclic", match_id: "b", cote: 2.35 }),
    row({ marche: "TOTAL", ligne: 2.5, issue: "PLUS", pari: "Plus de 2.5" }),
  ];
  const result = decideCoteScope(rows, now);
  assert.equal(result.opportunities.length, 1);
  assert.equal(result.opportunities[0].bookmaker, "Betclic");
  assert.equal(result.diagnostics.rejected.exposure, 2);
  assert.deepEqual(decideCoteScope([...rows].reverse(), now), result);
});
test("decision evidence survives capture and malformed estimates are rejected", () => {
  const item = decideCoteScope([row()], now).opportunities[0];
  const capture = captureOpportunity(item, new Date(now).toISOString());
  assert.deepEqual(capture.method, item.method);
  assert.deepEqual(normalizeCapture(capture), capture);
  assert.equal(
    normalizeCapture({
      ...capture,
      method: { ...capture.method, conservativeProbability: 0.9 },
    }),
    null,
  );
  assert.equal(
    normalizeCapture({
      ...capture,
      method: { ...capture.method, stakeFraction: 0.5 },
    }),
    null,
  );
});
test("solo reference expires on the client before the general 15-minute limit", () => {
  const item = decideCoteScope([row()], now).opportunities[0];
  assert.equal(
    filterOpportunities([item], DEFAULT_FILTERS, now + 121000).length,
    0,
  );
});
