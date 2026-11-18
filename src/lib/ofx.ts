/*
 * Leitor de extrato OFX (1.x em SGML e 2.x em XML). Só o que a conciliação usa:
 * as transações (STMTTRN) com TRNTYPE, DTPOSTED, TRNAMT, FITID, MEMO/NAME.
 */

export type TransacaoOfx = {
  fitid: string;
  /** AAAA-MM-DD */
  data: string;
  /** Em centavos; positivo = entrada, negativo = saída */
  valor: number;
  tipo: string | null;
  descricao: string | null;
};

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodificar(v: string) {
  return v
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTIDADES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Valor de um elemento simples: <TAG>valor (SGML, sem fechamento) ou <TAG>valor</TAG> (XML) */
function campo(bloco: string, tag: string) {
  const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  const v = m ? decodificar(m[1]) : "";
  return v || null;
}

/** "20261105", "20261105120000[-3:BRT]" → "2026-11-05" */
function lerData(v: string | null) {
  const m = v?.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, a, mes, d] = m;
  const dt = new Date(`${a}-${mes}-${d}T12:00:00Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== `${a}-${mes}-${d}`) return null;
  return `${a}-${mes}-${d}`;
}

/** "-150.00", "150,00", "+1.234,56" → centavos */
function lerValor(v: string | null) {
  if (!v) return null;
  let s = v.replace(/\s/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export type ResultadoOfx = { transacoes: TransacaoOfx[]; conta: string | null; banco: string | null; invalidas: number };

export function lerOfx(texto: string): ResultadoOfx {
  const inicio = texto.search(/<OFX>/i);
  if (inicio < 0) throw new Error("Arquivo não parece um extrato OFX");
  const corpo = texto.slice(inicio);

  const transacoes: TransacaoOfx[] = [];
  let invalidas = 0;
  const partes = corpo.split(/<STMTTRN>/i).slice(1);
  partes.forEach((parte, i) => {
    // O bloco termina no fechamento (XML e a maioria dos SGML) ou no fim da lista
    const bloco = parte.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0];
    const data = lerData(campo(bloco, "DTPOSTED"));
    const valor = lerValor(campo(bloco, "TRNAMT"));
    if (!data || valor === null) {
      invalidas++;
      return;
    }
    const memo = campo(bloco, "MEMO");
    const nome = campo(bloco, "NAME");
    const descricao = [nome, memo].filter((x, j, a) => x && a.indexOf(x) === j).join(" · ") || null;
    // Sem FITID (raro): identificador montado com os dados da linha
    const fitid = campo(bloco, "FITID") ?? `sem-fitid:${data}:${valor}:${descricao ?? ""}:${i}`;
    transacoes.push({ fitid: fitid.slice(0, 255), data, valor, tipo: campo(bloco, "TRNTYPE"), descricao: descricao?.slice(0, 255) ?? null });
  });

  return { transacoes, conta: campo(corpo, "ACCTID"), banco: campo(corpo, "BANKID"), invalidas };
}
