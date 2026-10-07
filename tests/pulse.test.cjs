const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { loadTS } = require("./load-ts.cjs");
const { readPulsePage, pulseSummary } = loadTS(
  "src/lib/providers/pulsescore.ts",
);
test("Pulse pilot requires explicit authorization, key and fixed valid scope before any request", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return new Response('{"events":[]}');
  };
  for (const options of [
    { key: "secret", allowPaid: false },
    { key: "", allowPaid: true },
    { key: "secret", allowPaid: true, bookmaker: "../attacker" },
    { key: "secret", allowPaid: true, sport: "soccer?X-Secret=leak" },
  ])
    await assert.rejects(readPulsePage({ ...options, fetcher }));
  assert.equal(calls, 0);
  const page = await readPulsePage({
    key: "proxy-placeholder",
    allowPaid: true,
    fetcher: async (url, init) => {
      calls++;
      assert.equal(
        url,
        "https://api.pulsescore.net/api/winamax/soccer/events?page=1&limit=30",
      );
      assert.equal(init.headers["X-Secret"], "proxy-placeholder");
      assert.equal(init.redirect, "error");
      assert.equal(init.cache, "no-store");
      return new Response('{"events":[],"hasNextPage":true}');
    },
  });
  assert.equal(calls, 1);
  assert.equal(page.hasNextPage, true);
});
test("Pulse never retries, never propagates provider body or credential-bearing errors", async () => {
  for (const status of [401, 403, 429, 500]) {
    let calls = 0;
    await assert.rejects(
      readPulsePage({
        key: "secret-value",
        allowPaid: true,
        fetcher: async () => {
          calls++;
          return new Response("secret-value", {
            status,
            headers: { "retry-after": "120" },
          });
        },
      }),
      (e) => {
        assert.equal(e.status, status);
        assert.equal(e.retryAfterSeconds, 120);
        assert.equal(e.message.includes("secret-value"), false);
        return true;
      },
    );
    assert.equal(calls, 1);
  }
  await assert.rejects(
    readPulsePage({
      key: "secret-value",
      allowPaid: true,
      fetcher: async () => {
        throw new Error("secret-value");
      },
    }),
    (e) =>
      e.code === "pulsescore_network_error" &&
      !e.message.includes("secret-value"),
  );
});
test("Pulse rejects malformed or oversized pages and preserves freshness uncertainty", async () => {
  for (const body of [
    "not JSON",
    "{}",
    '{"events":[null]}',
    JSON.stringify({ events: Array(31).fill({}) }),
  ])
    await assert.rejects(
      readPulsePage({
        key: "x",
        allowPaid: true,
        fetcher: async () => new Response(body),
      }),
    );
  await assert.rejects(
    readPulsePage({
      key: "x",
      allowPaid: true,
      fetcher: async () => new Response("x".repeat(8_000_001)),
    }),
    (e) => e.code === "pulsescore_body_too_large",
  );
  const summary = pulseSummary({
    events: [
      {
        live: true,
        markets: [
          { canonicalMarket: "MATCH_RESULT" },
          { canonicalMarket: "__proto__" },
        ],
      },
      { suspended: true, updatedAt: "2026-10-07T16:00:00Z" },
    ],
    hasNextPage: true,
  });
  assert.equal(summary.missingPriceTimestamps, 1);
  assert.equal(summary.live, 1);
  assert.equal(summary.suspended, 1);
  assert.equal(summary.markets.MATCH_RESULT, 1);
  assert.equal(summary.markets.AUTRE, 1);
});
test("Pulse status reads only configuration and never authenticates or exposes its value", async () => {
  const key = process.env.PULSESCORE_KEY,
    original = global.fetch;
  let calls = 0;
  try {
    process.env.PULSESCORE_KEY = "credential";
    global.fetch = async () => {
      calls++;
      throw Error("must not fetch");
    };
    const route = loadTS("src/app/api/pulsescore/status/route.ts", {
      "@/lib/pulsePilot": { readPulsePilot: async () => null },
    });
    const response = await route.GET();
    const body = await response.json();
    assert.equal(body.configured, true);
    assert.equal(body.authentication, "not_verified");
    assert.equal(body.automaticCollection, false);
    assert.equal(JSON.stringify(body).includes("credential"), false);
    assert.equal(calls, 0);
  } finally {
    global.fetch = original;
    if (key === undefined) delete process.env.PULSESCORE_KEY;
    else process.env.PULSESCORE_KEY = key;
  }
});
test("Pulse CLI defaults to zero requests and rejects absent credentials for an authorized pilot", () => {
  const env = { ...process.env };
  delete env.PULSESCORE_KEY;
  const dry = spawnSync(process.execPath, ["scripts/pulse-check.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
  });
  assert.equal(dry.status, 0);
  assert.equal(JSON.parse(dry.stdout).attempts, 0);
  const missing = spawnSync(
    process.execPath,
    ["scripts/pulse-check.mjs", "--allow-paid"],
    { cwd: process.cwd(), encoding: "utf8", env },
  );
  assert.equal(missing.status, 1);
  assert.equal(
    JSON.parse(missing.stderr.split("\n").find((s) => s.startsWith("{"))).error,
    "pulsescore_key_missing",
  );
});

