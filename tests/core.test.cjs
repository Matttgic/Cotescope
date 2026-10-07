const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTS } = require("./load-ts.cjs");
const value = loadTS("src/lib/value.ts");
const journal = loadTS("src/lib/journal.ts");
const scanner = loadTS("src/lib/scanner.ts");
const { demoOpportunities } = loadTS("src/data/demo.ts");
const { adaptCotesValue } = loadTS("src/lib/cotesValue.ts");
const arb = loadTS("src/lib/arbitrage.ts");

test("power removal sums to one and corrects asymmetric margins", () => {
  const p = value.noVigProbabilities([1.4, 3.3]);
  assert.ok(Math.abs(p.reduce((s, v) => s + v, 0) - 1) < 1e-12);
  assert.ok(p[0] > 1 / 1.4 / (1 / 1.4 + 1 / 3.3));
  assert.ok(
    Math.abs(
      p[0] ** (1 / Math.log(1 / 1.4)) - p[1] ** (1 / Math.log(1 / 3.3)),
    ) < 1e-10,
  );
});
test("invalid or incomplete markets cannot generate probabilities", () => {
  for (const odds of [[2], [2, NaN], [Infinity, 2], [0, 2], [1, 3]])
    assert.ok(value.noVigProbabilities(odds).every((v) => v === 0));
});
test("Kelly caps exposure and rejects invalid inputs", () => {
  assert.equal(value.fractionalKelly(3, 0.7), 0.02);
  assert.equal(value.fractionalKelly(2, 0.4), 0);
  assert.equal(value.fractionalKelly(NaN, 0.5), 0);
  assert.equal(value.fractionalKelly(2, 0.6, -1), 0);
});
test("high odds require both score and EV and have a hard ceiling", () => {
  assert.equal(value.passesHighOddsGuard(5.8, 69, 23), false);
  assert.equal(value.passesHighOddsGuard(6, 85, 5), true);
  assert.equal(value.passesHighOddsGuard(9, 100, 30), false);
  assert.equal(value.passesHighOddsGuard(NaN, 100, 30), false);
});
test("demo prices agree with their EV and default filters exclude unsafe prices", () => {
  const now = Date.now(),
    items = demoOpportunities(now);
  for (const item of items)
    assert.ok(
      Math.abs(item.evPct - (item.bookmakerOdds / item.fairOdds - 1) * 100) <
        1e-10,
    );
  assert.equal(
    scanner.filterOpportunities(items, scanner.DEFAULT_FILTERS, now).length,
    7,
  );
});
test("search, bookmaker and sorting filters select the intended results", () => {
  const now = Date.now(),
    items = demoOpportunities(now);
  const filtered = scanner.filterOpportunities(
    items,
    { ...scanner.DEFAULT_FILTERS, search: "monaco", bookmaker: "Winamax" },
    now,
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "demo-1");
  const sorted = scanner.filterOpportunities(
    items,
    { ...scanner.DEFAULT_FILTERS, sort: "ev" },
    now,
  );
  assert.ok(sorted.every((v, i) => !i || v.evPct <= sorted[i - 1].evPct));
});
test("expired matches and stale or invalid timestamps cannot be tracked", () => {
  const now = Date.now(),
    item = demoOpportunities(now)[0];
  for (const patch of [
    { startTime: new Date(now - 1).toISOString() },
    { observedAt: new Date(now - 901000).toISOString() },
    { observedAt: "invalid" },
    { bookmakerOdds: Infinity },
  ]) {
    assert.equal(
      scanner.filterOpportunities(
        [{ ...item, ...patch }],
        scanner.DEFAULT_FILTERS,
        now,
      ).length,
      0,
    );
  }
});
const bet = {
  id: "b",
  opportunityId: "live-1",
  createdAt: "2026-10-01T10:00:00Z",
  updatedAt: "2026-10-01T10:00:00Z",
  event: "A — B",
  selection: "A",
  market: "H2H",
  bookmaker: "Winamax",
  sport: "Tennis",
  competition: "ATP",
  odds: 2.2,
  stake: 10,
  initialEvPct: 5,
  opportunityScore: 80,
  status: "win",
};
test("journal ROI excludes open and refunded stakes", () => {
  const stats = journal.journalStats([
    bet,
    { ...bet, id: "2", status: "loss", stake: 20 },
    { ...bet, id: "3", status: "open", stake: 100 },
    { ...bet, id: "4", status: "void", stake: 1000 },
  ]);
  assert.equal(stats.settled, 2);
  assert.equal(stats.stakes, 30);
  assert.ok(Math.abs(stats.net + 8) < 1e-10);
  assert.equal(stats.exposure, 100);
  assert.ok(Math.abs(stats.roi + 26.6666666667) < 1e-8);
  assert.equal(journal.journalStats([]).roi, null);
});
test("malformed persisted data is rejected and latest personal edit wins", () => {
  assert.equal(
    journal.normalizeBets([
      bet,
      { ...bet, stake: "10" },
      { ...bet, odds: Infinity },
      null,
    ]).length,
    1,
  );
  const local = { ...bet, status: "loss", updatedAt: "2026-10-02T10:00:00Z" };
  assert.equal(journal.mergeBets([local], [bet])[0].status, "loss");
});
test("CSV escapes formulas and quotes while retaining results", () => {
  const csv = journal.betsCsv([{ ...bet, event: '=SUM(A1) "test"' }]);
  assert.ok(csv.includes('"' + "'=SUM(A1) " + '""test"""'));
  assert.ok(csv.startsWith("\uFEFF"));
});
test("arbitrage equalizes payouts and rejects non-arbitrages", () => {
  const stakes = arb.arbitrageStakes([2.12, 2.02], 100);
  assert.ok(Math.abs(stakes[0] * 2.12 - stakes[1] * 2.02) < 0.03);
  assert.ok(arb.arbitrageRoiPct([2.12, 2.02]) > 0);
  assert.equal(arb.arbitrageRoiPct([1.9, 1.9]), 0);
});
function row(overrides = {}) {
  const now = Date.now();
  return {
    bookmaker: "Winamax",
    sport: "football",
    ligue: "Ligue 1",
    match_id: "m",
    domicile: "A",
    exterieur: "B",
    debut: new Date(now + 3600000).toISOString(),
    marche: "RESULTAT_1N2",
    periode: "MATCH",
    ligne: null,
    issue: "DOM",
    pari: "A",
    detecte: new Date(now - 30000).toISOString(),
    lu_reference: new Date(now - 40000).toISOString(),
    reference: "Pinnacle",
    cote: 2.22,
    proba_juste: 0.5,
    controle: { statut: "conforme" },
    ...overrides,
  };
}
test("cotes-value groups references and prefers consensus over the highest EV", () => {
  const data = adaptCotesValue([
    row(),
    row({ reference: "Betfair", proba_juste: 0.46 }),
    row({
      reference: "Consensus",
      proba_juste: 0.48,
      composantes: { Pinnacle: 2, Betfair: 1 / 0.46 },
    }),
  ]);
  assert.equal(data.opportunities.length, 1);
  assert.equal(data.opportunities[0].reference, "Consensus");
  assert.ok(Math.abs(data.opportunities[0].evPct - 6.56) < 1e-9);
  assert.equal(data.opportunities[0].references.length, 2);
});
test("cotes-value rejects suspect, raw, stale, unaudited and unsupported markets", () => {
  const patches = [
    { suspect: "bad" },
    { reference: "Pinnacle brut" },
    { controle: { statut: "attente" } },
    { marche: "HANDICAP" },
    { proba_juste: Infinity },
    { bookmaker: "International" },
    { detecte: new Date(Date.now() - 901000).toISOString() },
  ];
  assert.equal(
    adaptCotesValue(patches.map((p) => row(p))).opportunities.length,
    0,
  );
});
test("cotes-value rejects published reference disagreement", () => {
  assert.equal(
    adaptCotesValue([
      row({
        reference: "Consensus",
        proba_juste: 0.5,
        composantes: { Pinnacle: 2, Betfair: 3 },
      }),
    ]).opportunities.length,
    0,
  );
});
test("demo feed is explicit and live failure never returns demo fixtures", async () => {
  const route = loadTS("src/app/api/opportunities/route.ts", {
    "@/lib/db": { getDbPool: () => null },
  });
  const demo = await route.GET(
    new Request("http://local/api/opportunities?mode=demo"),
  );
  assert.equal(demo.status, 200);
  assert.equal((await demo.json()).demo, true);
  const live = await route.GET(
    new Request("http://local/api/opportunities?mode=live"),
  );
  assert.equal(live.status, 503);
  const body = await live.json();
  assert.equal(body.demo, false);
  assert.deepEqual(body.opportunities, []);
});
test("the default real feed works without database access and never falls back to demo", async () => {
  const previousSource = process.env.DEFAULT_DATA_SOURCE;
  delete process.env.DEFAULT_DATA_SOURCE;
  let reads = 0;
  const route = loadTS("src/app/api/opportunities/route.ts", {
    "@/lib/db": {
      getDbPool: () => {
        throw new Error("Unexpected database access");
      },
    },
    "@/lib/publishedFeed": {
      readPublishedFeed: async () => {
        reads++;
        return [];
      },
    },
  });
  try {
    const response = await route.GET(
      new Request("http://local/api/opportunities"),
    );
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.source, "cotes-value");
    assert.equal(data.demo, false);
    assert.deepEqual(data.opportunities, []);
    assert.equal(reads, 1);
    const health = loadTS("src/app/api/health/route.ts");
    const status = await (await health.GET()).json();
    assert.equal(status.mode, "cotes-value");
    assert.equal(status.providerConfigured, true);
    assert.equal(reads, 1, "Health does not fetch the upstream provider");
    const invalid = await route.GET(
      new Request("http://local/api/opportunities?mode=unknown"),
    );
    assert.equal(invalid.status, 400);
    assert.equal(reads, 1);
    const failure = loadTS("src/app/api/opportunities/route.ts", {
      "@/lib/db": {
        getDbPool: () => {
          throw new Error("Unexpected database access");
        },
      },
      "@/lib/publishedFeed": {
        readPublishedFeed: async () => {
          throw new Error("Unavailable public source");
        },
      },
    });
    const failed = await failure.GET(
      new Request("http://local/api/opportunities?mode=cotes-value"),
    );
    assert.equal(failed.status, 502);
    const body = await failed.json();
    assert.equal(body.demo, false);
    assert.deepEqual(body.opportunities, []);
  } finally {
    if (previousSource === undefined) delete process.env.DEFAULT_DATA_SOURCE;
    else process.env.DEFAULT_DATA_SOURCE = previousSource;
  }
});
test("live cache rejects stale rows and restores the high odds guard", async () => {
  const now = Date.now();
  const fresh = {
    opportunity_id:
      "v2|event|soccer_france|" +
      Math.floor((now + 3600000) / 1000) +
      "|winamax|h2h|3|hash",
    odds: 5.8,
    initial_ev_pct: 23.4,
    opportunity_score: 69,
    updated_at: new Date(now - 30000).toISOString(),
    event: "A — B",
    selection: "A",
    bookmaker: "Winamax",
    sport: "Football",
  };
  const route = loadTS("src/app/api/opportunities/route.ts", {
    "@/lib/db": {
      getDbPool: () => ({
        query: async (sql) => ({
          rows: sql.includes("AS used")
            ? []
            : [
                fresh,
                { ...fresh, updated_at: new Date(now - 901000).toISOString() },
              ],
        }),
      }),
    },
  });
  const response = await route.GET(
      new Request("http://local/api/opportunities?mode=live"),
    ),
    data = await response.json();
  assert.equal(data.opportunities.length, 1);
  assert.equal(data.opportunities[0].highOddsGuard, false);
});
test("provider rejects missing football draw, bad margins and duplicate selections", async () => {
  const originalFetch = global.fetch,
    originalKey = process.env.THE_ODDS_API_KEY;
  process.env.THE_ODDS_API_KEY = "test-only";
  const now = Date.now();
  const market = (outcomes) => ({
    key: "h2h",
    last_update: new Date(now - 1000).toISOString(),
    outcomes,
  });
  const outcomes = [
    { name: "A", price: 2.05 },
    { name: "Draw", price: 3.4 },
    { name: "B", price: 3.6 },
  ];
  const event = {
    id: "e",
    sport_key: "soccer_france_ligue_one",
    sport_title: "Ligue 1",
    home_team: "A",
    away_team: "B",
    commence_time: new Date(now + 3600000).toISOString(),
    bookmakers: [],
  };
  const provider = loadTS("src/lib/providers/theOddsApi.ts");
  async function run(ref, book) {
    global.fetch = async () =>
      Response.json([
        {
          ...event,
          bookmakers: [
            { key: "pinnacle", markets: [market(ref)] },
            { key: "winamax_fr", markets: [market(book)] },
          ],
        },
      ]);
    return (await provider.fetchFrenchH2HOpportunities()).opportunities;
  }
  try {
    const good = await run(outcomes, [
      { name: "A", price: 2.4 },
      { name: "Draw", price: 3.4 },
      { name: "B", price: 3.6 },
    ]);
    assert.ok(good.length > 0);
    assert.equal((await run(outcomes.slice(0, 2), outcomes)).length, 0);
    assert.equal(
      (
        await run(
          outcomes,
          outcomes.map(() => ({ name: "A", price: 2.4 })),
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await run(
          outcomes.map((o) => ({ ...o, price: 1.5 })),
          outcomes,
        )
      ).length,
      0,
    );
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.THE_ODDS_API_KEY;
    else process.env.THE_ODDS_API_KEY = originalKey;
  }
});
test("tracker reads and deletes are scoped to the personal owner only", async () => {
  const queries = [];
  const route = loadTS("src/app/api/tracker/route.ts", {
    "@/lib/db": {
      getDbPool: () => ({
        query: async (sql, args) => {
          queries.push({ sql, args });
          return { rows: [], rowCount: 0 };
        },
      }),
    },
  });
  const { NextRequest } = require("next/server");
  const request = new NextRequest("http://local/api/tracker?id=b", {
    headers: { "x-tracker-key": "a".repeat(64) },
  });
  assert.equal((await route.GET(request)).status, 200);
  assert.equal((await route.DELETE(request)).status, 200);
  assert.ok(
    queries.every(
      (q) => q.sql.includes("owner_hash =") && !q.sql.includes("owner_hash IN"),
    ),
  );
  assert.equal(queries[0].args.length, 2);
  assert.equal(queries[1].args.length, 3);
});

test("evidence scoring gives no unobserved consensus bonus and penalizes age", () => {
  const fresh = {
    evPct: 5,
    ageSeconds: 0,
    marketVerified: true,
    consensus: false,
  };
  assert.equal(
    value.evidenceScore({ ...fresh, consensus: true }) -
      value.evidenceScore(fresh),
    5,
  );
  assert.ok(
    value.evidenceScore({ ...fresh, ageSeconds: 600 }) <
      value.evidenceScore(fresh),
  );
  assert.equal(value.evidenceScore({ ...fresh, evPct: NaN }), 0);
});
test("invalid arbitrage inputs never produce a payout allocation", () => {
  assert.deepEqual(arb.arbitrageStakes([Infinity, 2], 100), [0, 0]);
  assert.deepEqual(arb.arbitrageStakes([2.2, 2.2], NaN), [0, 0]);
});
test("CSV preserves numeric losses as numbers and protects only text cells", () => {
  const csv = journal.betsCsv([{ ...bet, status: "loss" }]);
  assert.ok(csv.includes('"-10"'));
  assert.ok(!csv.includes('"\'-10"'));
});
