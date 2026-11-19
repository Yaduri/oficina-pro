import type { Nfe } from "@/lib/nfe-xml";

/** Sugestão de peça para um item da nota */
export type Sugestao = { catalogoItemId: string; fator: number; origem: "codigo_fornecedor" | "gtin" | "codigo" };

/** Resposta da leitura do XML (rota ler) */
export type LeituraNfe =
  | { erro: string; compraId?: string }
  | {
      xmlKey: string;
      nfe: Nfe;
      /** Já cadastrado (pelo CNPJ/CPF); null = será cadastrado com os dados da nota */
      fornecedor: { id: string; nome: string } | null;
      /** Nota emitida para outro CNPJ */
      avisoDestinatario: string | null;
      sugestoes: (Sugestao | null)[];
    };
