const tones: Record<string, string> = {
  winamax: "red",
  betclic: "red",
  unibet: "lime",
  pmu: "blue",
  pinnacle: "blue",
  betfair: "gold",
  netbet: "violet",
  "bwin.fr": "gold",
  bwin: "gold",
};
export default function BookmakerBadge({ name }: { name: string }) {
  return (
    <span
      className={`bookmaker-badge bookmaker-${tones[name.toLowerCase()] || "neutral"}`}
    >
      {name}
    </span>
  );
}
