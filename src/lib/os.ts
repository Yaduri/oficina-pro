import type { Tom } from "@/components/ui";

export type StatusOS =
  | "diagnostico"
  | "aguardando_aprovacao"
  | "aguardando_peca"
  | "em_execucao"
  | "pronto"
  | "entregue"
  | "cancelada";

export const STATUS: Record<StatusOS, { label: string; tom: Tom }> = {
  diagnostico: { label: "Em diagnóstico", tom: "neutro" },
  aguardando_aprovacao: { label: "Aguardando aprovação", tom: "warn" },
  aguardando_peca: { label: "Aguardando peça", tom: "neutro" },
  em_execucao: { label: "Em execução", tom: "info" },
  pronto: { label: "Pronto", tom: "ok" },
  entregue: { label: "Entregue", tom: "neutro" },
  cancelada: { label: "Cancelada", tom: "danger" },
};

/** Colunas do quadro, na ordem do fluxo */
export const COLUNAS: StatusOS[] = ["diagnostico", "aguardando_aprovacao", "aguardando_peca", "em_execucao", "pronto"];

/** Status que contam como "veículo no pátio" */
export const ABERTAS: StatusOS[] = COLUNAS;

/** Status da OS em palavras para o cliente (portal e link de acompanhamento) */
export const STATUS_CLIENTE: Record<StatusOS, { label: string; tom: Tom }> = {
  diagnostico: { label: "Em avaliação", tom: "neutro" },
  aguardando_aprovacao: { label: "Aguardando sua aprovação", tom: "warn" },
  aguardando_peca: { label: "Aguardando peça", tom: "neutro" },
  em_execucao: { label: "Em serviço", tom: "info" },
  pronto: { label: "Pronto para retirada", tom: "ok" },
  entregue: { label: "Entregue", tom: "neutro" },
  cancelada: { label: "Cancelada", tom: "neutro" },
};

/** Status em que o valor da OS já foi combinado com o cliente (mostrado a ele) */
export const COM_TOTAL_CLIENTE: StatusOS[] = ["aguardando_peca", "em_execucao", "pronto", "entregue"];