test("historical Pulse pilots retain only bounded diagnostic fields and reject dry runs or invalid times", () => {
  const { normalizePulsePilot } = loadTS("src/lib/pulsePilot.ts");
  const now = Date.parse("2026-10-07T20:30:00Z");
  const r = {
    provider: "pulsescore",
    scope: "pilot_connection_check",
    attempts: 1,
    paidAuthorized: true,
    ok: true,
    checkedAt: "2026-10-07T20:26:00Z",
    readAt: "2026-10-07T20:26:01Z",
    bookmaker: "winamax",
    sport: "soccer",
    events: 30,
    missingPriceTimestamps: 30,
    secret: "must not retain",
  };
  const result = normalizePulsePilot(r, now);
  assert.equal(result.events, 30);
  assert.equal(JSON.stringify(result).includes("must not retain"), false);
  for (const patch of [
    { attempts: 0 },
    { paidAuthorized: false },
    { events: 31 },
    { missingPriceTimestamps: 31 },
    { checkedAt: "invalid" },
    { checkedAt: "2026-10-08T20:26:00Z" },
    { readAt: "2026-10-07T20:25:00Z" },
    { bookmaker: "unknown" },
  ])
    assert.equal(normalizePulsePilot({ ...r, ...patch }, now), null);
});
test("Pulse status reports a past successful pilot without another API call", async () => {
  const key = process.env.PULSESCORE_KEY,
    original = global.fetch;
  let calls = 0;
  try {
    process.env.PULSESCORE_KEY = "credential";
    global.fetch = async () => {
      calls++;
      throw Error("unexpected provider request");
    };
    const pilot = {
      checkedAt: "2026-10-07T20:26:00Z",
      readAt: "2026-10-07T20:26:01Z",
      ok: true,
      bookmaker: "winamax",
      sport: "soccer",
      attempts: 1,
      events: 30,
      missingPriceTimestamps: 30,
    };
    const route = loadTS("src/app/api/pulsescore/status/route.ts", {
      "@/lib/pulsePilot": { readPulsePilot: async () => pilot },
    });
    const body = await (await route.GET()).json();
    assert.equal(body.authentication, "last_pilot_succeeded");
    assert.equal(body.lastPilot.events, 30);
    assert.equal(body.automaticCollection, false);
    assert.equal(calls, 0);
    assert.equal(JSON.stringify(body).includes("credential"), false);
  } finally {
    global.fetch = original;
    if (key === undefined) delete process.env.PULSESCORE_KEY;
    else process.env.PULSESCORE_KEY = key;
  }
});
