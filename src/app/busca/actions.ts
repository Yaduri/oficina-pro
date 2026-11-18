"use server";

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getContexto } from "@/lib/oficina";
import { STATUS } from "@/lib/os";
import { formatPlaca, formatTelefone, soDigitos } from "@/lib/utils";

export type ResultadoBusca = {
  tipo: "os" | "veiculo" | "cliente";
  id: string;
  href: string;
  titulo: string;
  detalhe: string;
  placa?: string;
  status?: string;
};

const { ordensServico: os, veiculos, clientes } = schema;

/**
 * Busca do topo: nº da OS, placa, nome, telefone ou CPF/CNPJ.
 */
export async function buscarTudo(texto: string): Promise<ResultadoBusca[]> {
  const q = texto.trim().slice(0, 60);
  if (q.length < 2) return [];
  const { oficina } = await getContexto();
  const db = await getDb();
  const digitos = soDigitos(q);
  const placa = formatPlaca(q).replace(/[^A-Z0-9]/g, "");
  const numero = /^#?\d{1,7}$/.test(q) ? Number(q.replace("#", "")) : null;
  const like = `%${q.replace(/[%_\\]/g, "")}%`;

  // OS: número exato, placa ou nome do cliente
  const condOS = [];
  if (numero) condOS.push(eq(os.numero, numero));
  if (placa.length >= 3) condOS.push(sql`${veiculos.placa} like ${`%${placa}%`}`);
  if (q.length >= 3 && !numero) condOS.push(ilike(clientes.nome, like));
  const ordens =
    condOS.length
      ? await db
          .select({ id: os.id, numero: os.numero, status: os.status, placa: veiculos.placa, modelo: veiculos.modelo, cliente: clientes.nome })
          .from(os)
          .innerJoin(veiculos, eq(veiculos.id, os.veiculoId))
          .leftJoin(clientes, eq(clientes.id, os.clienteId))
          .where(and(eq(os.oficinaId, oficina.id), or(...condOS)))
          .orderBy(desc(os.entradaEm))
          .limit(6)
      : [];

  // Veículos pela placa ou modelo
  const condV = [ilike(veiculos.modelo, like)];
  if (placa.length >= 3) condV.push(sql`${veiculos.placa} like ${`%${placa}%`}`);
  const vs = await db
    .select({ id: veiculos.id, placa: veiculos.placa, marca: veiculos.marca, modelo: veiculos.modelo, cliente: clientes.nome, arquivado: veiculos.arquivadoEm })
    .from(veiculos)
    .leftJoin(clientes, eq(clientes.id, veiculos.clienteId))
    .where(and(eq(veiculos.oficinaId, oficina.id), or(...condV)))
    .orderBy(sql`${veiculos.arquivadoEm} is not null`, veiculos.placa)
    .limit(5);

  // Clientes pelo nome, telefone ou documento
  const condC = [ilike(clientes.nome, like)];
  if (digitos.length >= 4) condC.push(ilike(clientes.telefone, `%${digitos}%`), ilike(clientes.documento, `%${digitos}%`));
  const cs = await db
    .select({ id: clientes.id, nome: clientes.nome, telefone: clientes.telefone, arquivado: clientes.arquivadoEm })
    .from(clientes)
    .where(and(eq(clientes.oficinaId, oficina.id), or(...condC)))
    .orderBy(sql`${clientes.arquivadoEm} is not null`, clientes.nome)
    .limit(5);

  return [
    ...ordens.map((o) => ({
      tipo: "os" as const,
      id: o.id,
      href: `/ordens-servico/${o.id}`,
      titulo: `OS #${o.numero} · ${o.modelo}`,
      detalhe: o.cliente ?? "Sem cliente",
      placa: o.placa,
      status: STATUS[o.status].label,
    })),
    ...vs.map((v) => ({
      tipo: "veiculo" as const,
      id: v.id,
      href: `/veiculos/${v.id}`,
      titulo: [v.marca, v.modelo].filter(Boolean).join(" "),
      detalhe: [v.cliente, v.arquivado ? "arquivado" : null].filter(Boolean).join(" · ") || "Sem dono",
      placa: v.placa,
    })),
    ...cs.map((c) => ({
      tipo: "cliente" as const,
      id: c.id,
      href: `/clientes/${c.id}`,
      titulo: c.nome,
      detalhe: [formatTelefone(c.telefone), c.arquivado ? "arquivado" : null].filter(Boolean).join(" · ") || "Sem telefone",
    })),
  ];
}
