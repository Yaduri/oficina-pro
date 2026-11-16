/*
 * Papéis e o que cada um pode fazer. Usado no servidor (ações e páginas) e na interface
 * (esconder botões). A regra que vale é a do servidor.
 */

export type Papel = "dono" | "gerente" | "financeiro" | "atendente" | "tecnico";

/** Do maior para o menor poder */
export const ORDEM_PAPEIS: Papel[] = ["dono", "gerente", "financeiro", "atendente", "tecnico"];

export const PAPEIS: Record<Papel, { label: string; descricao: string }> = {
  dono: { label: "Dono", descricao: "Acesso total, inclusive usuários e configurações." },
  gerente: { label: "Gerente", descricao: "Acesso total, menos alterar ou remover donos." },
  financeiro: { label: "Financeiro", descricao: "Financeiro, notas e consulta das OS. Não abre OS nem lança itens." },
  atendente: { label: "Atendente", descricao: "Recepção: clientes, check-in, OS, orçamentos e entrega." },
  tecnico: { label: "Técnico", descricao: "Check-in e andamento das OS. Não vê valores." },
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
  | "financeiro";

const TODOS: Papel[] = ORDEM_PAPEIS;

const REGRAS: Record<Acao, Papel[]> = {
  configurar: ["dono", "gerente"],
  usuarios: ["dono", "gerente"],
  verValores: ["dono", "gerente", "financeiro", "atendente"],
  cadastros: ["dono", "gerente", "financeiro", "atendente"],
  checkin: TODOS,
  abrirOS: ["dono", "gerente", "atendente"],
  editarItens: ["dono", "gerente", "atendente"],
  orcamento: ["dono", "gerente", "atendente"],
  /** Entregar, cancelar ou reabrir uma OS */
  fecharOS: ["dono", "gerente", "atendente", "financeiro"],
  financeiro: ["dono", "gerente", "financeiro"],
};

export function pode(papel: Papel, acao: Acao) {
  return REGRAS[acao].includes(papel);
}

/** Quem pode convidar/alterar alguém com este papel */
export function podeGerenciarPapel(quem: Papel, alvo: Papel) {
  if (!pode(quem, "usuarios")) return false;
  return quem === "dono" || alvo !== "dono";
}
