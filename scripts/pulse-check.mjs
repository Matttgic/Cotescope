import {
  readFile,
  writeFile,
  mkdir,
  open,
  unlink,
  rename,
  chmod,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  readPulsePage,
  pulseSummary,
  PulseError,
  PULSE_BOOKMAKERS,
  PULSE_SPORTS,
} from "../src/lib/providers/pulsescore.ts";
const args = process.argv.slice(2),
  root = fileURLToPath(new URL("../", import.meta.url));
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const bookmaker = value("--bookmaker", "winamax"),
  sport = value("--sport", "soccer");
const directory = resolve(root, ".local/pulsescore"),
  reportFile = resolve(directory, "connection.json"),
  lockFile = resolve(directory, "check.lock");
const paid = args.includes("--allow-paid");
const key = process.env.PULSESCORE_KEY;
const report = {
  provider: "pulsescore",
  scope: "pilot_connection_check",
  bookmaker,
  sport,
  maxAttempts: 1,
  attempts: 0,
  configured: Boolean(key),
  paidAuthorized: paid,
  checkedAt: new Date().toISOString(),
};
let lock,
  ownsLock = false;
try {
  const recognized = new Set(["--allow-paid", "--bookmaker", "--sport"]);
  for (let i = 0; i < args.length; i++) {
    if (!recognized.has(args[i])) throw new PulseError("unsupported_argument");
    if (args[i] !== "--allow-paid") i++;
  }
  if (!PULSE_BOOKMAKERS.includes(bookmaker) || !PULSE_SPORTS.includes(sport))
    throw new PulseError("unsupported_pulse_scope");
  if (!paid) {
    console.log(
      JSON.stringify(
        {
          ...report,
          ok: true,
          skipped: "explicit_paid_check_required",
          instruction:
            "Add --allow-paid to authorize exactly one request; no automatic collection is enabled.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 0;
  } else {
    if (!key) throw new PulseError("pulsescore_key_missing");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    try {
      lock = await open(lockFile, "wx", 0o600);
      ownsLock = true;
    } catch {
      throw new PulseError("pulsescore_check_already_running");
    }
    let previous;
    try {
      previous = JSON.parse(await readFile(reportFile, "utf8"));
    } catch {}
    const notBefore = previous?.retryAt
      ? Date.parse(previous.retryAt)
      : Date.parse(previous?.checkedAt) + 1100;
    if (Number.isFinite(notBefore) && Date.now() < notBefore)
      throw new PulseError("pulsescore_check_cooldown");
    report.attempts = 1;
    try {
      const page = await readPulsePage({
        key,
        allowPaid: true,
        bookmaker,
        sport,
      });
      Object.assign(report, {
        ok: true,
        ...pulseSummary(page),
        readAt: new Date().toISOString(),
      });
    } catch (e) {
      const retry = e instanceof PulseError ? e.retryAfterSeconds : null;
      Object.assign(report, {
        ok: false,
        error: e instanceof PulseError ? e.code : "pulsescore_check_failed",
        httpStatus: e instanceof PulseError ? e.status : null,
        retryAt:
          retry === null
            ? null
            : new Date(Date.now() + retry * 1000).toISOString(),
      });
      process.exitCode = 1;
    }
    const temp = reportFile + ".tmp";
    await writeFile(temp, JSON.stringify(report, null, 2), { mode: 0o600 });
    await rename(temp, reportFile);
    console.log(JSON.stringify(report, null, 2));
  }
} catch (e) {
  console.error(
    JSON.stringify({
      ...report,
      ok: false,
      error: e instanceof PulseError ? e.code : "pulsescore_check_failed",
    }),
  );
  process.exitCode = 1;
} finally {
  if (lock) await lock.close();
  if (ownsLock) await unlink(lockFile).catch(() => {});
}
