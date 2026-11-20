import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import { registrarAuditoria } from "@/lib/auditoria";
import { gerarCsv } from "@/lib/csv";
import { criarZip, type EntradaZip } from "@/lib/fiscal/zip";
import { formatDocumento } from "@/lib/utils";

/*
 * Direitos LGPD (Fase 6.2):
 * 1) Exportação de dados pessoais de um cliente específico (ZIP com JSON + resumo legível).
 * 2) Exclusão ou anonimização de cliente a pedido (apaga se nunca teve histórico; anonimiza
 *    dados pessoais se há OS/financeiro/notas com obrigação legal de guarda — art. 16 LGPD).
 * 3) Exportação completa da conta da oficina (portabilidade / saída da conta, prometida nos Termos).
 */

const {
  oficinas,
  membros,
  tecnicos,
  clientes,
  veiculos,
  veiculoTransferencias,
  catalogoItens,
  checkins,
  ordensServico,
  osItens,
  orcamentos,
  agendamentos,
  contasFinanceiras,
  categoriasFinanceiras,
  lancamentos,
  baixas,
  fornecedores,
  compras,
  notasFiscais,
  mensagens,
  lembretesRevisao,
  pesquisasSatisfacao,
  linksDocumento,
  auditoria,
} = schema;

/* ---------- 1. Exportar dados de um cliente (LGPD) ---------- */

export async function exportarDadosClienteZip(
  oficinaId: string,
  clienteId: string,
  solicitante?: { usuarioId?: string | null; usuarioNome?: string | null },
  conexao?: DB,
): Promise<{ buffer: Buffer; nome: string } | null> {
  const db = conexao ?? (await getDb());
  const [[oficina], [cliente]] = await Promise.all([
    db.select().from(oficinas).where(eq(oficinas.id, oficinaId)),
    db.select().from(clientes).where(and(eq(clientes.id, clienteId), eq(clientes.oficinaId, oficinaId))),
  ]);
  if (!oficina || !cliente) return null;

  const [vs, ordens, chks, ags, lancs, msgs, notas] = await Promise.all([
    db.select().from(veiculos).where(and(eq(veiculos.oficinaId, oficinaId), eq(veiculos.clienteId, clienteId))),
    db.select().from(ordensServico).where(and(eq(ordensServico.oficinaId, oficinaId), eq(ordensServico.clienteId, clienteId))).orderBy(desc(ordensServico.entradaEm)),
    db.select().from(checkins).where(and(eq(checkins.oficinaId, oficinaId), eq(checkins.clienteId, clienteId))),
    db.select().from(agendamentos).where(and(eq(agendamentos.oficinaId, oficinaId), eq(agendamentos.clienteId, clienteId))),
    db.select().from(lancamentos).where(and(eq(lancamentos.oficinaId, oficinaId), eq(lancamentos.clienteId, clienteId))),
    db.select().from(mensagens).where(and(eq(mensagens.oficinaId, oficinaId), eq(mensagens.clienteId, clienteId))),
    db.select().from(notasFiscais).where(and(eq(notasFiscais.oficinaId, oficinaId), eq(notasFiscais.clienteId, clienteId))),
  ]);

  const osIds = ordens.map((o) => o.id);
  const [itens, orcs, pesquisas] = osIds.length
    ? await Promise.all([
        db.select().from(osItens).where(inArray(osItens.osId, osIds)),
        db.select().from(orcamentos).where(and(eq(orcamentos.oficinaId, oficinaId), inArray(orcamentos.osId, osIds))),
        db.select().from(pesquisasSatisfacao).where(and(eq(pesquisasSatisfacao.oficinaId, oficinaId), inArray(pesquisasSatisfacao.osId, osIds))),
      ])
    : [[], [], []];

  const pacote = {
    geradoEm: new Date().toISOString(),
    controlador: {
      oficina: oficina.razaoSocial || oficina.nome,
      cnpj: oficina.cnpj ? formatDocumento(oficina.cnpj) : null,
      email: oficina.email,
      telefone: oficina.telefone,
    },
    titular: cliente,
    veiculos: vs,
    ordensServico: ordens.map((o) => ({
      ...o,
      itens: itens.filter((i) => i.osId === o.id),
      orcamentos: orcs.filter((x) => x.osId === o.id).map(({ token: _t, ...resto }) => resto),
      pesquisa: pesquisas.find((p) => p.osId === o.id) ?? null,
    })),
    checkins: chks,
    agendamentos: ags,
    financeiro: lancs,
    notasFiscais: notas.map(({ xmlDpsKey: _a, xmlNotaKey: _b, xmlCancelamentoKey: _c, pdfKey: _d, ...resto }) => resto),
    mensagens: msgs,
  };

  const resumoTxt = [
    `RELATÓRIO DE DADOS PESSOAIS (LGPD — Art. 18)`,
    `Controlador: ${oficina.razaoSocial || oficina.nome}${oficina.cnpj ? ` · CNPJ ${formatDocumento(oficina.cnpj)}` : ""}`,
    `Titular: ${cliente.nome}`,
    cliente.documento ? `CPF/CNPJ: ${formatDocumento(cliente.documento)}` : null,
    `Data da exportação: ${new Date().toISOString()}`,
    ``,
    `Resumo dos registros encontrados:`,
    `- Veículos vinculados: ${vs.length}`,
    `- Ordens de serviço: ${ordens.length}`,
    `- Check-ins: ${chks.length}`,
    `- Agendamentos: ${ags.length}`,
    `- Lançamentos financeiros: ${lancs.length}`,
    `- Notas fiscais: ${notas.length}`,
    `- Mensagens registradas: ${msgs.length}`,
    ``,
    `Todos os registros completos estão no arquivo dados-cliente.json neste pacote.`,
  ]
    .filter((x) => x !== null)
    .join("\n");

  await registrarAuditoria({
    oficinaId,
    usuarioId: solicitante?.usuarioId,
    usuarioNome: solicitante?.usuarioNome,
    tabela: "clientes",
    registroId: clienteId,
    acao: "exportar_lgpd",
    resumo: `Exportou dados pessoais (LGPD) do cliente "${cliente.nome}"`,
    db,
  });

  const slug = cliente.nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "cliente";

  return {
    buffer: criarZip([
      { nome: "LEIA-ME.txt", dados: resumoTxt },
      { nome: "dados-cliente.json", dados: JSON.stringify(pacote, null, 2) },
    ]),
    nome: `lgpd-${slug}-${new Date().toISOString().slice(0, 10)}.zip`,
  };
}

