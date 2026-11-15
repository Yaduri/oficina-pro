import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function formatBRL(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "—";
  return brl.format(Number(value));
}

const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
export function formatBRLInteiro(value: number) {
  return brlCompact.format(value);
}

const TZ = "America/Sao_Paulo";

/** "Hoje, 08:10", "Ontem, 16:20" ou "13/11, 14:30" */
export function formatEntrada(date: Date, now = new Date()) {
  const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: TZ });
  const hora = date.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const ontem = new Date(now.getTime() - 86_400_000);
  if (dia(date) === dia(now)) return `Hoje, ${hora}`;
  if (dia(date) === dia(ontem)) return `Ontem, ${hora}`;
  const dm = date.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
  return `${dm}, ${hora}`;
}

export function formatHora(date: Date) {
  return date.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

/** Tempo decorrido curto: "1 h", "2 dias" */
export function tempoDesde(date: Date, now = new Date()) {
  const min = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 dia" : `${d} dias`;
}

export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

export function formatPlaca(placa: string) {
  return placa.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
