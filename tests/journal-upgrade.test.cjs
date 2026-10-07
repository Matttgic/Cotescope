const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { loadTS } = require("./load-ts.cjs");
const { PGlite } = require("@electric-sql/pglite");
const j = loadTS("src/lib/journal.ts");
const { normalizeCapture, captureOpportunity } = loadTS(
  "src/lib/betCapture.ts",
);
const { NextRequest } = require("next/server");
const bet = {
  id: "b",
  opportunityId: "cv-b",
  createdAt: "2026-10-07T12:00:00Z",
  updatedAt: "2026-10-07T12:00:00Z",
  sport: "Football",
  competition: "L1",
  event: "A — B",
  market: "Handicap",
  selection: "A",
  bookmaker: "Winamax",
  odds: 2.2,
  stake: 10,
  initialEvPct: 10,
  opportunityScore: 80,
  status: "half_win",
};
const item = {
  ...bet,
  id: "cv-b",
  bookmakerOdds: 2.2,
  fairOdds: 2,
  evPct: 10,
  reference: "Pinnacle",
  startTime: "2026-10-07T18:00:00Z",
  observedAt: "2026-10-07T11:59:00Z",
  marketIdentity: {
    code: "HANDICAP",
    period: "MATCH",
    line: -0.25,
    issue: "DOM",
    settlement: "split",
    label: "Handicap asiatique -0.25 · MATCH",
  },
  evidence: {
    detectedAt: "2026-10-07T11:59:00Z",
    referenceReadAt: "2026-10-07T11:58:00Z",
    referenceEvent: "A — B",
    referenceId: "pin-b",
    inverted: false,
    association: 0.95,
    controlCount: 100,
    controlMedian: 0.9,
    components: [],
  },
};
test("journal partial settlements use correct net profit and do not invent binary win rates", () => {
  assert.ok(Math.abs(j.profit(bet) - 6) < 1e-9);
  assert.equal(j.profit({ ...bet, status: "half_loss" }), -5);
  const s = j.journalStats([
    bet,
    { ...bet, id: "loss", status: "half_loss" },
    { ...bet, status: "void", stake: 100 },
    { ...bet, status: "open", stake: 30 },
  ]);
  assert.equal(s.stakes, 20);
  assert.ok(Math.abs(s.net - 1) < 1e-9);
  assert.ok(Math.abs(s.roi - 5) < 1e-9);
  assert.equal(s.winRate, null);
  assert.equal(s.refunded, 1);
  assert.equal(s.exposure, 30);
});
test("price captures survive JSON export, reject invalid probabilities and never reconstruct old bets", () => {
  const capture = captureOpportunity(item, "2026-10-07T12:00:00Z");
  assert.ok(capture);
  assert.equal(capture.marketIdentity.settlement, "split");
  assert.equal(capture.evidence.referenceId, "pin-b");
  assert.deepEqual(
    normalizeCapture(JSON.parse(JSON.stringify(capture))),
    capture,
  );
  for (const patch of [
    { fairOdds: 0 },
    { bookmakerOdds: Infinity },
    { evPct: 50 },
    { observedAt: "invalid" },
    { references: Array(21).fill({}) },
    { marketIdentity: { ...capture.marketIdentity, period: "MATCH?" } },
  ])
    assert.equal(normalizeCapture({ ...capture, ...patch }), null);
  assert.equal(j.normalizeBets([bet])[0].capture, undefined);
  assert.equal(j.normalizeBets([{ ...bet, capture: {} }]).length, 0);
  const saved = j.createBet(item, 10);
  assert.equal(saved.capture.bookmakerOdds, 2.2);
  assert.ok(j.betsCsv([saved]).includes("Cote juste à la prise"));
});
test("Postgres migration preserves old bets, supports partial results and tracker captures are immutable and owner scoped", async () => {
  const db = new PGlite();
  const query = async (sql, args = []) => {
    const r = await db.query(sql, args);
    return { rows: r.rows, rowCount: r.affectedRows };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  try {
    await db.exec(
      fs.readFileSync("neon/migrations/0001_bet_history.sql", "utf8"),
    );
    const old = loadTS("src/app/api/tracker/route.ts", {
      "@/lib/db": { getDbPool: () => pool },
    });
    const make = (key, bets, method = "POST") =>
      new NextRequest("http://local/api/tracker", {
        method,
        headers: { "x-tracker-key": key, "content-type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify({ bets }) } : {}),
      });
    const owner = "a".repeat(64),
      other = "b".repeat(64);
    const capture = captureOpportunity(item, "2026-10-07T12:00:00Z");
    assert.equal(
      (await old.POST(make(owner, [{ ...bet, capture }]))).status,
      503,
    );
    await db.exec(
      "INSERT INTO bet_history(id,owner_hash,opportunity_id,sport,event,market,selection,bookmaker,odds) VALUES('legacy','legacy-owner','legacy-opp','Football','C — D','H2H','C','Winamax',2)",
    );
    const migration = fs.readFileSync(
      "neon/migrations/0002_capture_and_partial_settlement.sql",
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    assert.equal(
      (await query("SELECT * FROM bet_history WHERE id='legacy'")).rows.length,
      1,
    );
    assert.equal(
      (await old.POST(make(owner, [{ ...bet, capture }]))).status,
      200,
    );
    const changed = { ...capture, bookmakerOdds: 2.4, evPct: 20 };
    assert.equal(
      (
        await old.POST(
          make(owner, [
            {
              ...bet,
              capture: changed,
              status: "half_loss",
              updatedAt: "2026-10-07T13:00:00Z",
            },
          ]),
        )
      ).status,
      200,
    );
    const own = await (await old.GET(make(owner, null, "GET"))).json();
    assert.equal(own.bets[0].status, "half_loss");
    assert.equal(own.bets[0].capture.bookmakerOdds, 2.2);
    assert.equal(
      (await (await old.GET(make(other, null, "GET"))).json()).bets.length,
      0,
    );
    const health = loadTS("src/app/api/tracker/health/route.ts", {
      "@/lib/db": { getDbPool: () => pool },
    });
    assert.equal((await health.GET()).status, 200);
    const { SERVER_DETECTION_OWNER_HASH } = loadTS("src/lib/serverTracker.ts");
    const opportunityId = `v2|score-event|soccer_epl|${Math.floor(Date.now() / 1000) - 3600}|winamax_fr|h2h|3|hash`;
    for (const [id, ownerHash] of [
      ["server-detection", SERVER_DETECTION_OWNER_HASH],
      ["personal-detection", "private-owner"],
    ])
      await query(
        "INSERT INTO bet_history(id,owner_hash,opportunity_id,sport,event,market,selection,bookmaker,odds) VALUES($1,$2,$3,'Football','A — B','H2H','A','Winamax',2)",
        [id, ownerHash, opportunityId],
      );
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "mock-cron";
    try {
      const settle = loadTS("src/app/api/cron/settle/route.ts", {
        "@/lib/db": { getDbPool: () => pool },
        "@/lib/providers/theOddsApiScores": {
          fetchRecentScores: async () => ({
            events: [
              {
                id: "score-event",
                completed: true,
                home_team: "A",
                away_team: "B",
                scores: [
                  { name: "A", score: "2" },
                  { name: "B", score: "1" },
                ],
              },
            ],
            quota: { used: 2, remaining: 100, lastCost: 2 },
            unsupported: false,
          }),
        },
      });
      const response = await settle.GET(
        new NextRequest("http://local/api/cron/settle", {
          headers: { authorization: "Bearer mock-cron" },
        }),
      );
      assert.equal(response.status, 200);
      const states = (
        await query(
          "SELECT id,status FROM bet_history WHERE id IN ('server-detection','personal-detection') ORDER BY id",
        )
      ).rows;
      assert.equal(
        states.find((r) => r.id === "server-detection").status,
        "win",
      );
      assert.equal(
        states.find((r) => r.id === "personal-detection").status,
        "open",
      );
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previous;
    }
  } finally {
    await db.close();
  }
});
test("tracker detects old database schema without silently losing local proof data", async () => {
  const route = loadTS("src/app/api/tracker/route.ts", {
    "@/lib/db": {
      getDbPool: () => ({
        query: async () => {
          throw { code: "42703" };
        },
      }),
    },
  });
  const response = await route.GET(
    new NextRequest("http://local/api/tracker", {
      headers: { "x-tracker-key": "a".repeat(64) },
    }),
  );
  assert.equal(response.status, 503);
  assert.equal(
    (await response.json()).error,
    "tracker_schema_upgrade_required",
  );
});
