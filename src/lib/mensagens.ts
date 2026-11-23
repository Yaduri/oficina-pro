/*
 * Mensagens de WhatsApp (Fase 5.1). Sem integração direta com o WhatsApp: o sistema monta o
 * texto a partir do modelo da oficina e abre o wa.me no aparelho de quem clicou. Cada abertura
 * fica registrada na tabela `mensagens` (ver registrarMensagem em app/(app)/mensagens/actions.ts).
 *
 * Este arquivo não depende do servidor: pode ser importado em componentes de cliente.
 */

import { linkWhatsApp } from "@/lib/utils";

export type TipoMensagem =
  | "orcamento"
  | "orcamento_respondido"
  | "pronto"
  | "agendamento"
  | "pos_venda"
  | "revisao"
  | "portal"
  | "acompanhamento"
  | "reativacao"
  | "documento"
  | "cobranca"
  | "nota_fiscal"
  | "livre";

/** Variáveis aceitas nos modelos, escritas como {nome} */
export type VariaveisMensagem = Partial<
  Record<
    | "cliente"
    | "oficina"
    | "veiculo"
    | "placa"
    | "os"
    | "total"
    | "link"
    | "nota"
    | "data"
    | "hora"
    | "servico"
    | "pesquisa"
    | "portal"
    | "acompanhamento"
    | "telefone_oficina",
    string
  >
>;

export type ModeloMensagem = {
  tipo: TipoMensagem;
  label: string;
  /** Quando é usado (aparece na tela de modelos) */
  quando: string;
  /** Variáveis que fazem sentido neste modelo */
  variaveis: (keyof VariaveisMensagem)[];
  /** Texto padrão */
  padrao: string;
  /** Mensagem de relacionamento: só vai para quem deu consentimento (LGPD) */
  marketing?: boolean;
};

