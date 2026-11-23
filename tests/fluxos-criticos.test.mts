import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, before, after } from "node:test";
import forge from "node-forge";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq, sql } from "drizzle-orm";

import * as schema from "../src/db/schema";
import type { DB } from "../src/db";
import { calcularTotais, totalSelecionado } from "../src/lib/os-total";
import { centavos, estornarBaixa, reais, registrarBaixa } from "../src/lib/financeiro";
import { lerCertificadoA1, avaliarValidadeCertificado } from "../src/lib/fiscal/certificado";
import { NS_NFSE, gzipBase64ParaXml, montarIdDps, montarXmlCancelamentoNfse, montarXmlDps, xmlParaGzipBase64 } from "../src/lib/fiscal/dps-xml";
import { assinarXmlNfse, verificarAssinaturaXml } from "../src/lib/fiscal/xmldsig";
import { criarZip } from "../src/lib/fiscal/zip";
import { registrarAuditoria } from "../src/lib/auditoria";
import { verificarLimite } from "../src/lib/rate-limit";
import { apagarOuAnonimizarClienteLgpd, exportarContaCompletaZip, exportarDadosClienteZip } from "../src/lib/lgpd";
import { resolverOficinaAtiva } from "../src/lib/oficina-ativa";
import { tipoRealDoArquivo } from "../src/lib/upload-validacao";

/**
 * Suíte de testes de integração dos fluxos críticos (Fase 6.4):
 * 1. Isolamento multi-tenant via RLS (2 oficinas em Postgres/PGlite real)
 * 2. Check-in -> OS -> Orçamento com aprovação parcial e desconto proporcional
 * 3. Entrega com pagamento -> Financeiro (contas a receber, baixa com taxa e estorno)
 * 4. Emissão fiscal (A1 .pfx, DPS v1.01 + IBS/CBS, XMLDSig, cancelamento e101101, ZIP contador)
 * 5. Segurança & LGPD (rate limit, auditoria, exportação/anonimização cliente, saída da conta, magic bytes)
 */

let tmpDir: string;
let pg: PGlite;
let dbSistema: DB;

function dbComoUsuario(clerkUserId: string, oficina = ""): DB {
  const client = {
    query(query: string, params?: unknown[], opts?: unknown) {
      return pg.transaction(async (tx) => {
        await tx.query("select set_config('app.usuario', $1, true), set_config('app.oficina', $2, true), set_config('role', 'app_usuario', true)", [
          clerkUserId,
          oficina,
        ]);
        return tx.query(query, params, opts as never);
      });
    },
    transaction(fn: (tx: unknown) => unknown) {
      return pg.transaction(async (tx) => {
        await tx.query("select set_config('app.usuario', $1, true), set_config('app.oficina', $2, true), set_config('role', 'app_usuario', true)", [
          clerkUserId,
          oficina,
        ]);
        return fn(tx);
      });
    },
  };
  return drizzle({ client: client as never, schema }) as unknown as DB;
}

