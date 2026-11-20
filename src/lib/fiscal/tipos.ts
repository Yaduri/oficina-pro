import type { AmbienteFiscal, DadosIbsCbs, ErroFiscalItem, ProvedorFiscalTipo, RetencoesFiscais, StatusNotaFiscal } from "@/db/schema";

/*
 * Camada única de emissão fiscal (ProvedorFiscal).
 * Hoje: NFS-e Nacional direta (API da SEFIN Nacional, sem provedor pago).
 * Futuro (3.3): Focus NFe (NF-e / NFC-e de peças) pela mesma interface.
 */

export type CertificadoDescriptografado = {
  certPem: string;
  keyPem: string;
  pfxBase64?: string;
  senha?: string;
};

export type ContextoProvedor = {
  oficinaId: string;
  ambiente: AmbienteFiscal;
  certificado: CertificadoDescriptografado | null;
  tokenProvedor?: string | null;
};

export type EnderecoFiscal = {
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  codigoIbge?: string | null;
};

export type EntradaEmissaoNfse = {
  notaId: string;
  ambiente: AmbienteFiscal;
  serieDps: string;
  numeroDps: number;
  competencia: string; // AAAA-MM-DD
  emitidaEmIso: string; // AAAA-MM-DDThh:mm:ss-03:00
  codigoMunicipioEmissor: string; // 7 dígitos IBGE
  prestador: {
    cnpj: string;
    inscricaoMunicipal?: string | null;
    razaoSocial: string;
    endereco?: EnderecoFiscal;
    telefone?: string | null;
    email?: string | null;
    optanteSimplesNacional: "1" | "2" | "3";
    regimeApuracaoSn: "1" | "2" | "3";
    regimeEspecialTrib: string;
  };
  tomador: {
    nome: string;
    documento?: string | null; // CPF (11) ou CNPJ (14)
    email?: string | null;
    telefone?: string | null;
    endereco?: EnderecoFiscal;
  };
  servico: {
    codigoMunicipioPrestacao: string;
    codigoTribNacional: string; // 6 dígitos (ex.: 140101)
    codigoTribMunicipal?: string | null;
    discriminacao: string;
  };
  valores: {
    valorServicos: number;
    valorDesconto: number;
    aliquotaIss: number | null;
    issRetido: boolean;
    retencoes?: RetencoesFiscais | null;
  };
  ibsCbs?: DadosIbsCbs | null;
  /** Quando é substituição de uma nota já autorizada */
  substituicao?: {
    chaveSubstituida: string;
    codigoMotivo: "01" | "02" | "03" | "04" | "05" | "99";
    motivo: string;
  } | null;
};

export type ResultadoEmissaoNfse =
  | {
      situacao: "autorizada";
      idDps: string;
      xmlDpsAssinado: string;
      chaveAcesso: string;
      numeroNota: string | null;
      codigoVerificacao: string | null;
      protocolo: string | null;
      xmlNfse: string;
      apiRef?: string | null;
    }
  | {
      situacao: "rejeitada";
      idDps: string;
      xmlDpsAssinado: string;
      mensagem: string;
      erros: ErroFiscalItem[];
    }
  | {
      /** Falha temporária (SEFIN fora, timeout, mTLS ausente): permanece na fila para nova tentativa */
      situacao: "transitorio";
      idDps: string;
      xmlDpsAssinado: string;
      mensagem: string;
      erros?: ErroFiscalItem[];
    };

export type ResultadoConsultaNfse =
  | {
      ok: true;
      status: StatusNotaFiscal;
      chaveAcesso: string;
      numeroNota?: string | null;
      codigoVerificacao?: string | null;
      xmlNfse?: string | null;
      mensagem?: string;
    }
  | {
      ok: false;
      transitorio: boolean;
      mensagem: string;
      erros?: ErroFiscalItem[];
    };

export type EntradaCancelamentoNfse = {
  ambiente: AmbienteFiscal;
  cnpjAutor: string;
  chaveAcesso: string;
  codigoMotivo: "1" | "2" | "9";
  motivo: string;
  dhEventoIso: string;
  sequencia?: number;
};

export type ResultadoCancelamentoNfse =
  | {
      ok: true;
      xmlEventoAssinado: string;
      xmlRetorno: string;
      protocolo?: string | null;
    }
  | {
      ok: false;
      transitorio: boolean;
      xmlEventoAssinado?: string;
      mensagem: string;
      erros?: ErroFiscalItem[];
    };

export interface ProvedorFiscal {
  readonly nome: ProvedorFiscalTipo;
  emitirNfse(entrada: EntradaEmissaoNfse, ctx: ContextoProvedor): Promise<ResultadoEmissaoNfse>;
  consultarNfse(chaveOuRef: string, ctx: ContextoProvedor): Promise<ResultadoConsultaNfse>;
  cancelarNfse(entrada: EntradaCancelamentoNfse, ctx: ContextoProvedor): Promise<ResultadoCancelamentoNfse>;
  baixarDanfse?(chaveOuRef: string, ctx: ContextoProvedor): Promise<Buffer | null>;
}

/** Códigos de tributação nacional (LC 116 item 14.01) mais usados em oficinas mecânicas e autoelétricas */
export const CODIGOS_SERVICO_OFICINA = [
  { codigo: "140101", label: "14.01.01 — Manutenção, revisão, conserto e reparação de veículos" },
  { codigo: "140102", label: "14.01.02 — Lubrificação, limpeza, lustração e revisão de veículos" },
  { codigo: "140103", label: "14.01.03 — Instalação e manutenção elétrica/eletrônica automotiva" },
  { codigo: "140104", label: "14.01.04 — Alinhamento, balanceamento e suspensão" },
  { codigo: "140105", label: "14.01.05 — Funilaria, lanternagem e pintura automotiva" },
] as const;

export const MOTIVOS_CANCELAMENTO_NFSE = [
  { codigo: "1" as const, label: "1 — Erro na emissão" },
  { codigo: "2" as const, label: "2 — Serviço não prestado" },
  { codigo: "9" as const, label: "9 — Outros" },
] as const;

export const MOTIVOS_SUBSTITUICAO_NFSE = [
  { codigo: "01" as const, label: "01 — Desenquadramento de NFS-e do Simples Nacional" },
  { codigo: "02" as const, label: "02 — Enquadramento de NFS-e no Simples Nacional" },
  { codigo: "03" as const, label: "03 — Inclusão retroativa de imunidade/isenção para NFS-e" },
  { codigo: "04" as const, label: "04 — Exclusão retroativa de imunidade/isenção para NFS-e" },
  { codigo: "05" as const, label: "05 — Rejeição de NFS-e pelo tomador ou intermediário" },
  { codigo: "99" as const, label: "99 — Outros" },
] as const;

export const STATUS_NOTA_LABEL: Record<StatusNotaFiscal, { label: string; tom: "ok" | "warn" | "danger" | "info" | "neutro" }> = {
  fila: { label: "Na fila", tom: "warn" },
  processando: { label: "Processando", tom: "info" },
  autorizada: { label: "Autorizada", tom: "ok" },
  rejeitada: { label: "Rejeitada", tom: "danger" },
  cancelada: { label: "Cancelada", tom: "neutro" },
  substituida: { label: "Substituída", tom: "neutro" },
};
