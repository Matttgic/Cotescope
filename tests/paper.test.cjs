const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const { loadTS } = require("./load-ts.cjs");
const p = loadTS("src/lib/paperTrading.ts");
const { decideCoteScope } = loadTS("src/lib/decisionEngine.ts");
const { adaptCotesValue } = loadTS("src/lib/cotesValue.ts");
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
const item = () => decideCoteScope([row()], now).opportunities[0];
const open = () =>
  p.openPaperTrades(
    "cotescope",
    [item()],
    [],
    now,
    new Date(now).toISOString(),
  )[0];
const history = (patch = {}) => ({
  ...row(),
  id: "result-a",
  statut: "gagne",
  mise: 10,
  gain: 13,
  regle_le: "2026-10-07T21:00:00Z",
  ...patch,
});
test("paper starts at 1000, reserves a capped Kelly stake and never credits an open quote", () => {
  const trade = open();
  assert.equal(trade.stake, 10);
  const metrics = p.paperMetrics([trade], 1000, now);
  assert.equal(metrics.equity, 1000);
  assert.equal(metrics.cashAvailable, 990);
  assert.equal(metrics.net, 0);
  assert.equal(metrics.exposure, 10);
  assert.equal(metrics.roiPct, null);
  assert.equal(
    p.openPaperTrades(
      "cotescope",
      [item()],
      [trade],
      now + 1000,
      new Date(now).toISOString(),
    ).length,
    0,
  );
});
test("duplicate markets and books cannot stack paper exposure on the same event", () => {
  const a = item(),
    b = { ...a, id: "cs-other", bookmaker: "Betclic", selection: "B" };
  assert.equal(
    p.openPaperTrades("cotescope", [a, b], [], now, new Date(now).toISOString())
      .length,
    1,
  );
  const many = Array.from({ length: 20 }, (_, i) => ({
    ...a,
    id: "cs-" + i,
    event: "A" + i + " — B" + i,
  }));
  const trades = p.openPaperTrades(
    "cotescope",
    many,
    [],
    now,
    new Date(now).toISOString(),
  );
  assert.equal(trades.length, 10);
  assert.equal(
    trades.reduce((sum, t) => sum + t.stake, 0),
    100,
  );
});
test("paper uses its entry price, keeps missing or inconsistent labels open, and accounts at read time", () => {
  const trade = open(),
    later = Date.parse("2026-10-07T22:00:00Z");
  const settled = p.settlePaperTrades([trade], [history()], later)[0];
  assert.equal(settled.status, "win");
  assert.equal(settled.settlement.profit, 13);
  const metrics = p.paperMetrics([settled], 1000, later);
  assert.equal(metrics.equity, 1013);
  assert.equal(metrics.cashAvailable, 1013);
  assert.equal(metrics.curve[1].at, new Date(later).toISOString());
  assert.equal(p.settlePaperTrades([settled], [history()], later).length, 0);
  for (const rows of [
    [],
    [history({ gain: 999 })],
    [history({ cote: Infinity })],
    [history({ mise: NaN })],
    [history({ regle_le: "2026-10-08T21:00:00Z" })],
    [history({ debut: "2026-10-08T19:00:00Z" })],
    [history({ domicile: "Autre" })],
    [history(), history({ id: "conflict", statut: "perdu", gain: -10 })],
  ])
    assert.equal(p.settlePaperTrades([trade], rows, later).length, 0);
});
test("a different upstream entry price cannot alter the simulated fill or profit", () => {
  const trade = open();
  const settled = p.settlePaperTrades(
    [trade],
    [history({ cote: 2, gain: 10 })],
    Date.parse("2026-10-07T22:00:00Z"),
  )[0];
  assert.equal(settled.settlement.profit, 13);
  assert.deepEqual(settled.price, trade.price);
});
test("simultaneous settlements do not fabricate an intracycle drawdown", () => {
  const at = "2026-10-07T22:00:00Z";
  const trades = [-10, 10].map((profit, i) => ({
    ...open(),
    key: "simultaneous-" + i,
    status: profit > 0 ? "win" : "loss",
    settlement: {
      status: profit > 0 ? "win" : "loss",
      sourceStatus: "test",
      sourceIds: [],
      readAt: at,
      settledAt: at,
      profit,
    },
  }));
  const metrics = p.paperMetrics(trades);
  assert.equal(metrics.equity, 1000);
  assert.equal(metrics.maxDrawdownPct, 0);
  assert.deepEqual(metrics.curve, [
    { at: null, value: 1000 },
    { at, value: 1000 },
  ]);
});
test("losing and refunded stakes restore correct cash; missing results are not refunds", () => {
  const trade = open(),
    later = Date.parse("2026-10-07T22:00:00Z");
  const loss = p.settlePaperTrades(
    [trade],
    [history({ statut: "perdu", gain: -10 })],
    later,
  )[0];
  assert.equal(p.paperMetrics([loss], 1000, later).equity, 990);
  assert.equal(p.paperMetrics([loss], 1000, later).maxDrawdownPct, 1);
  const refund = p.settlePaperTrades(
    [trade],
    [history({ statut: "rembourse", gain: 0 })],
    later,
  )[0];
  assert.equal(p.paperMetrics([refund], 1000, later).cashAvailable, 1000);
  assert.equal(p.paperMetrics([trade], 1000, later).pendingResults, 1);
});
test("paper never backfills begun games and the comparator uses the same risk limits", () => {
  assert.equal(
    p.openPaperTrades(
      "cotescope",
      [item()],
      [],
      now + 3600001,
      new Date(now).toISOString(),
    ).length,
    0,
  );
  const baseline = adaptCotesValue([row()], now).opportunities;
  const trades = p.openPaperTrades(
    "cotes-value",
    baseline,
    [],
    now,
    new Date(now).toISOString(),
  );
  assert.equal(trades[0].stake, 10);
});
test("unauthorized cron never reads sources or mutates a database", async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-only-secret";
  const route = loadTS("src/app/api/cron/paper/route.ts", {
    "@/lib/publishedFeed": {
      readPublishedFeed: () => {
        throw Error("unexpected source read");
      },
    },
    "@/lib/paperStore": {
      runPaperCycle: () => {
        throw Error("unexpected write");
      },
    },
  });
  try {
    assert.equal(
      (await route.GET(new Request("http://local/api/cron/paper"))).status,
      401,
    );
    delete process.env.CRON_SECRET;
    assert.equal(
      (await route.GET(new Request("http://local/api/cron/paper"))).status,
      503,
    );
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});
test("Postgres paper cycles are prospective, idempotent, isolated and financially consistent", async () => {
  const db = new PGlite();
  const query = async (sql, args = []) => {
    const r = await db.query(sql, args);
    return { rows: r.rows, rowCount: r.affectedRows };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const store = loadTS("src/lib/paperStore.ts", {
    "./db": { getDbPool: () => pool },
  });
  try {
    await db.exec(
      fs.readFileSync("neon/migrations/0001_bet_history.sql", "utf8"),
    );
    await db.exec(
      fs.readFileSync(
        "neon/migrations/0002_capture_and_partial_settlement.sql",
        "utf8",
      ),
    );
    const first = await store.runPaperCycle([row()], [], now);
    assert.equal(first.portfolios.length, 3);
    assert.equal(first.portfolios[0].opened, 1);
    assert.equal(first.portfolios[2].opened, 1);
    const again = await store.runPaperCycle([row()], [], now + 61000);
    assert.equal(again.portfolios[0].opened, 0);
    const later = Date.parse("2026-10-07T22:00:00Z");
    const end = await store.runPaperCycle([], [history()], later);
    assert.equal(end.portfolios[0].settled, 1);
    assert.equal(end.portfolios[0].metrics.equity, 1013);
    const dashboard = await store.readPaperDashboard(later);
    assert.equal(
      dashboard.portfolios[0].latest[0].price.method.version,
      "robust-v1",
    );
    assert.equal(dashboard.portfolios[0].state.cycleCount, 3);
    const rows = await query(
      "SELECT DISTINCT owner_hash FROM public.bet_history",
    );
    assert.equal(rows.rows.length, 3);
    assert.equal(
      dashboard.portfolios[2].latest[0].price.method.version,
      "balanced-v1",
    );
    assert.equal(dashboard.portfolios[2].metrics.equity, 1013);
    assert.equal(
      (
        await query(
          "SELECT COUNT(*) AS n FROM public.bet_history WHERE owner_hash='personal'",
        )
      ).rows[0].n,
      0,
    );
    const cooldown = await store.runPaperCycle([], [], later + 1000);
    assert.equal(cooldown.portfolios[0].skipped, "cooldown");
  } finally {
    await db.close();
  }
});
test("adding balanced preserves existing campaigns and starts an isolated prospective bankroll", async () => {
  const db = new PGlite();
  const query = async (sql, args = []) => {
    const r = await db.query(sql, args);
    return { rows: r.rows, rowCount: r.affectedRows };
  };
  const store = loadTS("src/lib/paperStore.ts", {
    "./db": {
      getDbPool: () => ({
        query,
        connect: async () => ({ query, release() {} }),
      }),
    },
  });
  try {
    for (const migration of [
      "0001_bet_history.sql",
      "0002_capture_and_partial_settlement.sql",
    ])
      await db.exec(fs.readFileSync("neon/migrations/" + migration, "utf8"));
    const previousStart = new Date(now - 3600000).toISOString();
    const previousTrades = new Map();
    for (const mode of ["cotescope", "cotes-value"]) {
      const state = {
        ...p.newPaperState(mode, now - 3600000),
        cycleCount: 8,
        lastCycleAt: new Date(now).toISOString(),
      };
      const items =
        mode === "cotescope"
          ? [item()]
          : adaptCotesValue([row()], now).opportunities;
      const trade = p.openPaperTrades(mode, items, [], now, previousStart)[0];
      previousTrades.set(mode, trade);
      for (const [suffix, opportunity, capture] of [
        ["state", "__system_paper_state__", state],
        ["trade", "__system_paper_trade__:" + trade.key, trade],
      ])
        await query(
          "INSERT INTO bet_history(id,owner_hash,opportunity_id,sport,event,market,selection,bookmaker,odds,stake,capture) VALUES($1,$2,$3,'Football','A — B','Résultat','A','Winamax',2.3,$4,$5::jsonb)",
          [
            mode + "-" + suffix,
            store.paperOwner(mode),
            opportunity,
            suffix === "trade" ? trade.stake : 0,
            JSON.stringify(capture),
          ],
        );
    }
    const launchedAt = now + 61000;
    await store.runPaperCycle([row()], [], launchedAt);
    const dashboard = await store.readPaperDashboard(launchedAt);
    for (const mode of ["cotescope", "cotes-value"]) {
      const portfolio = dashboard.portfolios.find((p) => p.mode === mode);
      assert.equal(portfolio.state.startedAt, previousStart);
      assert.equal(portfolio.state.cycleCount, 9);
      assert.equal(portfolio.metrics.trades, 1);
      assert.deepEqual(portfolio.latest[0], previousTrades.get(mode));
    }
    const balanced = dashboard.portfolios.find(
      (p) => p.mode === "cotescope-balanced",
    );
    assert.equal(balanced.state.startedAt, new Date(launchedAt).toISOString());
    assert.equal(balanced.state.cycleCount, 1);
    assert.equal(balanced.metrics.equity, 1000);
    assert.equal(balanced.metrics.trades, 1);
    assert.equal(balanced.latest[0].price.method.version, "balanced-v1");
    assert.equal(balanced.latest[0].createdAt, balanced.state.startedAt);
    assert.equal(balanced.metrics.cashAvailable, 990);
    const fresh = row({
      detecte: new Date(launchedAt + 61000).toISOString(),
      lu_reference: new Date(launchedAt + 61000).toISOString(),
    });
    const again = await store.runPaperCycle([fresh], [], launchedAt + 61000);
    assert.equal(
      again.portfolios.find((p) => p.mode === "cotescope-balanced").opened,
      0,
    );
  } finally {
    await db.close();
  }
});
