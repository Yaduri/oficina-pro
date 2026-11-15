import "server-only";
import type { DB } from "./index";
import { schema } from "./index";
import type { Empresa } from "@/lib/oficina";

/**
 * Dados de exemplo para conhecer o sistema. Datas relativas ao momento da criação.
 * Usado opcionalmente no cadastro inicial da oficina.
 */
export async function seedDemo(db: DB, oficinaId: string, empresas: Empresa[]) {
  const mec = empresas.find((e) => e.tipo === "mecanica") ?? empresas[0];
  const ele = empresas.find((e) => e.tipo === "eletrica") ?? empresas[1] ?? empresas[0];

  const now = Date.now();
  const h = (n: number) => new Date(now - n * 3_600_000);
  const hoje = (hora: number, min = 0) => {
    const d = new Date();
    d.setHours(hora, min, 0, 0);
    return d;
  };

  const [paulo, bruno, diego] = await db
    .insert(schema.tecnicos)
    .values([
      { oficinaId, empresaId: mec.id, nome: "Paulo Mendes" },
      { oficinaId, empresaId: mec.id, nome: "Bruno Rocha" },
      { oficinaId, empresaId: ele.id, nome: "Diego Martins" },
    ])
    .returning();

  const clientes = await db
    .insert(schema.clientes)
    .values([
      { oficinaId, nome: "Mariana Costa", telefone: "(11) 98888-1001" },
      { oficinaId, nome: "João Pereira", telefone: "(11) 98888-1002" },
      { oficinaId, nome: "Transportes Lima", tipoPessoa: "pj", telefone: "(11) 3333-1003" },
      { oficinaId, nome: "Ana Ribeiro", telefone: "(11) 98888-1004" },
      { oficinaId, nome: "Rafael Souza", telefone: "(11) 98888-1005" },
      { oficinaId, nome: "Luana Alves", telefone: "(11) 98888-1006" },
      { oficinaId, nome: "Carla Nunes", telefone: "(11) 98888-1007" },
      { oficinaId, nome: "Pedro Henrique", telefone: "(11) 98888-1008" },
    ])
    .returning();
  const c = (nome: string) => clientes.find((x) => x.nome === nome)!.id;

  const veiculos = await db
    .insert(schema.veiculos)
    .values([
      { oficinaId, clienteId: c("Mariana Costa"), placa: "RIO2A18", marca: "Chevrolet", modelo: "Onix 1.0 LT", km: 61200 },
      { oficinaId, clienteId: c("João Pereira"), placa: "BRA0S17", marca: "Hyundai", modelo: "HB20 Comfort", km: 84312 },
      { oficinaId, clienteId: c("Transportes Lima"), placa: "QTP5F71", marca: "Fiat", modelo: "Strada Freedom", km: 60040 },
      { oficinaId, clienteId: c("Ana Ribeiro"), placa: "FKD8J22", marca: "Toyota", modelo: "Corolla XEi", km: 98110 },
      { oficinaId, clienteId: c("Rafael Souza"), placa: "PXM3C40", marca: "Volkswagen", modelo: "Gol 1.6 Trend", km: 132500 },
      { oficinaId, clienteId: c("Luana Alves"), placa: "KTR6B09", marca: "Renault", modelo: "Kwid Zen", km: 41900 },
      { oficinaId, clienteId: c("Carla Nunes"), placa: "MNO4D33", marca: "Chevrolet", modelo: "Tracker Premier", km: 55300 },
      { oficinaId, clienteId: c("Pedro Henrique"), placa: "SVR1E55", marca: "Volkswagen", modelo: "Saveiro Robust", km: 77800 },
    ])
    .returning();
  const v = (placa: string) => veiculos.find((x) => x.placa === placa)!;

  type Item = { tipo: "peca" | "servico"; descricao: string; valor: number; qtd?: number; feito?: boolean };
  let numero = 1030;
  async function os(
    placa: string,
    empresa: Empresa,
    resp: { id: string },
    status: (typeof schema.statusOS.enumValues)[number],
    descricao: string,
    entradaH: number,
    itens: Item[],
    extra: Partial<typeof schema.ordensServico.$inferInsert> = {},
  ) {
    const veic = v(placa);
    const [row] = await db
      .insert(schema.ordensServico)
      .values({
        oficinaId,
        empresaId: empresa.id,
        numero: numero++,
        veiculoId: veic.id,
        clienteId: veic.clienteId,
        responsavelId: resp.id,
        status,
        descricao,
        kmEntrada: veic.km,
        entradaEm: h(entradaH),
        ...extra,
      })
      .returning();
    if (itens.length) {
      await db.insert(schema.osItens).values(
        itens.map((i) => ({
          osId: row.id,
          empresaId: empresa.id,
          tipo: i.tipo,
          descricao: i.descricao,
          quantidade: String(i.qtd ?? 1),
          valorUnitario: i.valor.toFixed(2),
          concluido: i.feito ?? false,
        })),
      );
    }
  }

  // Entregues neste mês (compõem o faturamento)
  const entregue = (dias: number) => ({ entregueEm: new Date(now - dias * 86_400_000) });
  const diasNoMes = new Date().getDate() - 1;
  const d = (n: number) => Math.min(n, Math.max(diasNoMes, 0));
  await os("SVR1E55", mec, paulo, "entregue", "Troca de óleo e filtros", 24 * (d(9) + 1), [
    { tipo: "peca", descricao: "Óleo 5W30 (4 L)", valor: 196 },
    { tipo: "peca", descricao: "Filtro de óleo", valor: 42 },
    { tipo: "servico", descricao: "Mão de obra", valor: 80 },
  ], entregue(d(9)));
  await os("RIO2A18", mec, bruno, "entregue", "Pastilhas e discos de freio", 24 * (d(6) + 1), [
    { tipo: "peca", descricao: "Jogo de pastilhas dianteiras", valor: 189 },
    { tipo: "peca", descricao: "Par de discos de freio", valor: 420 },
    { tipo: "servico", descricao: "Mão de obra", valor: 180 },
  ], entregue(d(6)));
  await os("KTR6B09", ele, diego, "entregue", "Troca de bateria", 24 * (d(4) + 1), [
    { tipo: "peca", descricao: "Bateria 60 Ah", valor: 489 },
    { tipo: "servico", descricao: "Teste do sistema de carga", valor: 60 },
  ], entregue(d(4)));

  // Em andamento
  await os("PXM3C40", mec, paulo, "diagnostico", "Barulho na suspensão dianteira", 50, []);
  await os("KTR6B09", ele, diego, "diagnostico", "Bateria descarrega à noite", 1, []);
  await os("BRA0S17", ele, diego, "aguardando_aprovacao", "Alternador sem carga", 4, [
    { tipo: "peca", descricao: "Alternador recondicionado", valor: 780 },
    { tipo: "servico", descricao: "Substituição do alternador", valor: 200 },
  ], { aprovacaoEnviadaEm: h(2) });
  await os("MNO4D33", mec, paulo, "aguardando_aprovacao", "Troca de amortecedores", 60, [
    { tipo: "peca", descricao: "Amortecedores dianteiros (par)", valor: 1980 },
    { tipo: "servico", descricao: "Mão de obra", valor: 780 },
  ], { aprovacaoEnviadaEm: h(48) });
  await os("QTP5F71", mec, bruno, "aguardando_peca", "Revisão 60.000 km", 20, [
    { tipo: "peca", descricao: "Kit correia dentada", valor: 1280 },
    { tipo: "peca", descricao: "Velas de ignição (4)", valor: 320 },
    { tipo: "servico", descricao: "Revisão completa", valor: 830 },
  ], { previsaoPecaEm: new Date(now + 86_400_000) });
  await os("RIO2A18", mec, bruno, "em_execucao", "Troca de embreagem", 3, [
    { tipo: "peca", descricao: "Kit de embreagem", valor: 1150, feito: true },
    { tipo: "peca", descricao: "Rolamento", valor: 160, feito: true },
    { tipo: "servico", descricao: "Remoção do câmbio", valor: 200, feito: true },
    { tipo: "servico", descricao: "Instalação", valor: 280 },
    { tipo: "servico", descricao: "Teste de rodagem", valor: 100 },
  ]);
  await os("SVR1E55", ele, diego, "em_execucao", "Chicote do farol", 5, [
    { tipo: "peca", descricao: "Chicote do farol", valor: 220, feito: true },
    { tipo: "servico", descricao: "Reparo elétrico", valor: 150 },
    { tipo: "servico", descricao: "Regulagem dos faróis", valor: 50 },
  ]);
  await os("FKD8J22", ele, diego, "pronto", "Motor de partida", 30, [
    { tipo: "peca", descricao: "Motor de partida recondicionado", valor: 520, feito: true },
    { tipo: "servico", descricao: "Substituição", valor: 120, feito: true },
  ], { clienteAvisadoEm: h(1) });

  // Agenda de hoje
  await db.insert(schema.agendamentos).values([
    { oficinaId, empresaId: mec.id, titulo: "Revisão – Renegade", detalhe: "Paulo Mendes · Box 2", inicio: hoje(9) },
    { oficinaId, empresaId: ele.id, titulo: "Bateria descarregando – Kwid", detalhe: "Luana Alves", inicio: hoje(10, 30) },
    { oficinaId, empresaId: mec.id, titulo: "Pastilhas de freio – Civic", detalhe: "Bruno Rocha · Box 1", inicio: hoje(13) },
    { oficinaId, empresaId: ele.id, titulo: "Farol e setas – Saveiro", detalhe: "Diego Martins", inicio: hoje(14, 30) },
    { oficinaId, empresaId: ele.id, titulo: "Entrega – Corolla XEi", detalhe: "Ana Ribeiro", inicio: hoje(16), tipo: "entrega" },
  ]);
}
