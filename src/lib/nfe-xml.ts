import { XMLParser } from "fast-xml-parser";

/*
 * Leitura do XML da NF-e (modelo 55) do fornecedor. Função pura, sem banco: aceita o
 * procNFe (nota + protocolo) ou só a NFe, com ou sem prefixo de namespace.
 * Valores em reais (number), datas em AAAA-MM-DD.
 */

export type NfeEndereco = {
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
};

export type NfeItem = {
  /** nItem da nota */
  n: number;
  codigo: string;
  /** null quando a nota traz "SEM GTIN" ou vazio */
  gtin: string | null;
  descricao: string;
  ncm: string | null;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  /** vProd */
  valorProdutos: number;
  desconto: number;
  frete: number;
  seguro: number;
  outros: number;
  ipi: number;
  /** ICMS-ST + FCP-ST */
  st: number;
  /** vProd − vDesc + vFrete + vSeg + vOutro + vIPI + vICMSST: o que o item custou de fato */
  custoTotal: number;
};

export type NfeDuplicata = { numero: string | null; vencimento: string; valor: number };

export type Nfe = {
  /** Chave de acesso (44 dígitos) */
  chave: string | null;
  numero: string | null;
  serie: string | null;
  emissao: string | null;
  emitente: {
    cnpj: string | null;
    cpf: string | null;
    nome: string;
    fantasia: string | null;
    ie: string | null;
    telefone: string | null;
    endereco: NfeEndereco;
  };
  destinatario: { cnpj: string | null; cpf: string | null; nome: string | null };
  itens: NfeItem[];
  totais: {
    produtos: number;
    desconto: number;
    frete: number;
    seguro: number;
    outros: number;
    ipi: number;
    st: number;
    /** vNF */
    total: number;
  };
  duplicatas: NfeDuplicata[];
};

type No = Record<string, unknown>;

