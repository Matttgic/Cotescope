import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  radar: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l8-8M12 12h.01",
  chart: "M4 4v16h16M8 15l4-5 4 3 4-7",
  journal: "M6 3h13v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 7h7M8 11h7M8 15h4",
  layers: "M12 3 2 8l10 5 10-5-10-5ZM2 12l10 5 10-5M2 16l10 5 10-5",
  shield: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3ZM8 12l3 3 5-6",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
  arrow: "M5 12h14M13 6l6 6-6 6",
  up: "M5 16l7-8 7 8M12 8v13",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM15 15l6 6",
  refresh: "M20 7V3l-3 3a8 8 0 1 0 3 7M20 7h-5",
  check: "M5 12l4 4L19 6",
  close: "M6 6l12 12M6 18 18 6",
  download: "M12 3v12M7 10l5 5 5-5M4 17v4h16v-4",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v6M12 7h.01",
  bolt: "M13 2 4 14h7l-1 8 10-12h-7l1-8Z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2",
  plus: "M12 5v14M5 12h14",
  wallet: "M3 6h17v14H3V6ZM3 6V4h14v2M15 11h6v5h-6v-5Z",
  football:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 8l4 3-1.5 4h-5L8 11l4-3ZM12 8V3M16 11l5-1M14.5 15l3 4M9.5 15l-3 4M8 11l-5-1",
  tennis:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM5.6 5.6c5 1.6 7.2 3.8 7.2 7.2M18.4 18.4c-5-1.6-7.2-3.8-7.2-7.2",
  basketball:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3v18M5.6 5.6c8 0 12.8 4.8 12.8 12.8M18.4 5.6c-8 0-12.8 4.8-12.8 12.8",
  rugby: "M20 4c-7-2-18 9-16 16 7 2 18-9 16-16ZM8 16l8-8M8 12l4 4M12 8l4 4",
  hockey:
    "M6 3v12l-3 3a2 2 0 0 0 2 3h7M18 3v12l3 3a2 2 0 0 1-2 3h-3M9 18h6v3H9v-3Z",
  baseball:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM7 5c4 4 4 10 0 14M17 5c-4 4-4 10 0 14M7 8l3 1M7 16l3-1M17 8l-3 1M17 16l-3-1",
  boxing:
    "M7 14V7a2 2 0 0 1 4 0V5a2 2 0 0 1 4 0v2a2 2 0 0 1 4 0v7l-3 4H9l-4-4V9a2 2 0 0 1 2-2M9 18v3h7v-3",
  target:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM12 12h.01",
  ball: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM5 7c8-1 12 3 14 10M5 18c1-7 5-11 12-13",
};
export default function Icon({
  name,
  size = 20,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name] || paths.info} />
    </svg>
  );
}
