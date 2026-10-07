import type { BetStatus } from "./journal";
export const money = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
export const number = (n: number, digits = 1) =>
  n.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
export const percent = (n: number) => (n > 0 ? "+" : "") + number(n) + " %";
export const time = (s: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  }).format(new Date(s));
export const shortTime = (s: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s));
export const statuses: Record<BetStatus, string> = {
  open: "En cours",
  win: "Gagné",
  loss: "Perdu",
  void: "Remboursé",
  half_win: "Demi-gagné",
  half_loss: "Demi-perdu",
};
export const sportMark: Record<string, string> = {
  Football: "FO",
  Tennis: "TE",
  Basketball: "BA",
};
