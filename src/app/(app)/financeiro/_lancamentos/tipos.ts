/** Tipos compartilhados entre as telas (servidor) e as janelas (navegador) do A receber / A pagar */

export type Opcao = { id: string; nome: string };
export type OpcaoConta = Opcao & { tipo: "caixa" | "banco" | "maquininha" };

/** Listas para os formulários, montadas no servidor */
export type OpcoesForm = {
  hoje: string;
  categorias: Opcao[];
  contas: OpcaoConta[];
  clientes: Opcao[];
  fornecedores: string[];
  centrosCusto: string[];
  formas: { valor: string; label: string }[];
};
