import "server-only";
import { getContexto } from "@/lib/oficina";
import { obterVeiculo, opcoesClientes } from "@/lib/cadastros";
import { listarTecnicos } from "@/lib/queries";
import { listarCatalogo } from "@/lib/catalogo";
import type { ResultadoPlaca } from "@/app/(app)/ordens-servico/actions";

/** Dados comuns das telas de novo agendamento e de edição */
export async function dadosDoFormulario(veiculoId?: string | null) {
  const { oficina, empresas } = await getContexto();
  const [clientes, tecnicos, catalogo, v] = await Promise.all([
    opcoesClientes(oficina.id),
    listarTecnicos(oficina.id),
    listarCatalogo(oficina.id, { tipo: "servico", soAtivos: true }),
    veiculoId && /^[0-9a-f-]{36}$/i.test(veiculoId) ? obterVeiculo(oficina.id, veiculoId) : null,
  ]);
  const inicial: ResultadoPlaca | null = v
    ? {
        status: "encontrada",
        placa: v.veiculo.placa,
        veiculo: { id: v.veiculo.id, marca: v.veiculo.marca, modelo: v.veiculo.modelo, ano: v.veiculo.ano, km: v.veiculo.km },
        cliente: v.cliente ? { id: v.cliente.id, nome: v.cliente.nome, telefone: v.cliente.telefone } : null,
      }
    : null;
  return {
    oficina,
    inicial,
    clientes,
    tecnicos,
    empresas: empresas.map((e) => ({ id: e.id, nome: e.nome })),
    catalogo: catalogo.map((c) => ({
      id: c.id,
      tipo: c.tipo,
      codigo: c.codigo,
      descricao: c.descricao,
      valor: c.valor,
      empresaId: c.empresaId,
      tempoMinutos: c.tempoMinutos,
    })),
  };
}
