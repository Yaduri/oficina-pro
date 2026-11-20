/*
 * Papéis e o que cada um pode fazer. Usado no servidor (ações e páginas) e na interface
 * (esconder botões). A regra que vale é a do servidor.
 */

export type Papel = "dono" | "gerente" | "financeiro" | "atendente" | "tecnico" | "contador";

/** Do maior para o menor poder */
export const ORDEM_PAPEIS: Papel[] = ["dono", "gerente", "financeiro", "atendente", "tecnico", "contador"];

export const PAPEIS: Record<Papel, { label: string; descricao: string }> = {
  dono: { label: "Dono", descricao: "Acesso total, inclusive usuários e configurações." },
  gerente: { label: "Gerente", descricao: "Acesso total, menos alterar ou remover donos." },
  financeiro: { label: "Financeiro", descricao: "Financeiro, notas e consulta das OS. Não abre OS nem lança itens." },
  atendente: { label: "Atendente", descricao: "Recepção: clientes, check-in, OS, orçamentos e entrega." },
  tecnico: { label: "Técnico", descricao: "Check-in e andamento das OS. Não vê valores." },
  contador: { label: "Contador", descricao: "Acesso somente leitura às notas fiscais, XMLs e exportação mensal." },
};

export type Acao =
  | "configurar"
  | "usuarios"
  | "verValores"
  | "cadastros"
  | "checkin"
  | "abrirOS"
  | "editarItens"
  | "orcamento"
  | "fecharOS"
  | "financeiro"
  /** Ver notas fiscais, XMLs, PDFs e exportar pacote mensal do contador */
  | "fiscal"
  /** Emitir, cancelar, substituir e reenviar notas fiscais */
  | "emitirNota"
  /** Estoque, compras e fornecedores */
  | "estoque"
  /** Mensagens de WhatsApp aos clientes (fila, histórico) */
  | "mensagens"
  /** Relatórios gerenciais */
  | "relatorios";

const OPERACIONAL: Papel[] = ["dono", "gerente", "financeiro", "atendente", "tecnico"];

const REGRAS: Record<Acao, Papel[]> = {
  configurar: ["dono", "gerente"],
  usuarios: ["dono", "gerente"],
  verValores: ["dono", "gerente", "financeiro", "atendente"],
  cadastros: ["dono", "gerente", "financeiro", "atendente"],
  checkin: OPERACIONAL,
  abrirOS: ["dono", "gerente", "atendente"],
  editarItens: ["dono", "gerente", "atendente"],
  orcamento: ["dono", "gerente", "atendente"],
  /** Entregar, cancelar ou reabrir uma OS */
  fecharOS: ["dono", "gerente", "atendente", "financeiro"],
  financeiro: ["dono", "gerente", "financeiro"],
  fiscal: ["dono", "gerente", "financeiro", "contador"],
  emitirNota: ["dono", "gerente", "financeiro"],
  estoque: ["dono", "gerente", "financeiro", "atendente"],
  mensagens: ["dono", "gerente", "financeiro", "atendente"],
  relatorios: ["dono", "gerente", "financeiro"],
};

export function pode(papel: Papel, acao: Acao) {
  return REGRAS[acao].includes(papel);
}

/** Quem pode convidar/alterar alguém com este papel */
export function podeGerenciarPapel(quem: Papel, alvo: Papel) {
  if (!pode(quem, "usuarios")) return false;
  return quem === "dono" || alvo !== "dono";
}
