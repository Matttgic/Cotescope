import Image from "next/image";
import SportGlyph from "./SportGlyph";

// Explicit aliases only. A city alone (e.g. Paris) does not identify a club.
const clubs: Record<string, string> = {
  monaco: "monaco",
  "as monaco": "monaco",
  lille: "lille",
  "losc lille": "lille",
  arsenal: "arsenal",
  "arsenal fc": "arsenal",
  brighton: "brighton",
  "brighton & hove albion": "brighton",
  inter: "inter",
  "inter milan": "inter",
  internazionale: "inter",
  atalanta: "atalanta",
  "atalanta bc": "atalanta",
  valence: "valencia",
  valencia: "valencia",
  "valencia cf": "valencia",
  villarreal: "villarreal",
  "villarreal cf": "villarreal",
  psg: "psg",
  "paris saint-germain": "psg",
  "paris saint germain": "psg",
  "paris sg": "psg",
  lyon: "lyon",
  "olympique lyonnais": "lyon",
  marseille: "marseille",
  "olympique de marseille": "marseille",
  lens: "lens",
  "rc lens": "lens",
  nice: "nice",
  "ogc nice": "nice",
  rennes: "rennes",
  "stade rennais": "rennes",
  "paris fc": "paris-fc",
  milan: "milan",
  "ac milan": "milan",
  juventus: "juventus",
  "juventus fc": "juventus",
  napoli: "napoli",
  naples: "napoli",
  "ssc napoli": "napoli",
  roma: "roma",
  "as roma": "roma",
};
export default function EventVisual({
  sport,
  event,
}: {
  sport: string;
  event: string;
}) {
  const teams = sport === "Football" ? event.split(/\s+[—–-]\s+/) : [];
  const paths = teams.map((team) => clubs[team.trim().toLowerCase()]);
  if (teams.length === 2 && paths.every(Boolean)) {
    return (
      <span className="event-crests" aria-hidden="true">
        {paths.map((path, index) => (
          <Image
            key={index}
            src={`/teams/${path}.png`}
            alt=""
            width={32}
            height={32}
            className="club-crest"
          />
        ))}
      </span>
    );
  }
  return (
    <span className={`sport-icon ${sport.toLowerCase()}`} aria-hidden="true">
      <SportGlyph sport={sport} />
    </span>
  );
}