describe("Fluxos críticos — Oficina Pro", () => {
  let oficinaA: string;
  let oficinaB: string;
  let clienteA: string;
  let veiculoA: string;
  let osA: string;
  let contaCaixaA: string;

  before(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "oficina-tests-"));
    pg = new PGlite(path.join(tmpDir, "pg"));
    dbSistema = drizzle({ client: pg, schema }) as unknown as DB;
    await migrate(dbSistema as never, { migrationsFolder: path.resolve("drizzle") });

    // Cria 2 oficinas independentes com usuários distintos
    const [ofA] = await dbSistema
      .insert(schema.oficinas)
      .values({ clerkOrgId: "user_a", nome: "Oficina Alfa", razaoSocial: "Alfa Mecânica LTDA", cnpj: "11222333000181" })
      .returning();
    const [ofB] = await dbSistema
      .insert(schema.oficinas)
      .values({ clerkOrgId: "user_b", nome: "Oficina Beta", razaoSocial: "Beta Elétrica LTDA", cnpj: "22333444000150" })
      .returning();
    oficinaA = ofA.id;
    oficinaB = ofB.id;

    await dbSistema.insert(schema.membros).values([
      { oficinaId: oficinaA, clerkUserId: "user_a", nome: "Dono Alfa", email: "a@alfa.test", papel: "dono" },
      { oficinaId: oficinaA, clerkUserId: "user_cont_a", nome: "Contador Alfa", email: "c@alfa.test", papel: "contador" },
      { oficinaId: oficinaB, clerkUserId: "user_b", nome: "Dono Beta", email: "b@beta.test", papel: "dono" },
    ]);
  });

  after(async () => {
    await pg.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("1. RLS habilitado em 100% das tabelas e isola totalmente Oficina A de Oficina B", async () => {
    const semRls = await dbSistema.execute<{ tabela: string }>(sql`
      select c.relname as tabela from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and (not c.relrowsecurity or not exists (select 1 from pg_policy p where p.polrelid = c.oid))
    `);
    const rows = (semRls as unknown as { rows: { tabela: string }[] }).rows;
    assert.equal(rows.length, 0, `Tabelas sem RLS: ${rows.map((r) => r.tabela).join(", ")}`);

    const dbA = dbComoUsuario("user_a");
    const dbB = dbComoUsuario("user_b");

    const [cliA] = await dbA
      .insert(schema.clientes)
      .values({ oficinaId: oficinaA, nome: "João da Silva", documento: "12345678909", telefone: "11999998888", email: "joao@teste.com" })
      .returning();
    clienteA = cliA.id;

    await dbB.insert(schema.clientes).values({ oficinaId: oficinaB, nome: "Cliente Secreto Beta" });

    const vistosPorA = await dbA.select().from(schema.clientes);
    const vistosPorB = await dbB.select().from(schema.clientes);
    assert.equal(vistosPorA.length, 1);
    assert.equal(vistosPorA[0].nome, "João da Silva");
    assert.equal(vistosPorB.length, 1);
    assert.equal(vistosPorB[0].nome, "Cliente Secreto Beta");

    // rate_limits deve ser inacessível para app_usuario
    const rlA = await dbA.select().from(schema.rateLimits);
    assert.equal(rlA.length, 0);
  });

  it("2. Fluxo Check-in -> OS -> Orçamento (aprovação parcial com desconto proporcional)", async () => {
    const dbA = dbComoUsuario("user_a");

    const [v] = await dbA
      .insert(schema.veiculos)
      .values({ oficinaId: oficinaA, clienteId: clienteA, placa: "ABC1D23", marca: "Fiat", modelo: "Argo", ano: 2022, km: 45000 })
      .returning();
    veiculoA = v.id;

    const [ck] = await dbA
      .insert(schema.checkins)
      .values({
        oficinaId: oficinaA,
        veiculoId: veiculoA,
        clienteId: clienteA,
        km: 45000,
        combustivel: 4,
        relato: "Barulho na suspensão dianteira e revisão",
        criadoPor: "user_a",
        chaveEnvio: "chk-unico-001",
      })
      .returning();

    const [os] = await dbA
      .insert(schema.ordensServico)
      .values({
        oficinaId: oficinaA,
        numero: 1,
        checkinId: ck.id,
        veiculoId: veiculoA,
        clienteId: clienteA,
        descricao: ck.relato,
        kmEntrada: 45000,
        descontoValor: "100.00",
      })
      .returning();
    osA = os.id;

    const itens = await dbA
      .insert(schema.osItens)
      .values([
        { osId: osA, tipo: "servico", descricao: "Mão de obra suspensão", quantidade: "1", valorUnitario: "400.00" },
        { osId: osA, tipo: "peca", descricao: "Amortecedor dianteiro", quantidade: "2", valorUnitario: "250.00" },
        { osId: osA, tipo: "servico", descricao: "Higienização ar-condicionado", quantidade: "1", valorUnitario: "100.00" },
      ])
      .returning();

    const listaVal = itens.map((i) => ({ id: i.id, tipo: i.tipo, quantidade: Number(i.quantidade), valorUnitario: Number(i.valorUnitario) }));
    const totais = calcularTotais(listaVal, { percentual: null, valor: 100 });
    assert.equal(totais.bruto, 1000);
    assert.equal(totais.servicos, 500);
    assert.equal(totais.pecas, 500);
    assert.equal(totais.desconto, 100);
    assert.equal(totais.total, 900);

    // Cliente aprova apenas mão de obra (400) + amortecedores (500) = 900 de 1000 → desconto proporcional = 90 → total 810
    const aprovados = new Set([itens[0].id, itens[1].id]);
    const parcial = totalSelecionado(listaVal, aprovados, totais.desconto);
    assert.equal(parcial.bruto, 900);
    assert.equal(parcial.desconto, 90);
    assert.equal(parcial.total, 810);
  });

  it("3. Entrega com pagamento -> Contas a receber, baixa com taxa e estorno", async () => {
    const dbA = dbComoUsuario("user_a");

    const [conta] = await dbA
      .insert(schema.contasFinanceiras)
      .values({ oficinaId: oficinaA, nome: "Caixa Principal", tipo: "caixa", saldoInicial: "0", saldoInicialEm: "2026-11-01" })
      .returning();
    contaCaixaA = conta.id;

    const [lanc] = await dbA
      .insert(schema.lancamentos)
      .values({
        oficinaId: oficinaA,
        tipo: "receber",
        descricao: "OS #1 · ABC1D23",
        contaId: contaCaixaA,
        clienteId: clienteA,
        osId: osA,
        valor: reais(81000), // R$ 810,00
        vencimento: "2026-11-20",
        competencia: "2026-11-20",
        forma: "credito",
        criadoPor: "user_a",
      })
      .returning();

    const baixa = await dbA.transaction((tx) =>
      registrarBaixa(tx as unknown as DB, {
        oficinaId: oficinaA,
        lancamentoId: lanc.id,
        contaId: contaCaixaA,
        data: "2026-11-20",
        valor: 81000,
        taxa: 2430, // 3% taxa maquininha
        forma: "credito",
        criadoPor: "user_a",
      }),
    );
    assert.ok("id" in baixa);

    const [aposBaixa] = await dbA.select().from(schema.lancamentos).where(eq(schema.lancamentos.id, lanc.id));
    assert.equal(aposBaixa.status, "pago");
    assert.equal(centavos(aposBaixa.valorPago), 81000);

    // Estorno devolve lançamento para aberto
    const est = await dbA.transaction((tx) => estornarBaixa(tx as unknown as DB, oficinaA, baixa.id, "user_a"));
    assert.ok(!("erro" in est));

    const [aposEstorno] = await dbA.select().from(schema.lancamentos).where(eq(schema.lancamentos.id, lanc.id));
    assert.equal(aposEstorno.status, "aberto");
    assert.equal(centavos(aposEstorno.valorPago), 0);
  });

  it("4. Fiscal: Certificado A1 (.pfx), DPS v1.01 + IBS/CBS, XMLDSig, Cancelamento e101101 e ZIP do contador", () => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 15 * 86_400_000);
    const attrs = [{ name: "commonName", value: "ALFA MECANICA LTDA:11222333000181" }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const pfxDer = forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], "segredo123", { algorithm: "3des" })).getBytes();
    const pfxBytes = Uint8Array.from(pfxDer, (c) => c.charCodeAt(0));

    const a1 = lerCertificadoA1(pfxBytes, "segredo123");
    assert.equal(a1.cnpj, "11222333000181");
    assert.equal(avaliarValidadeCertificado(a1.validoAte).situacao, "vencendo");
    assert.throws(() => lerCertificadoA1(pfxBytes, "errada"), /Senha do certificado A1 incorreta/);

    const idDps = montarIdDps({ codigoMunicipioEmissor: "3550308", documentoEmitente: "11222333000181", serieDps: "00001", numeroDps: 7 });
    assert.equal(idDps.length, 45);

    const dps = montarXmlDps({
      notaId: "n1",
      ambiente: "homologacao",
      serieDps: "00001",
      numeroDps: 7,
      competencia: "2026-11-20",
      emitidaEmIso: "2026-11-20T10:00:00-03:00",
      codigoMunicipioEmissor: "3550308",
      prestador: {
        cnpj: "11222333000181",
        razaoSocial: "Alfa Mecânica LTDA",
        optanteSimplesNacional: "3",
        regimeApuracaoSn: "1",
        regimeEspecialTrib: "0",
      },
      tomador: { nome: "João da Silva", documento: "12345678909" },
      servico: { codigoMunicipioPrestacao: "3550308", codigoTribNacional: "140101", discriminacao: "Serviço OS #1" },
      valores: { valorServicos: 400, valorDesconto: 40, aliquotaIss: 2, issRetido: false },
      ibsCbs: { finNFSe: "0", indFinal: "1", cst: "000", cClassTrib: "000001" },
    });

    const assinado = assinarXmlNfse({
      xmlRaiz: dps.xml,
      tagAlvo: "infDPS",
      idAlvo: dps.idDps,
      defaultNamespace: NS_NFSE,
      certPem: a1.certPem,
      keyPem: a1.keyPem,
    });
    assert.equal(verificarAssinaturaXml(assinado, "infDPS", NS_NFSE), true);
    assert.equal(verificarAssinaturaXml(assinado.replace("400.00", "401.00"), "infDPS", NS_NFSE), false);
    assert.equal(gzipBase64ParaXml(xmlParaGzipBase64(assinado)), assinado);

    const canc = montarXmlCancelamentoNfse({
      ambiente: "homologacao",
      cnpjAutor: "11222333000181",
      chaveAcesso: "35503082211222333000181000000000000000000000000007",
      codigoMotivo: "1",
      motivo: "Erro no preenchimento da nota",
      dhEventoIso: "2026-11-20T11:00:00-03:00",
    });
    const cancAssinado = assinarXmlNfse({
      xmlRaiz: canc.xml,
      tagAlvo: "infPedReg",
      idAlvo: canc.idEvento,
      defaultNamespace: NS_NFSE,
      certPem: a1.certPem,
      keyPem: a1.keyPem,
    });
    assert.equal(verificarAssinaturaXml(cancAssinado, "infPedReg", NS_NFSE), true);

    const zip = criarZip([{ nome: "xmls/7-nfse.xml", dados: assinado }]);
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
  });

  it("5. Segurança e LGPD: rate limit, auditoria, exportação/anonimização cliente, saída da conta e magic bytes", async () => {
    const dbA = dbComoUsuario("user_a");

    // Magic bytes de upload
    assert.equal(tipoRealDoArquivo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), "image/jpeg");
    assert.equal(tipoRealDoArquivo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), "image/png");
    assert.equal(tipoRealDoArquivo(Buffer.from("<html><script>alert(1)</script></html>")), null);

    // Rate limit (permite 3, bloqueia na 4ª)
    for (let i = 1; i <= 3; i++) {
      const r = await verificarLimite({ chave: "teste-ip-1", limite: 3, janelaSeg: 60, db: dbSistema });
      assert.equal(r.permitido, true);
      assert.equal(r.tentativas, i);
    }
    const bloq = await verificarLimite({ chave: "teste-ip-1", limite: 3, janelaSeg: 60, db: dbSistema });
    assert.equal(bloq.permitido, false);
    assert.ok(bloq.retryAfterSeg >= 1);

    // Auditoria
    await registrarAuditoria({
      oficinaId: oficinaA,
      usuarioId: "user_a",
      usuarioNome: "Dono Alfa",
      tabela: "ordens_servico",
      registroId: osA,
      acao: "desconto",
      resumo: "Aplicou desconto de R$ 100,00",
      db: dbA,
    });
    const logsA = await dbA.select().from(schema.auditoria);
    const logsB = await dbComoUsuario("user_b").select().from(schema.auditoria);
    assert.ok(logsA.length >= 1);
    assert.equal(logsB.length, 0);

    // LGPD: Exportação de dados do cliente
    const expCli = await exportarDadosClienteZip(oficinaA, clienteA, { usuarioId: "user_a", usuarioNome: "Dono Alfa" }, dbA);
    assert.ok(expCli && expCli.buffer.readUInt32LE(0) === 0x04034b50);

    // LGPD: Cliente COM histórico (tem OS) -> anonimizado
    const anon = await apagarOuAnonimizarClienteLgpd(oficinaA, clienteA, { usuarioId: "user_a", usuarioNome: "Dono Alfa" }, dbA);
    assert.deepEqual(anon, { ok: true, modo: "anonimizado" });
    const [cliDepois] = await dbA.select().from(schema.clientes).where(eq(schema.clientes.id, clienteA));
    assert.equal(cliDepois.nome, "Cliente anonimizado (LGPD)");
    assert.equal(cliDepois.documento, null);
    assert.equal(cliDepois.telefone, null);

    // LGPD: Cliente SEM histórico -> apagado definitivamente
    const [cliSemHist] = await dbA.insert(schema.clientes).values({ oficinaId: oficinaA, nome: "Visitante Temporário" }).returning();
    const excl = await apagarOuAnonimizarClienteLgpd(oficinaA, cliSemHist.id, { usuarioId: "user_a", usuarioNome: "Dono Alfa" }, dbA);
    assert.deepEqual(excl, { ok: true, modo: "excluido" });
    const [aindaExiste] = await dbA.select().from(schema.clientes).where(and(eq(schema.clientes.id, cliSemHist.id)));
    assert.equal(aindaExiste, undefined);

    // Saída da conta: exportação completa da oficina
    const expConta = await exportarContaCompletaZip(oficinaA, { usuarioId: "user_a", usuarioNome: "Dono Alfa" }, dbA);
    assert.ok(expConta && expConta.buffer.readUInt32LE(0) === 0x04034b50);
  });

  it("6. Multi-oficina por usuário: RLS restringe à oficina ativa", async () => {
    await dbSistema.insert(schema.membros).values([
      { oficinaId: oficinaA, clerkUserId: "user_multi", nome: "Funcionário Multi", email: "multi@teste.com", papel: "atendente" },
      { oficinaId: oficinaB, clerkUserId: "user_multi", nome: "Funcionário Multi", email: "multi@teste.com", papel: "tecnico" },
    ]);

    // Sem app.oficina: enxerga vínculos e clientes das duas oficinas
    const dbTodas = dbComoUsuario("user_multi", "");
    const vinculos = await dbTodas.select().from(schema.membros).where(eq(schema.membros.clerkUserId, "user_multi"));
    assert.equal(vinculos.length, 2);
    const clientesTodas = await dbTodas.select().from(schema.clientes);
    assert.ok(clientesTodas.some((c) => c.oficinaId === oficinaA));
    assert.ok(clientesTodas.some((c) => c.oficinaId === oficinaB));

    // Com app.oficina = oficinaA: vê SÓ A e INSERT em B falha pelo WITH CHECK do RLS
    const dbSoA = dbComoUsuario("user_multi", oficinaA);
    const clientesA = await dbSoA.select().from(schema.clientes);
    assert.ok(clientesA.length >= 1);
    assert.ok(clientesA.every((c) => c.oficinaId === oficinaA));
    await assert.rejects(
      () => dbSoA.insert(schema.clientes).values({ oficinaId: oficinaB, nome: "Invasor B" }),
      (e: { message?: string; cause?: { message?: string } }) => /row-level security/i.test(`${e?.message ?? ""} ${e?.cause?.message ?? ""}`),
    );

    // Com app.oficina = oficinaB: vê SÓ B
    const dbSoB = dbComoUsuario("user_multi", oficinaB);
    const clientesB = await dbSoB.select().from(schema.clientes);
    assert.ok(clientesB.length >= 1);
    assert.ok(clientesB.every((c) => c.oficinaId === oficinaB));

    // Com app.oficina = UUID de terceiro, inexistente ou texto lixo: 0 linhas, sem erro
    const dbTerceiro = dbComoUsuario("user_a", oficinaB);
    assert.equal((await dbTerceiro.select().from(schema.clientes)).length, 0);
    const dbInexistente = dbComoUsuario("user_multi", "00000000-0000-0000-0000-000000000000");
    assert.equal((await dbInexistente.select().from(schema.clientes)).length, 0);
    const dbLixo = dbComoUsuario("user_multi", "abc");
    assert.equal((await dbLixo.select().from(schema.clientes)).length, 0);

    // Após desativar vínculo em A, app.oficina = oficinaA não retorna nada
    await dbSistema
      .update(schema.membros)
      .set({ ativo: false })
      .where(and(eq(schema.membros.oficinaId, oficinaA), eq(schema.membros.clerkUserId, "user_multi")));
    assert.equal((await dbSoA.select().from(schema.clientes)).length, 0);
    // Vínculo em B continua funcionando normalmente
    assert.ok((await dbSoB.select().from(schema.clientes)).length >= 1);
  });

  it("7. Resolução da oficina ativa (cookie/fallback) e segundo vínculo por convite", async () => {
    const lista = [
      { oficina: { id: oficinaA }, papel: "atendente" as const },
      { oficina: { id: oficinaB }, papel: "contador" as const },
    ];
    // Cookie válido seleciona B
    assert.equal(resolverOficinaAtiva(lista, oficinaB)?.oficina.id, oficinaB);
    // Cookie inexistente/desativado faz fallback para lista[0] (vínculo mais recente)
    assert.equal(resolverOficinaAtiva(lista, "00000000-0000-0000-0000-000000000000")?.oficina.id, oficinaA);
    // Sem cookie faz fallback para lista[0]
    assert.equal(resolverOficinaAtiva(lista, null)?.oficina.id, oficinaA);
    // Lista vazia retorna null
    assert.equal(resolverOficinaAtiva([], oficinaA), null);

    // Usuário membro ativo em A recebe segundo vínculo em B via mesmo padrão onConflictDoUpdate do aceite de convite
    await dbSistema.insert(schema.membros).values({
      oficinaId: oficinaA,
      clerkUserId: "user_convite2",
      nome: "Maria Duas Oficinas",
      email: "maria@teste.com",
      papel: "atendente",
      ativo: true,
    });
    const dadosConviteB = {
      papel: "contador" as const,
      ativo: true,
      nome: "Maria Duas Oficinas",
      email: "maria@teste.com",
    };
    await dbSistema
      .insert(schema.membros)
      .values({ oficinaId: oficinaB, clerkUserId: "user_convite2", ...dadosConviteB })
      .onConflictDoUpdate({ target: [schema.membros.oficinaId, schema.membros.clerkUserId], set: dadosConviteB });

    const vinculos = await dbComoUsuario("user_convite2", "")
      .select()
      .from(schema.membros)
      .where(and(eq(schema.membros.clerkUserId, "user_convite2"), eq(schema.membros.ativo, true)));
    assert.equal(vinculos.length, 2);
    assert.equal(vinculos.find((v) => v.oficinaId === oficinaA)?.papel, "atendente");
    assert.equal(vinculos.find((v) => v.oficinaId === oficinaB)?.papel, "contador");
  });
});
