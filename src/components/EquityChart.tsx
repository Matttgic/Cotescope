import { money } from "@/lib/format";
import { profit, hasProfitSettlement, type Bet } from "@/lib/journal";
import Icon from "./Icon";
export default function EquityChart({ bets }: { bets: Bet[] }) {
  const settled = bets
    .filter(hasProfitSettlement)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  if (!settled.length)
    return (
      <div className="empty-chart">
        <Icon name="chart" size={35} />
        <h3>Votre courbe commence ici.</h3>
        <p>Réglez un pari dans le journal pour mesurer votre performance.</p>
      </div>
    );
  let total = 0;
  const values = [0, ...settled.map((b) => (total += profit(b)))];
  const min = Math.min(...values, 0),
    max = Math.max(...values, 1),
    range = max - min;
  const points = values.map(
    (v, i) =>
      48 +
      (i / (values.length - 1)) * 680 +
      "," +
      (180 - ((v - min) / range) * 135),
  );
  return (
    <div className="equity-chart">
      <svg
        viewBox="0 0 760 220"
        role="img"
        aria-label={
          "Profit cumulé sur " +
          settled.length +
          " paris réglés : " +
          money(total)
        }
      >
        <defs>
          <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#949cff" stopOpacity=".25" />
            <stop offset="100%" stopColor="#949cff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line
              x1="48"
              x2="728"
              y1={180 - v * 135}
              y2={180 - v * 135}
              stroke="#26334b"
              strokeDasharray="4 5"
            />
            <text x="0" y={184 - v * 135} fill="#a2adc5" fontSize="11">
              {Math.round(min + v * range)} €
            </text>
          </g>
        ))}
        <path
          d={"M" + points.join(" L") + " L728,185 L48,185 Z"}
          fill="url(#equity-fill)"
        />
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="#949cff"
          strokeWidth="2.5"
        />
        <text x="48" y="213" fill="#a2adc5" fontSize="11">
          Premier pari réglé
        </text>
        <text x="728" y="213" textAnchor="end" fill="#a2adc5" fontSize="11">
          Dernier pari réglé
        </text>
      </svg>
    </div>
  );
}
