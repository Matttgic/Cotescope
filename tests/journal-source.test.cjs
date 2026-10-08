const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTS } = require("./load-ts.cjs");
const { betSource, journalForSource, journalStats, betsCsv } = loadTS("src/lib/journal.ts");

const bet = {
  id: "auto-cv-legacy", opportunityId: "cv-legacy", sport: "Football",
  competition: "League", event: "A — B", market: "Résultat", selection: "Nul",
  bookmaker: "Winamax", odds: 2.65, stake: 10, initialEvPct: 4.28,
  opportunityScore: 62, status: "open", createdAt: "2026-10-07T21:24:41Z",
  updatedAt: "2026-10-07T21:24:41Z",
};

test("legacy cotes-value takes never become CoteScope decisions because of the selected tab", () => {
  const legacy = [bet, { ...bet, id: "second", opportunityId: "cv-second" }];
  assert.equal(journalForSource(legacy, "cotescope").length, 0);
  assert.equal(journalStats(journalForSource(legacy, "cotescope")).exposure, 0);
  assert.equal(journalForSource(legacy, "cotes-value").length, 2);
  assert.equal(journalStats(journalForSource(legacy, "cotes-value")).exposure, 20);
  assert.ok(!betsCsv(journalForSource(legacy, "cotescope")).includes("A — B"));
  assert.equal(legacy.length, 2);
});

test("journal provenance uses saved methods, recognizes known legacy IDs and keeps unknown sources explicit", () => {
  for (const [opportunityId, expected] of [
    ["cs-a", "cotescope"], ["cv-a", "cotes-value"], ["v2|event|sport", "live"],
    ["demo-1", "demo"], ["legacy-unidentified", "unknown"],
  ]) assert.equal(betSource({ ...bet, opportunityId }), expected);
  assert.equal(betSource({ ...bet, capture: { method: { version: "robust-v1" } } }), "cotescope");
  assert.equal(betSource({ ...bet, capture: { method: { version: "balanced-v1" } } }), "cotescope");
});

test("all-source view preserves unknown takes, excludes demo and keeps total bankroll exposure across sources", () => {
  const bets = [bet, { ...bet, opportunityId: "cs-a" },
    { ...bet, opportunityId: "unknown" }, { ...bet, opportunityId: "demo-1" }];
  assert.equal(journalForSource(bets, "cotescope", true).length, 3);
  assert.equal(journalStats(journalForSource(bets, "cotescope", true)).exposure, 30);
  assert.equal(journalForSource(bets, "demo", true).length, 1);
  assert.equal(journalForSource(bets, "live").length, 0);
});
