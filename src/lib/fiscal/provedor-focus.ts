import "server-only";
import type { ProvedorFiscalTipo } from "@/db/schema";
import { provedorNfseNacional } from "./provedor-nfse-nacional";
import type { ProvedorFiscal } from "./tipos";

/*
 * Stub do provedor Focus NFe (mesma interface ProvedorFiscal).
 * Reservado para a etapa 3.3 (NF-e / NFC-e de peças), caso a oficina passe a emitir notas de produto.
 */
export const provedorFocusNfe: ProvedorFiscal = {
  nome: "focus_nfe",
  async emitirNfse(entrada) {
    return {
      situacao: "rejeitada",
      idDps: `FOCUS-${entrada.serieDps}-${entrada.numeroDps}`,
      xmlDpsAssinado: "",
      mensagem: "Focus NFe ainda não foi ativado nesta conta. Use a emissão direta pela NFS-e Nacional.",
      erros: [{ codigo: "NAO_IMPLEMENTADO", mensagem: "Provedor Focus NFe reservado para NF-e/NFC-e de peças (etapa 3.3)." }],
    };
  },
  async consultarNfse() {
    return { ok: false, transitorio: false, mensagem: "Focus NFe ainda não ativado." };
  },
  async cancelarNfse() {
    return { ok: false, transitorio: false, mensagem: "Focus NFe ainda não ativado." };
  },
};

export function obterProvedorFiscal(tipo: ProvedorFiscalTipo): ProvedorFiscal {
  return tipo === "focus_nfe" ? provedorFocusNfe : provedorNfseNacional;
}
