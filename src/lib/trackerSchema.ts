export function needsTrackerUpgrade(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; constraint?: string };
  return (
    e.code === "42703" ||
    (e.code === "23514" && e.constraint === "bet_history_status_check")
  );
}
