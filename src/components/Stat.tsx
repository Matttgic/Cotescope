import Icon from "./Icon";
export default function Stat({
  label,
  value,
  detail,
  icon,
  positive,
}: {
  label: string;
  value: string;
  detail: string;
  icon: string;
  positive?: boolean;
}) {
  return (
    <article className="stat-card">
      <div className="stat-label">
        {label}
        <Icon name={icon} size={17} />
      </div>
      <strong className={positive ? "text-accent" : ""}>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}