/** Modelos editáveis nas Configurações → Mensagens, na ordem em que aparecem */
export const MODELOS: ModeloMensagem[] = [
  {
    tipo: "orcamento",
    label: "Orçamento pronto",
    quando: "Ao enviar o orçamento para aprovação",
    variaveis: ["cliente", "veiculo", "placa", "os", "total", "acompanhamento", "link", "oficina"],
    padrao:
      "Olá, {cliente}! Segue o orçamento do seu {veiculo} ({placa}), OS #{os}, no valor de {total}. Você pode aprovar e acompanhar o serviço pelo link: {acompanhamento}",
  },
  {
    tipo: "orcamento_respondido",
    label: "Orçamento respondido (para a oficina)",
    quando: "Na página do orçamento, depois que o cliente responde, para ele avisar a oficina",
    variaveis: ["cliente", "veiculo", "placa", "os", "oficina"],
    padrao: "Olá, {oficina}! Acabei de responder o orçamento da OS #{os} do {veiculo} ({placa}).",
  },
  {
    tipo: "pronto",
    label: "Veículo pronto",
    quando: "Avisar cliente, quando a OS fica pronta",
    variaveis: ["cliente", "veiculo", "placa", "os", "total", "acompanhamento", "oficina"],
    padrao: "Olá, {cliente}! Seu {veiculo} ({placa}) está pronto para retirada na {oficina}. Total: {total}. Detalhes do serviço: {acompanhamento}",
  },
  {
    tipo: "acompanhamento",
    label: "Link de acompanhamento",
    quando: "Na tela da OS, ao enviar ao cliente o link para acompanhar o serviço",
    variaveis: ["cliente", "veiculo", "placa", "os", "acompanhamento", "oficina"],
    padrao: "Olá, {cliente}! Neste link você acompanha o serviço do seu {veiculo} ({placa}), OS #{os}, na {oficina}: {acompanhamento}",
  },
  {
    tipo: "agendamento",
    label: "Lembrete de agendamento",
    quando: "Na agenda e na fila de mensagens, na véspera do agendamento",
    variaveis: ["cliente", "veiculo", "placa", "data", "hora", "servico", "oficina"],
    padrao: "Olá, {cliente}! Lembrete do seu agendamento {data} às {hora} para o {veiculo} ({placa}): {servico}. Podemos confirmar?",
  },
  {
    tipo: "pos_venda",
    label: "Pós-venda e pesquisa de satisfação",
    quando: "Alguns dias depois da entrega (configurável)",
    variaveis: ["cliente", "veiculo", "placa", "os", "pesquisa", "oficina"],
    padrao:
      "Olá, {cliente}! Aqui é da {oficina}. Está tudo certo com o seu {veiculo} depois do serviço? Se puder, conte como foi o atendimento, leva menos de um minuto: {pesquisa}",
    marketing: true,
  },
  {
    tipo: "revisao",
    label: "Lembrete de revisão",
    quando: "Quando uma revisão do veículo está chegando (por data ou km)",
    variaveis: ["cliente", "veiculo", "placa", "servico", "data", "oficina"],
    padrao: "Olá, {cliente}! Está chegando a hora de fazer {servico} no seu {veiculo} ({placa}), prevista para {data}. Quer agendar com a {oficina}?",
    marketing: true,
  },
  {
    tipo: "portal",
    label: "Link do portal do cliente",
    quando: "Ao enviar ao cliente o link com o histórico dos veículos",
    variaveis: ["cliente", "portal", "oficina"],
    padrao: "Olá, {cliente}! Neste link você acompanha os serviços dos seus veículos na {oficina}: {portal}",
  },
  {
    tipo: "reativacao",
    label: "Cliente inativo",
    quando: "Nos relatórios, para chamar de volta quem não aparece há muito tempo",
    variaveis: ["cliente", "veiculo", "placa", "oficina"],
    padrao: "Olá, {cliente}! Faz tempo que o seu {veiculo} não passa pela {oficina}. Quer agendar uma revisão?",
    marketing: true,
  },
  {
    tipo: "nota_fiscal",
    label: "Nota fiscal emitida",
    quando: "Ao enviar a NFS-e (DANFSe em PDF) ao cliente",
    variaveis: ["cliente", "nota", "os", "veiculo", "placa", "total", "link", "oficina"],
    padrao: "Olá, {cliente}! A nota fiscal nº {nota} dos serviços da OS #{os} ({veiculo}) foi emitida pela {oficina}. Você pode abrir o PDF aqui: {link}",
  },
];

export const MODELO_POR_TIPO = Object.fromEntries(MODELOS.map((m) => [m.tipo, m])) as Partial<Record<TipoMensagem, ModeloMensagem>>;

export const LABEL_TIPO: Record<TipoMensagem, string> = {
  orcamento: "Orçamento",
  orcamento_respondido: "Orçamento respondido",
  pronto: "Veículo pronto",
  agendamento: "Agendamento",
  pos_venda: "Pós-venda",
  revisao: "Revisão",
  portal: "Portal do cliente",
  acompanhamento: "Acompanhamento",
  reativacao: "Cliente inativo",
  documento: "Documento",
  cobranca: "Cobrança",
  nota_fiscal: "Nota fiscal",
  livre: "Mensagem",
};

/** Texto do modelo da oficina, ou o padrão */
export function textoModelo(modelos: Partial<Record<string, string>> | null | undefined, tipo: TipoMensagem) {
  const proprio = modelos?.[tipo]?.trim();
  return proprio || MODELO_POR_TIPO[tipo]?.padrao || "";
}

/**
 * Troca {variavel} pelo valor. Variável sem valor some junto com o que a cerca de forma segura:
 * ", {cliente}!" vira "!", " ({placa})" some, "Total: {total}." some inteiro.
 */
