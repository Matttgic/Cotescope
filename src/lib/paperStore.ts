import "server-only";
import { createHash } from "crypto";
import { getDbPool } from "./db";
import {
  PAPER_POLICY,
  PAPER_VERSION,
  newPaperState,
  openPaperTrades,
  paperMetrics,
  settlePaperTrades,
  type PaperMode,
  type PaperState,
  type PaperTrade,
} from "./paperTrading";
import { decideCoteScope } from "./decisionEngine";
import { adaptCotesValue } from "./cotesValue";

const MODES: PaperMode[] = ["cotescope", "cotes-value"];
const STATE = "__system_paper_state__";
const PREFIX = "__system_paper_trade__:";
export const paperOwner = (mode: PaperMode) =>
  createHash("sha256")
    .update(`cotescope:paper:${PAPER_VERSION}:${mode}`)
    .digest("hex");
const tradeId = (mode: PaperMode, key: string) =>
  "paper-" +
  createHash("sha256")
    .update(paperOwner(mode) + key)
    .digest("hex");
type Query = (
  sql: string,
  args?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;
function decode(rows: Record<string, unknown>[], mode: PaperMode) {
  let state: PaperState | null = null;
  const trades: PaperTrade[] = [];
  for (const row of rows) {
    const data = row.capture as PaperState | PaperTrade;
    if (row.opportunity_id === STATE) {
      if (
        data?.schema !== "cotescope.paper.state.v1" ||
        data.mode !== mode ||
        data.version !== PAPER_VERSION ||
        data.policy.initialBankroll !== 1000
      )
        throw new Error("paper_state_invalid");
      state = data;
    } else if (String(row.opportunity_id).startsWith(PREFIX)) {
      if (
        data?.schema !== "cotescope.paper.trade.v1" ||
        data.mode !== mode ||
        data.status !== row.status
      )
        throw new Error("paper_trade_invalid");
      trades.push(data);
    }
  }
  if (trades.length > PAPER_POLICY.maxTrades)
    throw new Error("paper_capacity_reached");
  return { state, trades };
}
async function read(query: Query, mode: PaperMode, lock = false) {
  const r = await query(
    `SELECT opportunity_id, status, capture FROM public.bet_history WHERE owner_hash=$1 AND (opportunity_id=$2 OR LEFT(opportunity_id,LENGTH($3))=$3) ORDER BY id LIMIT $4 ${lock ? "FOR UPDATE" : ""}`,
    [paperOwner(mode), STATE, PREFIX, PAPER_POLICY.maxTrades + 2],
  );
  return decode(r.rows, mode);
}
export async function readPaperDashboard(now = Date.now()) {
  const pool = getDbPool();
  if (!pool) throw new Error("database_not_configured");
  const portfolios = [];
  for (const mode of MODES) {
    const { state, trades } = await read(pool.query.bind(pool) as Query, mode);
    portfolios.push({
      mode,
      state,
      metrics: paperMetrics(trades, PAPER_POLICY.initialBankroll, now),
      latest: [...trades]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 50),
    });
  }
  return { version: PAPER_VERSION, policy: PAPER_POLICY, portfolios };
}
/** One database transaction locks both campaign markers before touching the ledger. */
export async function runPaperCycle(
  feed: unknown,
  history: unknown,
  now = Date.now(),
) {
  if (!Array.isArray(feed) || !Array.isArray(history))
    throw new Error("invalid_source");
  const pool = getDbPool();
  if (!pool) throw new Error("database_not_configured");
  const client = await pool.connect();
  const query = client.query.bind(client) as Query;
  try {
    await query("BEGIN");
    for (const mode of MODES) {
      const state = newPaperState(mode, now);
      await query(
        `INSERT INTO public.bet_history (id,owner_hash,opportunity_id,sport,event,market,selection,bookmaker,odds,stake,status,capture) VALUES($1,$2,$3,'Autre','Simulation automatique','État de campagne',$4,'Simulation',2,0,'open',$5::jsonb) ON CONFLICT DO NOTHING`,
        [
          "paper-state-" + paperOwner(mode),
          paperOwner(mode),
          STATE,
          mode,
          JSON.stringify(state),
        ],
      );
    }
    const summary = [];
    for (const mode of MODES) {
      const { state, trades } = await read(query, mode, true);
      if (!state) throw new Error("paper_state_missing");
      if (state.lastCycleAt && now - Date.parse(state.lastCycleAt) < 60000) {
        summary.push({ mode, skipped: "cooldown" });
        continue;
      }
      if (JSON.stringify(state.policy) !== JSON.stringify(PAPER_POLICY)) {
        // PostgreSQL JSONB changes object key order; compare each fixed risk parameter.
        if (
          Object.entries(PAPER_POLICY).some(
            ([key, value]) =>
              state.policy[key as keyof typeof PAPER_POLICY] !== value,
          )
        )
          throw new Error("paper_policy_changed");
      }
      const settled = settlePaperTrades(trades, history, now),
        updates = new Map(settled.map((t) => [t.key, t]));
      const ledger = trades.map((t) => updates.get(t.key) || t);
      for (const t of settled)
        await query(
          "UPDATE public.bet_history SET status=$1,updated_at=$2,capture=$3::jsonb WHERE owner_hash=$4 AND opportunity_id=$5 AND status='open'",
          [
            t.status,
            new Date(now).toISOString(),
            JSON.stringify(t),
            paperOwner(mode),
            PREFIX + t.key,
          ],
        );
      const decision =
        mode === "cotescope"
          ? decideCoteScope(feed, now)
          : adaptCotesValue(feed, now);
      const opened = openPaperTrades(
        mode,
        decision.opportunities,
        ledger,
        now,
        state.startedAt,
      );
      for (const t of opened)
        await query(
          `INSERT INTO public.bet_history (id,owner_hash,opportunity_id,created_at,updated_at,sport,competition,event,market,selection,bookmaker,odds,stake,initial_ev_pct,status,capture) VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'open',$14::jsonb)`,
          [
            tradeId(mode, t.key),
            paperOwner(mode),
            PREFIX + t.key,
            t.createdAt,
            t.sport,
            t.competition,
            t.event,
            t.market,
            t.selection,
            t.bookmaker,
            t.odds,
            t.stake,
            t.price.evPct,
            JSON.stringify(t),
          ],
        );
      const updated = {
        ...state,
        lastCycleAt: new Date(now).toISOString(),
        cycleCount: state.cycleCount + 1,
        lastSelected: opened.length,
        lastSettled: settled.length,
        sourceDiagnostics:
          "diagnostics" in decision
            ? decision.diagnostics
            : { inputRows: feed.length, excluded: decision.excluded },
      };
      await query(
        "UPDATE public.bet_history SET updated_at=$1,capture=$2::jsonb WHERE owner_hash=$3 AND opportunity_id=$4",
        [updated.lastCycleAt, JSON.stringify(updated), paperOwner(mode), STATE],
      );
      summary.push({
        mode,
        opened: opened.length,
        settled: settled.length,
        metrics: paperMetrics([...ledger, ...opened], 1000, now),
      });
    }
    await query("COMMIT");
    return {
      ok: true,
      version: PAPER_VERSION,
      cycleAt: new Date(now).toISOString(),
      portfolios: summary,
    };
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