/* ---------- 2. Apagar ou anonimizar cliente (LGPD) ---------- */

export async function apagarOuAnonimizarClienteLgpd(
  oficinaId: string,
  clienteId: string,
  solicitante: { usuarioId: string | null; usuarioNome: string | null },
  conexao?: DB,
): Promise<{ ok: true; modo: "excluido" | "anonimizado" } | { ok: false; erro: string }> {
  const db = conexao ?? (await getDb());
  const [cliente] = await db
    .select()
    .from(clientes)
    .where(and(eq(clientes.id, clienteId), eq(clientes.oficinaId, oficinaId)));
  if (!cliente) return { ok: false, erro: "Cliente não encontrado." };

  const [temOs, temCk, temLanc, temNota] = await Promise.all([
    db.select({ id: ordensServico.id }).from(ordensServico).where(and(eq(ordensServico.oficinaId, oficinaId), eq(ordensServico.clienteId, clienteId))).limit(1),
    db.select({ id: checkins.id }).from(checkins).where(and(eq(checkins.oficinaId, oficinaId), eq(checkins.clienteId, clienteId))).limit(1),
    db.select({ id: lancamentos.id }).from(lancamentos).where(and(eq(lancamentos.oficinaId, oficinaId), eq(lancamentos.clienteId, clienteId))).limit(1),
    db.select({ id: notasFiscais.id }).from(notasFiscais).where(and(eq(notasFiscais.oficinaId, oficinaId), eq(notasFiscais.clienteId, clienteId))).limit(1),
  ]);

  const temHistorico = temOs.length > 0 || temCk.length > 0 || temLanc.length > 0 || temNota.length > 0;
  const antes = { nome: cliente.nome, documento: cliente.documento, telefone: cliente.telefone, email: cliente.email };

  if (!temHistorico) {
    await db.transaction(async (tx) => {
      await tx.delete(linksDocumento).where(and(eq(linksDocumento.oficinaId, oficinaId), eq(linksDocumento.tipo, "portal"), eq(linksDocumento.refId, clienteId)));
      await tx.delete(mensagens).where(and(eq(mensagens.oficinaId, oficinaId), eq(mensagens.clienteId, clienteId)));
      await tx.delete(veiculos).where(and(eq(veiculos.oficinaId, oficinaId), eq(veiculos.clienteId, clienteId)));
      await tx.delete(clientes).where(and(eq(clientes.id, clienteId), eq(clientes.oficinaId, oficinaId)));
    });
    await registrarAuditoria({
      oficinaId,
      usuarioId: solicitante.usuarioId,
      usuarioNome: solicitante.usuarioNome,
      tabela: "clientes",
      registroId: clienteId,
      acao: "anonimizar_lgpd",
      resumo: `Apagou definitivamente cliente "${cliente.nome}" a pedido (LGPD, sem histórico)`,
      antes,
      depois: { excluido: true },
      db,
    });
    return { ok: true, modo: "excluido" };
  }

  // Tem histórico fiscal/operacional: anonimiza dados pessoais preservando integridade contábil (art. 16 LGPD)
  const agora = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(clientes)
      .set({
        nome: "Cliente anonimizado (LGPD)",
        documento: null,
        telefone: null,
        email: null,
        cep: null,
        logradouro: null,
        numero: null,
        complemento: null,
        bairro: null,
        cidade: null,
        uf: null,
        nascimento: null,
        aceitaWhatsapp: false,
        aceitaWhatsappEm: null,
        observacoes: `Dados pessoais anonimizados em ${agora.toISOString().slice(0, 10)} a pedido do titular (LGPD).`,
        arquivadoEm: agora,
      })
      .where(and(eq(clientes.id, clienteId), eq(clientes.oficinaId, oficinaId)));

    // Revoga acesso público do portal do cliente
    await tx
      .delete(linksDocumento)
      .where(and(eq(linksDocumento.oficinaId, oficinaId), eq(linksDocumento.tipo, "portal"), eq(linksDocumento.refId, clienteId)));

    // Anonimiza telefone e conteúdo de mensagens enviadas ao titular
    await tx
      .update(mensagens)
      .set({ telefone: null, texto: "(conteúdo removido — LGPD)" })
      .where(and(eq(mensagens.oficinaId, oficinaId), eq(mensagens.clienteId, clienteId)));
  });

  await registrarAuditoria({
    oficinaId,
    usuarioId: solicitante.usuarioId,
    usuarioNome: solicitante.usuarioNome,
    tabela: "clientes",
    registroId: clienteId,
    acao: "anonimizar_lgpd",
    resumo: `Anonimizou dados pessoais do cliente "${cliente.nome}" (LGPD — histórico fiscal/operacional mantido)`,
    antes,
    depois: { nome: "Cliente anonimizado (LGPD)", portalRevogado: true },
    db,
  });

  return { ok: true, modo: "anonimizado" };
}

