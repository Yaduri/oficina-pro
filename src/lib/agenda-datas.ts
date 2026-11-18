/*
 * Datas da agenda no fuso de São Paulo (sem horário de verão: -03:00).
 * Usado no servidor e no navegador.
 */

export const TZ = "America/Sao_Paulo";

/** Date → "AAAA-MM-DD" no fuso de São Paulo */
export function diaSP(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Date → "HH:MM" no fuso de São Paulo */
export function horaSP(d: Date) {
  return d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

export const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "AAAA-MM-DD" → início do dia em São Paulo */
export function inicioDoDia(dia: string) {
  return new Date(`${dia}T00:00:00-03:00`);
}

/** "AAAA-MM-DD" + "HH:MM" → Date */
export function dataHora(dia: string, hora: string) {
  return new Date(`${dia}T${hora}:00-03:00`);
}

export function somarDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return diaSP(d);
}

/** Segunda-feira da semana do dia */
export function inicioDaSemana(dia: string) {
  const semana = new Date(`${dia}T12:00:00-03:00`).getUTCDay(); // 0 = domingo
  return somarDias(dia, semana === 0 ? -6 : 1 - semana);
}

/** "terça, 18 de novembro" */
export function nomeDoDia(dia: string, opcoes: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  return new Date(`${dia}T12:00:00-03:00`).toLocaleDateString("pt-BR", { timeZone: TZ, ...opcoes });
}

export function formatDuracao(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export const STATUS_AGENDA = {
  agendado: { label: "Agendado", tom: "neutro" },
  confirmado: { label: "Confirmado", tom: "info" },
  atendido: { label: "Chegou", tom: "ok" },
  faltou: { label: "Faltou", tom: "warn" },
  cancelado: { label: "Cancelado", tom: "danger" },
} as const;

export type StatusAgenda = keyof typeof STATUS_AGENDA;