export function montarMensagem(modelo: string, vars: VariaveisMensagem) {
  const valor = (k: string) => (vars as Record<string, string | undefined>)[k]?.trim() ?? "";
  let s = modelo;
  // Frase curta que só existe por causa da variável ("Total: {total}.")
  s = s.replace(/\s*[A-Za-zÀ-ú ]{1,20}:\s*\{(\w+)\}\./g, (m, k) => (valor(k) ? m : ""));
  // Vírgula + variável (", {cliente}")
  s = s.replace(/,\s*\{(\w+)\}/g, (m, k) => (valor(k) ? m : ""));
  // Variável entre parênteses (" ({placa})")
  s = s.replace(/\s*\(\{(\w+)\}\)/g, (m, k) => (valor(k) ? m : ""));
  s = s.replace(/\{(\w+)\}/g, (_m, k) => valor(k));
  return s.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}

/** Link wa.me com o texto; sem telefone válido abre o WhatsApp para escolher o contato */
export function linkMensagem(telefone: string | null | undefined, texto: string) {
  return `${linkWhatsApp(telefone) ?? "https://wa.me/"}?text=${encodeURIComponent(texto)}`;
}

/** Primeiro nome do cliente, para a saudação */
export const primeiroNome = (nome: string | null | undefined) => nome?.trim().split(/\s+/)[0] ?? "";

/** "Fiat Uno" a partir de marca e modelo */
export const nomeVeiculo = (v: { marca?: string | null; modelo?: string | null } | null | undefined) =>
  [v?.marca, v?.modelo].filter(Boolean).join(" ");

/** Item da fila de mensagens (/mensagens): algo que a oficina deveria mandar e ainda não mandou */
export type PendenciaMensagem = {
  /** Única na fila (ex.: "pronto:<osId>") */
  chave: string;
  tipo: TipoMensagem;
  /** Quando passou (ou passa) a valer, para ordenar */
  quando: string;
  titulo: string;
  detalhe?: string;
  clienteId: string | null;
  clienteNome: string | null;
  telefone: string | null;
  /** Cliente deu consentimento para mensagens de relacionamento (LGPD) */
  aceitaWhatsapp: boolean;
  texto: string;
  /** Página relacionada (OS, agendamento, veículo) */
  href?: string;
  refs: { osId?: string; agendamentoId?: string; veiculoId?: string; refId?: string };
};

/* ---------- Acrescentado na 5.1 (fila, histórico e tela de modelos) ---------- */

/**
 * Texto gravado em `mensagens` quando um item da fila é dispensado sem enviar (telefone nulo).
 * O histórico mostra essas linhas como "Dispensada".
 */
export const TEXTO_DISPENSADA = "(dispensada)";

/** Nome de cada variável na tela de modelos */
export const LABEL_VARIAVEL: Record<keyof VariaveisMensagem, string> = {
  cliente: "Cliente",
  oficina: "Oficina",
  veiculo: "Veículo",
  placa: "Placa",
  os: "Nº da OS",
  total: "Total",
  link: "Link do documento (no orçamento, o de acompanhamento)",
  nota: "Nº da nota",
  data: "Data",
  hora: "Hora",
  servico: "Serviço",
  pesquisa: "Link da pesquisa",
  portal: "Link do portal",
  acompanhamento: "Link de acompanhamento",
  telefone_oficina: "Telefone da oficina",
};

/** Dados de exemplo para a prévia dos modelos */
export const EXEMPLO_VARIAVEIS: VariaveisMensagem = {
  cliente: "Maria",
  veiculo: "Fiat Argo",
  placa: "ABC1D23",
  os: "128",
  total: "R$ 850,00",
  link: "https://exemplo.com/documento/abc",
  nota: "202600001",
  data: "amanhã",
  hora: "09:00",
  servico: "troca de óleo",
  pesquisa: "https://exemplo.com/pesquisa/abc",
  portal: "https://exemplo.com/portal/abc",
  acompanhamento: "https://exemplo.com/acompanhamento/abc",
  telefone_oficina: "(11) 3333-4444",
};

/** Variáveis escritas no texto que o modelo não conhece (ex.: erro de digitação) */
export function variaveisDesconhecidas(texto: string, aceitas: readonly string[]) {
  const achadas = [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  return [...new Set(achadas.filter((v) => !aceitas.includes(v)))];
}