/* ---------- 3. Exportação completa da conta (saída da conta / portabilidade) ---------- */

export async function exportarContaCompletaZip(
  oficinaId: string,
  solicitante: { usuarioId: string | null; usuarioNome: string | null },
  conexao?: DB,
): Promise<{ buffer: Buffer; nome: string } | null> {
  const db = conexao ?? (await getDb());
  const [oficina] = await db.select().from(oficinas).where(eq(oficinas.id, oficinaId));
  if (!oficina) return null;

  const [
    listaMembros,
    listaTecnicos,
    listaClientes,
    listaVeiculos,
    listaTransf,
    listaCatalogo,
    listaCheckins,
    listaOs,
    listaOrcs,
    listaAgenda,
    listaContas,
    listaCats,
    listaLancs,
    listaBaixas,
    listaForn,
    listaCompras,
    listaNotas,
    listaMsgs,
    listaRevisoes,
    listaPesquisas,
    listaAudit,
  ] = await Promise.all([
    db.select().from(membros).where(eq(membros.oficinaId, oficinaId)),
    db.select().from(tecnicos).where(eq(tecnicos.oficinaId, oficinaId)),
    db.select().from(clientes).where(eq(clientes.oficinaId, oficinaId)),
    db.select().from(veiculos).where(eq(veiculos.oficinaId, oficinaId)),
    db.select().from(veiculoTransferencias).where(eq(veiculoTransferencias.oficinaId, oficinaId)),
    db.select().from(catalogoItens).where(eq(catalogoItens.oficinaId, oficinaId)),
    db.select().from(checkins).where(eq(checkins.oficinaId, oficinaId)),
    db.select().from(ordensServico).where(eq(ordensServico.oficinaId, oficinaId)),
    db.select().from(orcamentos).where(eq(orcamentos.oficinaId, oficinaId)),
    db.select().from(agendamentos).where(eq(agendamentos.oficinaId, oficinaId)),
    db.select().from(contasFinanceiras).where(eq(contasFinanceiras.oficinaId, oficinaId)),
    db.select().from(categoriasFinanceiras).where(eq(categoriasFinanceiras.oficinaId, oficinaId)),
    db.select().from(lancamentos).where(eq(lancamentos.oficinaId, oficinaId)),
    db.select().from(baixas).where(eq(baixas.oficinaId, oficinaId)),
    db.select().from(fornecedores).where(eq(fornecedores.oficinaId, oficinaId)),
    db.select().from(compras).where(eq(compras.oficinaId, oficinaId)),
    db.select().from(notasFiscais).where(eq(notasFiscais.oficinaId, oficinaId)),
    db.select().from(mensagens).where(eq(mensagens.oficinaId, oficinaId)),
    db.select().from(lembretesRevisao).where(eq(lembretesRevisao.oficinaId, oficinaId)),
    db.select().from(pesquisasSatisfacao).where(eq(pesquisasSatisfacao.oficinaId, oficinaId)),
    db.select().from(auditoria).where(eq(auditoria.oficinaId, oficinaId)).orderBy(desc(auditoria.criadoEm)).limit(5000),
  ]);

  const osIds = listaOs.map((o) => o.id);
  const listaItensOs = osIds.length ? await db.select().from(osItens).where(inArray(osItens.osId, osIds)) : [];

  const json = (obj: unknown) => JSON.stringify(obj, null, 2);
  const entradas: EntradaZip[] = [
    {
      nome: "LEIA-ME.txt",
      dados: [
        `EXPORTAÇÃO COMPLETA DA CONTA — OFICINA PRO`,
        `Oficina: ${oficina.razaoSocial || oficina.nome}`,
        oficina.cnpj ? `CNPJ: ${formatDocumento(oficina.cnpj)}` : null,
        `Exportado em: ${new Date().toISOString()}`,
        ``,
        `Conteúdo:`,
        `- dados/*.json: backup estruturado de todas as tabelas da oficina (sem chaves/certificados privados).`,
        `- planilhas/*.csv: tabelas principais prontas para abrir no Excel.`,
        `- Para os XMLs e PDFs das notas fiscais (guarda de 5 anos), use também "Exportar contador (ZIP)" por competência em /notas.`,
      ]
        .filter((x) => x !== null)
        .join("\n"),
    },
    { nome: "dados/oficina.json", dados: json(oficina) },
    { nome: "dados/usuarios.json", dados: json(listaMembros) },
    { nome: "dados/tecnicos.json", dados: json(listaTecnicos) },
    { nome: "dados/clientes.json", dados: json(listaClientes) },
    { nome: "dados/veiculos.json", dados: json(listaVeiculos) },
    { nome: "dados/veiculo-transferencias.json", dados: json(listaTransf) },
    { nome: "dados/catalogo.json", dados: json(listaCatalogo) },
    { nome: "dados/checkins.json", dados: json(listaCheckins) },
    { nome: "dados/ordens-servico.json", dados: json(listaOs) },
    { nome: "dados/os-itens.json", dados: json(listaItensOs) },
    { nome: "dados/orcamentos.json", dados: json(listaOrcs.map(({ token: _t, ...r }) => r)) },
    { nome: "dados/agendamentos.json", dados: json(listaAgenda) },
    { nome: "dados/financeiro-contas.json", dados: json(listaContas) },
    { nome: "dados/financeiro-categorias.json", dados: json(listaCats) },
    { nome: "dados/financeiro-lancamentos.json", dados: json(listaLancs) },
    { nome: "dados/financeiro-baixas.json", dados: json(listaBaixas) },
    { nome: "dados/fornecedores.json", dados: json(listaForn) },
    { nome: "dados/compras.json", dados: json(listaCompras) },
    { nome: "dados/notas-fiscais.json", dados: json(listaNotas) },
    { nome: "dados/mensagens.json", dados: json(listaMsgs) },
    { nome: "dados/revisoes.json", dados: json(listaRevisoes) },
    { nome: "dados/pesquisas.json", dados: json(listaPesquisas.map(({ token: _t, ...r }) => r)) },
    { nome: "dados/auditoria.json", dados: json(listaAudit) },
    // Planilhas CSV amigáveis para Excel
    {
      nome: "planilhas/clientes.csv",
      dados: gerarCsv(
        ["Nome", "Tipo", "CPF/CNPJ", "Telefone", "E-mail", "Cidade", "UF", "Aceita WhatsApp", "Arquivado"],
        listaClientes.map((c) => [c.nome, c.tipoPessoa, c.documento, c.telefone, c.email, c.cidade, c.uf, c.aceitaWhatsapp ? "Sim" : "Não", c.arquivadoEm ? "Sim" : "Não"]),
      ),
    },
    {
      nome: "planilhas/veiculos.csv",
      dados: gerarCsv(
        ["Placa", "Marca", "Modelo", "Ano", "Cor", "Km", "Chassi", "Combustível"],
        listaVeiculos.map((v) => [v.placa, v.marca, v.modelo, v.ano, v.cor, v.km, v.chassi, v.combustivel]),
      ),
    },
    {
      nome: "planilhas/ordens-servico.csv",
      dados: gerarCsv(
        ["Número", "Status", "Entrada", "Entrega", "Descrição", "Desconto R$", "Desconto %"],
        listaOs.map((o) => [o.numero, o.status, o.entradaEm.toISOString(), o.entregueEm?.toISOString() ?? "", o.descricao, o.descontoValor, o.descontoPercentual ?? ""]),
      ),
    },
    {
      nome: "planilhas/financeiro.csv",
      dados: gerarCsv(
        ["Tipo", "Status", "Descrição", "Vencimento", "Competência", "Valor", "Valor Pago", "Forma"],
        listaLancs.map((x) => [x.tipo, x.status, x.descricao, x.vencimento, x.competencia, x.valor, x.valorPago, x.forma]),
      ),
    },
    {
      nome: "planilhas/notas-fiscais.csv",
      dados: gerarCsv(
        ["Competência", "Status", "Ambiente", "Nº Nota", "Chave", "Tomador", "CPF/CNPJ", "Valor Líquido"],
        listaNotas.map((n) => [n.competencia, n.status, n.ambiente, n.numeroNota, n.chaveAcesso, n.tomadorNome, n.tomadorDocumento, n.valorLiquido]),
      ),
    },
  ];

  await registrarAuditoria({
    oficinaId,
    usuarioId: solicitante.usuarioId,
    usuarioNome: solicitante.usuarioNome,
    tabela: "oficinas",
    registroId: oficinaId,
    acao: "exportar_conta",
    resumo: "Exportou backup completo da conta da oficina (ZIP)",
    db,
  });

  const cnpj = (oficina.cnpj ?? "oficina").replace(/[^0-9A-Za-z]/g, "");
  return {
    buffer: criarZip(entradas),
    nome: `exportacao-oficina-${cnpj}-${new Date().toISOString().slice(0, 10)}.zip`,
  };
}
