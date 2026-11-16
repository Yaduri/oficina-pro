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

export function soDigitos(v: string | null | undefined) {
  return (v ?? "").replace(/\D/g, "");
}

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23) */
export const PLACA_RE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

/** CPF 000.000.000-00 / CNPJ 00.000.000/0000-00 (também o CNPJ alfanumérico) */
export function formatDocumento(doc: string | null | undefined) {
  const d = soDigitos(doc);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  const c = normalizarCnpj(doc);
  if (c.length === 14) return c.replace(/(\w{2})(\w{3})(\w{3})(\w{4})(\w{2})/, "$1.$2.$3/$4-$5");
  return doc ?? "";
}

/** CNPJ sem pontuação, em maiúsculas (aceita o formato alfanumérico de jul/2026) */
export function normalizarCnpj(v: string | null | undefined) {
  return (v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/**
 * Valida CNPJ numérico ou alfanumérico (IN RFB 2.229/2024): 12 posições de 0-9/A-Z
 * e 2 dígitos verificadores numéricos; cada caractere vale (código ASCII − 48).
 */
export function cnpjValido(v: string | null | undefined) {
  const c = normalizarCnpj(v);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c) || /^(\w)\1{13}$/.test(c)) return false;
  const dv = (base: string) => {
    let peso = 2;
    let soma = 0;
    for (let i = base.length - 1; i >= 0; i--) {
      soma += (base.charCodeAt(i) - 48) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(c.slice(0, 12));
  const d2 = dv(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

/** CEP 00000-000 */
export function formatCep(v: string | null | undefined) {
  const d = soDigitos(v);
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, "$1-$2") : (v ?? "");
}

export type Endereco = {
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
};

/** "Rua X, 123 - Sala 2, Bairro, Cidade/UF, CEP 00000-000" */
export function formatEndereco(e: Partial<Endereco> | null | undefined) {
  if (!e?.logradouro && !e?.cidade) return null;
  const rua = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const linha1 = [rua, e.complemento].filter(Boolean).join(" - ");
  const cidade = [e.cidade, e.uf].filter(Boolean).join("/");
  return [linha1, e.bairro, cidade, e.cep ? `CEP ${formatCep(e.cep)}` : null].filter(Boolean).join(", ");
}

/** (11) 98765-4321 */
export function formatTelefone(tel: string | null | undefined) {
  const d = soDigitos(tel);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return tel ?? "";
}

/** Link do WhatsApp para um telefone brasileiro */
export function linkWhatsApp(tel: string | null | undefined) {
  const d = soDigitos(tel);
  if (d.length < 10) return null;
  return `https://wa.me/${d.startsWith("55") ? d : `55${d}`}`;
}

/** Aceita "1.234,56", "1234,56" ou "1234.56" */
export function parseValor(v: string | number | null | undefined) {
  if (typeof v === "number") return v;
  const s = (v ?? "").trim().replace(/\s|R\$/g, "");
  if (!s) return NaN;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
}

export function formatData(date: Date) {
  return date.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
}
