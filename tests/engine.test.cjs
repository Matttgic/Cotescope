const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTS } = require("./load-ts.cjs");
const { identifyMarket } = loadTS("src/lib/markets.ts");
const { adaptCotesValue } = loadTS("src/lib/cotesValue.ts");
const h = loadTS("src/lib/engineHistory.ts");
const now = Date.parse("2026-10-07T18:00:00Z");
const row = (patch = {}) => ({
  id: "p",
  match_id: "m",
  bookmaker: "Winamax",
  sport: "football",
  ligue: "Ligue 1",
  domicile: "A",
  exterieur: "B",
  marche: "RESULTAT_1N2",
  periode: "MATCH",
  ligne: null,
  issue: "DOM",
  pari: "A",
  reference: "Pinnacle",
  simulation: "A",
  detecte: "2026-10-07T15:00:00Z",
  debut: "2026-10-07T17:00:00Z",
  lu_reference: "2026-10-07T14:59:00Z",
  cote: 2.2,
  mise: 10,
  ecart: 0.025,
  statut: "gagne",
  gain: 12,
  cote_juste_cloture: 2,
  clv: 0.1,
  cloture_lue: "2026-10-07T16:45:00Z",
  ...patch,
});
test("canonical markets validate issues, periods and lines without guessing", () => {
  for (const patch of [
    { periode: "MATCH?" },
    { marche: "UNKNOWN" },
    { marche: "constructor" },
    { marche: "TOTAL", ligne: null, issue: "PLUS" },
    { marche: "TOTAL", ligne: 2.3, issue: "PLUS" },
    { marche: "TOTAL", ligne: -1, issue: "PLUS" },
    { issue: "HOME" },
    { marche: "CORRECT_SCORE", issue: "2:1" },
    { marche: "HANDICAP_3", ligne: 0.5 },
  ])
    assert.equal(identifyMarket(row(patch)), null);
  assert.equal(
    identifyMarket(row({ marche: "DOUBLE_CHANCE", issue: "HOME_DRAW" }))
      .settlement,
    "binary",
  );
  assert.equal(
    identifyMarket(row({ marche: "DRAW_NO_BET" })).settlement,
    "refund",
  );
  for (const [line, model] of [
    [2, "refund"],
    [2.5, "binary"],
    [2.25, "split"],
  ])
    assert.equal(
      identifyMarket(
        row({
          marche: "JEUX_TOTAL",
          ligne: line,
          issue: "PLUS",
          periode: "SET1",
        }),
      ).settlement,
      model,
    );
});
test("broader scanner keeps periods and lines distinct and preserves proof", () => {
  const base = {
    debut: "2026-10-07T19:00:00Z",
    detecte: "2026-10-07T17:59:00Z",
    lu_reference: "2026-10-07T17:58:00Z",
    proba_juste: 0.5,
    controle: { statut: "conforme", n: 500, mediane: 0.9 },
    score_association: 0.92,
    reference_inversee: true,
    match_id_reference: "ref-m",
    match_reference: "B — A",
  };
  const data = adaptCotesValue(
    [
      row({ ...base, marche: "TOTAL", ligne: 2.5, issue: "PLUS" }),
      row({ ...base, marche: "TOTAL", ligne: 2.25, issue: "PLUS" }),
      row({
        ...base,
        marche: "TOTAL",
        ligne: 2.5,
        issue: "PLUS",
        periode: "MT1",
      }),
      row({
        ...base,
        marche: "DOUBLE_CHANCE",
        issue: "HOME_DRAW",
        proba_juste: 0.7,
        cote: 1.5,
      }),
    ],
    now,
  );
  assert.equal(data.opportunities.length, 4);
  assert.equal(new Set(data.opportunities.map((x) => x.id)).size, 4);
  assert.deepEqual(
    data.opportunities.map((x) => x.marketIdentity.settlement),
    ["binary", "split", "binary", "binary"],
  );
  assert.equal(data.opportunities[0].evidence.referenceId, "ref-m");
  assert.equal(data.opportunities[0].evidence.inverted, true);
  assert.equal(data.opportunities[0].evidence.controlCount, 500);
  assert.ok(Math.abs(data.opportunities[3].fairOdds - 1 / 0.7) < 1e-10); // Never renormalize overlapping double-chance outcomes.
});
test("CLV uses verified near-kickoff prices, never open or misplaced observations", () => {
  assert.ok(Math.abs(h.closingValue(row(), now).clvPct - 10) < 1e-10);
  assert.notEqual(
    h.closingValue(row({ cloture_lue: "2026-10-07T16:30:00Z" }), now).clvPct,
    null,
  );
  for (const patch of [
    { statut: "en_cours" },
    { statut: "a_regler" },
    { statut: "invented" },
    { cloture_lue: null },
    { cloture_lue: "2026-10-07T16:45:00" },
    { cloture_lue: "2026-10-07T17:00:00Z" },
    { cloture_lue: "2026-10-07T17:01:00Z" },
    { cloture_lue: "2026-10-07T16:29:59Z" },
    { clv: null },
    { clv: 0.5 },
    { cote_juste_cloture: 0 },
    { debut: "2026-10-08T17:00:00Z" },
  ])
    assert.equal(
      h.closingValue(row(patch), now).clvPct,
      null,
      JSON.stringify(patch),
    );
});
test("unique selection is first detection before threshold filters and reference tie-break", () => {
  const input = [
    row({ id: "early", simulation: "A", detecte: "2026-10-07T15:00:00Z" }),
    row({
      id: "later",
      reference: "Betfair",
      simulation: "E",
      detecte: "2026-10-07T15:01:00Z",
    }),
    row({
      id: "raw",
      reference: "Pinnacle brut",
      detecte: "2026-10-07T14:00:00Z",
    }),
    row({ id: "tied", reference: "Consensus" }),
    row({ id: "different-period", periode: "MT1" }),
  ];
  const data = h.adaptEngineHistory(input, now);
  assert.equal(data.excluded, 0);
  assert.deepEqual(
    h.uniqueEngineBets(data.bets).map((b) => b.id),
    ["early", "different-period"],
  );
  assert.equal(
    h.filterEngineBets(data.bets, { ...h.ENGINE_FILTERS, simulation: "E" })
      .length,
    0,
  );
  assert.equal(
    h.filterEngineBets(data.bets, {
      ...h.ENGINE_FILTERS,
      reference: "Betfair",
      simulation: "E",
    }).length,
    1,
  );
});
test("ROI includes refunds and partial settlements, excludes inconsistent gains", () => {
  const rows = [
    row(),
    row({ id: "refund", statut: "rembourse", gain: 0 }),
    row({ id: "halfwin", statut: "demi_gagne", gain: 6 }),
    row({ id: "halfloss", statut: "demi_perdu", gain: -5 }),
    row({ id: "open", statut: "en_cours", gain: 0 }),
    row({ id: "bad", gain: 100 }),
  ];
  const s = h.engineStats(h.adaptEngineHistory(rows, now).bets);
  assert.equal(s.stakes, 40);
  assert.ok(Math.abs(s.net - 13) < 1e-10);
  assert.ok(Math.abs(s.roi - 32.5) < 1e-10);
  assert.equal(s.closed, 5);
  assert.equal(s.verified, 4);
  assert.equal(s.conflicts, 1);
  assert.equal(s.exposure, 10);
  assert.equal(s.missingSettlementProof, 5);
  assert.equal(s.clvCount, 5);
});
test("history rejects duplicate, malformed and ambiguous rows while keeping missing evidence explicit", () => {
  const data = h.adaptEngineHistory(
    [
      row(),
      row(),
      row({ id: "invalid", mise: null }),
      row({ id: "ambiguous", periode: "MATCH?" }),
      row({ id: "bad-number", cote: Infinity }),
    ],
    now,
  );
  assert.equal(data.bets.length, 1);
  assert.equal(data.excluded, 4);
  assert.equal(data.bets[0].settlementProof, null);
  assert.equal(data.bets[0].takenProof, null);
  assert.equal(h.engineStats([]).clvPct, null);
  assert.equal(h.engineStats([]).roi, null);
});
test("published reader streams within byte limits and rejects unavailable sources", async () => {
  const reader = loadTS("src/lib/publishedFeed.ts");
  const original = global.fetch;
  try {
    let calls = [];
    global.fetch = async (url, options) => {
      calls.push(url);
      assert.equal(options.cache, "no-store");
      return new Response(JSON.stringify([row()]));
    };
    assert.equal(
      (await reader.readPublishedFeed("paris.json", 10000)).length,
      1,
    );
    assert.equal(
      calls[0],
      "https://raw.githubusercontent.com/Matttgic/cotes-value/donnees/paris.json",
    );
    await assert.rejects(
      reader.readPublishedFeed("paris.json", 10),
      /feed_too_large/,
    );
    global.fetch = async () => new Response("", { status: 502 });
    await assert.rejects(
      reader.readPublishedFeed("paris.json", 10000),
      /source_unavailable/,
    );
  } finally {
    global.fetch = original;
  }
});
test("history API preserves source errors without replacing them with demo data", async () => {
  const route = loadTS("src/app/api/cotes-value/history/route.ts", {
    "@/lib/publishedFeed": {
      readPublishedFeed: async () => {
        throw new Error("offline");
      },
    },
  });
  const response = await route.GET();
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: "engine_history_unavailable",
    bets: [],
    demo: false,
  });
});
