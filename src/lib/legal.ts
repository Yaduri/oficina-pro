/**
 * Dados de quem opera o Oficina Pro, usados nos Termos de uso e na Política de privacidade.
 * Preencher antes de publicar (Fase 6). Campos vazios simplesmente não aparecem nas páginas.
 */
export const LEGAL = {
  /** Nome do serviço */
  servico: "Oficina Pro",
  /** Razão social e CNPJ de quem presta o serviço, ex.: "Fulano Tecnologia Ltda., CNPJ 00.000.000/0001-00" */
  responsavel: process.env.NEXT_PUBLIC_LEGAL_RESPONSAVEL ?? "",
  /** E-mail para pedidos sobre dados pessoais (encarregado/DPO) e suporte */
  email: process.env.NEXT_PUBLIC_LEGAL_EMAIL ?? "",
  /** Cidade/UF do foro, ex.: "São Paulo/SP" */
  foro: process.env.NEXT_PUBLIC_LEGAL_FORO ?? "",
  atualizadoEm: "19 de novembro de 2026",
};
