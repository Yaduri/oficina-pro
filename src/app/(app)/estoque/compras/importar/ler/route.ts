import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getContexto } from "@/lib/oficina";
import { salvarArquivo } from "@/lib/storage";
import { lerNfe } from "@/lib/nfe-xml";
import { formatDocumento, normalizarCnpj } from "@/lib/utils";
import type { LeituraNfe, Sugestao } from "../tipos";

const MAX = 1024 * 1024;
const { compras, fornecedores, fornecedorCodigos, catalogoItens: cat } = schema;

const json = (r: LeituraNfe, status = 200) => Response.json(r, { status });

/**
 * Recebe o XML da NF-e do fornecedor: lê, confere se já foi lançada, guarda o arquivo
 * (a confirmação lê de novo deste arquivo) e sugere fornecedor e peças.
 */
export async function POST(req: Request) {
  const { oficina, pode } = await getContexto();
  if (!pode("estoque")) return json({ erro: "Seu usuário não tem permissão para compras" }, 403);
  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return json({ erro: "Escolha o arquivo XML da nota" }, 400);
  if (arquivo.size > MAX) return json({ erro: "Arquivo maior que 1 MB" }, 413);
  const bytes = await arquivo.arrayBuffer();
  const xml = new TextDecoder().decode(bytes);
  const lido = lerNfe(xml);
  if (!lido.ok) return json({ erro: lido.erro }, 422);
  const nfe = lido.nfe;
  const db = await getDb();

  if (nfe.chave) {
    const [ja] = await db
      .select({ id: compras.id, numero: compras.numero })
      .from(compras)
      .where(and(eq(compras.oficinaId, oficina.id), eq(compras.notaChave, nfe.chave), ne(compras.status, "cancelada")));
    if (ja) return json({ erro: `Esta nota já foi lançada na compra #${ja.numero}`, compraId: ja.id }, 409);
  }

  const doc = nfe.emitente.cnpj ? normalizarCnpj(nfe.emitente.cnpj) : nfe.emitente.cpf;
  const [forn] = doc
    ? await db
        .select({ id: fornecedores.id, nome: fornecedores.nome, nomeFantasia: fornecedores.nomeFantasia })
        .from(fornecedores)
        .where(and(eq(fornecedores.oficinaId, oficina.id), eq(fornecedores.cpfCnpj, doc)))
    : [];

  // Peças: código do fornecedor (aprendido antes) → GTIN → código do catálogo
  const pecas = await db
    .select({ id: cat.id, codigo: cat.codigo, gtin: cat.gtin })
    .from(cat)
    .where(and(eq(cat.oficinaId, oficina.id), eq(cat.tipo, "peca"), eq(cat.controlaEstoque, true), eq(cat.ativo, true)));
  const ativas = new Set(pecas.map((p) => p.id));
  const cods = nfe.itens.map((i) => i.codigo).filter(Boolean);
  const codigos =
    forn && cods.length > 0
      ? await db
          .select({ codigo: fornecedorCodigos.codigo, catalogoItemId: fornecedorCodigos.catalogoItemId, fator: fornecedorCodigos.fator })
          .from(fornecedorCodigos)
          .where(and(eq(fornecedorCodigos.fornecedorId, forn.id), inArray(fornecedorCodigos.codigo, cods)))
      : [];
  const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();
  const sugestoes: (Sugestao | null)[] = nfe.itens.map((it) => {
    const c = codigos.find((x) => x.codigo === it.codigo && ativas.has(x.catalogoItemId));
    if (c) return { catalogoItemId: c.catalogoItemId, fator: Number(c.fator) || 1, origem: "codigo_fornecedor" };
    const g = it.gtin ? pecas.find((p) => p.gtin === it.gtin) : undefined;
    if (g) return { catalogoItemId: g.id, fator: 1, origem: "gtin" };
    const k = it.codigo ? pecas.find((p) => norm(p.codigo) === norm(it.codigo)) : undefined;
    if (k) return { catalogoItemId: k.id, fator: 1, origem: "codigo" };
    return null;
  });

  let avisoDestinatario: string | null = null;
  const minhaCnpj = normalizarCnpj(oficina.cnpj);
  const dest = nfe.destinatario.cnpj ?? nfe.destinatario.cpf;
  if (minhaCnpj && dest && normalizarCnpj(dest) !== minhaCnpj) {
    avisoDestinatario = `A nota foi emitida para ${nfe.destinatario.nome ?? "outro destinatário"} (${formatDocumento(dest)}), não para o CNPJ da oficina.`;
  }

  const mes = new Date().toISOString().slice(0, 7);
  const xmlKey = `${oficina.id}/compras/${mes}/${crypto.randomUUID()}.xml`;
  await salvarArquivo(xmlKey, bytes, "application/xml");

  return json({
    xmlKey,
    nfe,
    fornecedor: forn ? { id: forn.id, nome: forn.nomeFantasia || forn.nome } : null,
    avisoDestinatario,
    sugestoes,
  });
}
