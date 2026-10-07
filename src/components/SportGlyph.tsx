import Icon from "./Icon";

const sports: Record<string, string> = {
  Football: "football",
  Tennis: "tennis",
  Basketball: "basketball",
  Rugby: "rugby",
  NFL: "rugby",
  Handball: "ball",
  Volleyball: "ball",
  Hockey: "hockey",
  Baseball: "baseball",
  MMA: "boxing",
  Boxe: "boxing",
  Cricket: "baseball",
  Darts: "target",
  "Tennis de table": "tennis",
};
export default function SportGlyph({
  sport,
  size = 20,
}: {
  sport: string;
  size?: number;
}) {
  return <Icon name={sports[sport] || "ball"} size={size} />;
}