const ehNo = (v: unknown): v is No => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const filho = (o: unknown, k: string): No | undefined => {
  if (!ehNo(o)) return undefined;
  const v = o[k];
  return ehNo(v) ? v : Array.isArray(v) && ehNo(v[0]) ? v[0] : undefined;
};
/** Texto de um campo (o parser pode devolver { "#text": ... } quando há atributos) */
const txt = (o: unknown, k: string): string | null => {
  if (!ehNo(o)) return null;
  let v = o[k];
  if (Array.isArray(v)) v = v[0];
  if (ehNo(v)) v = v["#text"];
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const num = (o: unknown, k: string) => {
  const s = txt(o, k);
  const n = s == null ? 0 : Number(s);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const digitos = (s: string | null) => (s ? s.replace(/\D/g, "") || null : null);
/** "2026-11-10T10:30:00-03:00" ou "2026-11-10" → "2026-11-10" */
const dia = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

/** Primeiro nó com esse nome, em profundidade */
function achar(o: unknown, nome: string, prof = 0): No | undefined {
  if (prof > 8 || !ehNo(o)) return undefined;
  if (ehNo(o[nome])) return o[nome] as No;
  for (const v of Object.values(o)) {
    for (const x of arr(v)) {
      const r = achar(x, nome, prof + 1);
      if (r) return r;
    }
  }
  return undefined;
}

/** Soma os valores de um campo em qualquer grupo filho (ex.: vIPI dentro de IPI/IPITrib) */
function somaEm(o: unknown, campo: string, prof = 0): number {
  if (prof > 4 || !ehNo(o)) return 0;
  let s = 0;
  for (const [k, v] of Object.entries(o)) {
    if (k === campo) s += Number(ehNo(v) ? v["#text"] : v) || 0;
    else for (const x of arr(v)) s += somaEm(x, campo, prof + 1);
  }
  return s;
}

const gtinValido = (s: string | null) => {
  const d = s && /^\d{8,14}$/.test(s.trim()) ? s.trim() : null;
  return d && !/^0+$/.test(d) ? d : null;
};

export type ResultadoNfe = { ok: true; nfe: Nfe } | { ok: false; erro: string };

export function lerNfe(xml: string): ResultadoNfe {
  let raiz: unknown;
  try {
    const parser = new XMLParser({
      removeNSPrefix: true,
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      // Mantém tudo como texto (códigos e CNPJ com zeros à esquerda)
      parseTagValue: false,
      parseAttributeValue: false,
      trimValues: true,
      processEntities: true,
    });
    raiz = parser.parse(xml);
  } catch {
    return { ok: false, erro: "O arquivo não é um XML válido" };
  }

  const inf = achar(raiz, "infNFe");
  if (!inf) return { ok: false, erro: "O arquivo não parece ser o XML de uma NF-e" };
  const ide = filho(inf, "ide");
  const emit = filho(inf, "emit");
  const dest = filho(inf, "dest");
  if (!ide || !emit) return { ok: false, erro: "XML da NF-e incompleto (sem identificação ou emitente)" };

  const prot = achar(raiz, "infProt");
  const idAttr = txt(inf, "@_Id");
  const chave = digitos(txt(prot, "chNFe")) ?? digitos(idAttr?.replace(/^NFe/i, "") ?? null);

  const ender = filho(emit, "enderEmit");
  const itens: NfeItem[] = arr(inf.det)
    .filter(ehNo)
    .map((det, i) => {
      const prod = filho(det, "prod") ?? {};
      const imposto = filho(det, "imposto") ?? {};
      const valorProdutos = num(prod, "vProd");
      const desconto = num(prod, "vDesc");
      const frete = num(prod, "vFrete");
      const seguro = num(prod, "vSeg");
      const outros = num(prod, "vOutro");
      const ipi = r2(somaEm(filho(imposto, "IPI"), "vIPI"));
      const icms = filho(imposto, "ICMS");
      const st = r2(somaEm(icms, "vICMSST") + somaEm(icms, "vFCPST"));
      return {
        n: Number(txt(det, "@_nItem")) || i + 1,
        codigo: txt(prod, "cProd") ?? "",
        gtin: gtinValido(txt(prod, "cEAN")) ?? gtinValido(txt(prod, "cEANTrib")),
        descricao: txt(prod, "xProd") ?? `Item ${i + 1}`,
        ncm: txt(prod, "NCM"),
        unidade: (txt(prod, "uCom") ?? "UN").toUpperCase().slice(0, 6),
        quantidade: num(prod, "qCom"),
        valorUnitario: num(prod, "vUnCom"),
        valorProdutos,
        desconto,
        frete,
        seguro,
        outros,
        ipi,
        st,
        custoTotal: r2(valorProdutos - desconto + frete + seguro + outros + ipi + st),
      };
    });
  if (itens.length === 0) return { ok: false, erro: "A nota não tem itens" };

  const tot = filho(filho(inf, "total"), "ICMSTot");
  const soma = (k: keyof NfeItem) => r2(itens.reduce((s, x) => s + (x[k] as number), 0));
  const totais = {
    produtos: tot ? num(tot, "vProd") : soma("valorProdutos"),
    desconto: tot ? num(tot, "vDesc") : soma("desconto"),
    frete: tot ? num(tot, "vFrete") : soma("frete"),
    seguro: tot ? num(tot, "vSeg") : soma("seguro"),
    outros: tot ? num(tot, "vOutro") : soma("outros"),
    ipi: tot ? num(tot, "vIPI") : soma("ipi"),
    st: tot ? r2(num(tot, "vST") + num(tot, "vFCPST")) : soma("st"),
    total: tot ? num(tot, "vNF") : soma("custoTotal"),
  };

  const duplicatas: NfeDuplicata[] = arr(filho(inf, "cobr")?.dup)
    .filter(ehNo)
    .map((d) => ({ numero: txt(d, "nDup"), vencimento: dia(txt(d, "dVenc")) ?? "", valor: num(d, "vDup") }))
    .filter((d) => d.vencimento && d.valor > 0);

  return {
    ok: true,
    nfe: {
      chave: chave && chave.length === 44 ? chave : null,
      numero: txt(ide, "nNF"),
      serie: txt(ide, "serie"),
      emissao: dia(txt(ide, "dhEmi")) ?? dia(txt(ide, "dEmi")),
      emitente: {
        cnpj: txt(emit, "CNPJ")?.toUpperCase().replace(/[^0-9A-Z]/g, "") || null,
        cpf: digitos(txt(emit, "CPF")),
        nome: txt(emit, "xNome") ?? "Fornecedor",
        fantasia: txt(emit, "xFant"),
        ie: txt(emit, "IE"),
        telefone: digitos(txt(ender, "fone")),
        endereco: {
          cep: digitos(txt(ender, "CEP")),
          logradouro: txt(ender, "xLgr"),
          numero: txt(ender, "nro"),
          complemento: txt(ender, "xCpl"),
          bairro: txt(ender, "xBairro"),
          cidade: txt(ender, "xMun"),
          uf: txt(ender, "UF"),
        },
      },
      destinatario: {
        cnpj: txt(dest, "CNPJ")?.toUpperCase().replace(/[^0-9A-Z]/g, "") || null,
        cpf: digitos(txt(dest, "CPF")),
        nome: txt(dest, "xNome"),
      },
      itens,
      totais,
      duplicatas,
    },
  };
}
