import "server-only";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { DadosIbsCbs, RetencoesFiscais, StatusNotaFiscal } from "@/db/schema";
import { Cabecalho, COR, Dados, Rodape, s, type Identificacao } from "@/lib/pdf/base";
import type { ImagemPdf } from "@/lib/pdf/imagens";
import { formatBRL, formatData, formatDocumento, formatTelefone } from "@/lib/utils";

/*
 * DANFSe (Documento Auxiliar da NFS-e Nacional) em PDF via @react-pdf/renderer.
 * Compatível com Cloudflare Workers. Usado tanto como fallback imediato da SEFIN/ADN
 * quanto na regeneração com carimbo de CANCELADA / SUBSTITUÍDA.
 */

export type DanfseProps = {
  id: Identificacao;
  logo: ImagemPdf | null;
  inscricaoMunicipal: string | null;
  ambiente: "homologacao" | "producao";
  status: StatusNotaFiscal;
  numeroNota: string | null;
  serieDps: string;
  numeroDps: number;
  chaveAcesso: string | null;
  codigoVerificacao: string | null;
  competencia: string; // AAAA-MM-DD
  emitidaEm: Date | null;
  numeroOS: number | null;
  tomador: {
    nome: string;
    documento: string | null;
    email: string | null;
    telefone: string | null;
    endereco: string | null;
  };
  codigoTribNacional: string;
  codigoTribMunicipal: string | null;
  discriminacao: string;
  valorServicos: number;
  valorDesconto: number;
  baseCalculo: number;
  aliquotaIss: number | null;
  valorIss: number;
  issRetido: boolean;
  valorRetencoes: number;
  valorLiquido: number;
  retencoes: RetencoesFiscais | null;
  ibsCbs: DadosIbsCbs | null;
  motivoCancelamento: string | null;
  canceladaEm: Date | null;
};

const dataBR = (iso: string) => iso.split("-").reverse().join("/");

function formatarCodigoTrib(c: string) {
  const d = c.replace(/\D/g, "");
  return d.length === 6 ? `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}` : c;
}

export function DanfsePdf(p: DanfseProps) {
  const cancelada = p.status === "cancelada";
  const substituida = p.status === "substituida";
  const homolog = p.ambiente === "homologacao";
  const linhasCab = [
    p.emitidaEm ? `Emissão ${formatData(p.emitidaEm)}` : null,
    `Competência ${dataBR(p.competencia)}`,
    `DPS ${p.serieDps}/${p.numeroDps}`,
    p.numeroOS ? `OS nº ${p.numeroOS}` : null,
  ].filter((x): x is string => !!x);

  return (
    <Document title={`DANFSe ${p.numeroNota ?? `DPS-${p.numeroDps}`}`} author={p.id.titulo} language="pt-BR">
      <Page size="A4" style={s.pagina}>
        <Cabecalho
          id={p.id}
          logo={p.logo}
          documento="DANFSe"
          numero={p.numeroNota ? `NFS-e nº ${p.numeroNota}` : `DPS nº ${p.numeroDps}`}
          linhas={linhasCab}
          via={homolog ? "HOMOLOGAÇÃO · SEM VALOR FISCAL" : undefined}
        />

        {(cancelada || substituida) && (
          <View style={[s.secao, { borderWidth: 1.5, borderColor: COR.perigo, backgroundColor: "#fef2f2", borderRadius: 4, padding: 8 }]} wrap={false}>
            <Text style={[s.negrito, { color: COR.perigo, fontSize: 10 }]}>
              {cancelada ? "NOTA FISCAL CANCELADA" : "NOTA FISCAL SUBSTITUÍDA"}
            </Text>
            {p.canceladaEm && <Text style={{ color: COR.perigo, fontSize: 8 }}>Data: {formatData(p.canceladaEm)}</Text>}
            {p.motivoCancelamento && <Text style={{ color: COR.texto, fontSize: 8.5, marginTop: 2 }}>Motivo: {p.motivoCancelamento}</Text>}
          </View>
        )}

        {p.chaveAcesso && (
          <View style={[s.secao, s.caixa, { backgroundColor: COR.fundo }]} wrap={false}>
            <Text style={[s.muted, { fontSize: 7.5 }]}>CHAVE DE ACESSO DA NFS-e NACIONAL</Text>
            <Text style={[s.negrito, { fontSize: 9.5, letterSpacing: 0.6, marginTop: 2 }]}>{p.chaveAcesso}</Text>
            {p.codigoVerificacao && <Text style={[s.muted, { fontSize: 7.5, marginTop: 2 }]}>Código de verificação: {p.codigoVerificacao}</Text>}
          </View>
        )}

        <View style={[s.linha, s.secao, { gap: 10 }]} wrap={false}>
          <Dados
            titulo="Prestador de serviços"
            pares={[
              ["Razão social", p.id.razaoSocial || p.id.titulo],
              ["CNPJ", p.id.cnpj],
              ["Inscr. Mun.", p.inscricaoMunicipal],
              ["Endereço", p.id.endereco],
              ["Contato", [p.id.telefone, p.id.email].filter(Boolean).join(" · ") || null],
            ]}
          />
          <Dados
            titulo="Tomador de serviços"
            pares={[
              ["Nome / Razão", p.tomador.nome],
              ["CPF / CNPJ", p.tomador.documento ? formatDocumento(p.tomador.documento) : "Não informado"],
              ["Endereço", p.tomador.endereco],
              ["Telefone", p.tomador.telefone ? formatTelefone(p.tomador.telefone) : null],
              ["E-mail", p.tomador.email],
            ]}
          />
        </View>

        <View style={s.secao} wrap={false}>
          <Text style={s.tituloSecao}>Serviço prestado</Text>
          <View style={s.caixa}>
            <View style={[s.linha, { gap: 16, marginBottom: 6, paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: COR.borda }]}>
              <View>
                <Text style={[s.muted, { fontSize: 7.5 }]}>Código de Tributação Nacional (LC 116)</Text>
                <Text style={s.negrito}>{formatarCodigoTrib(p.codigoTribNacional)}</Text>
              </View>
              {p.codigoTribMunicipal && (
                <View>
                  <Text style={[s.muted, { fontSize: 7.5 }]}>Código Municipal</Text>
                  <Text style={s.negrito}>{p.codigoTribMunicipal}</Text>
                </View>
              )}
              <View>
                <Text style={[s.muted, { fontSize: 7.5 }]}>ISSQN</Text>
                <Text style={s.negrito}>{p.issRetido ? "Retido pelo tomador" : "Recolhido pelo prestador"}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 9, lineHeight: 1.45 }}>{p.discriminacao}</Text>
          </View>
        </View>

        <View style={s.secao} wrap={false}>
          <Text style={s.tituloSecao}>Valores e tributos</Text>
          <View style={s.caixa}>
            <View style={[s.linha, { justifyContent: "space-between", paddingVertical: 2 }]}>
              <Text style={s.suave}>Valor dos serviços</Text>
              <Text>{formatBRL(p.valorServicos)}</Text>
            </View>
            {p.valorDesconto > 0 && (
              <View style={[s.linha, { justifyContent: "space-between", paddingVertical: 2 }]}>
                <Text style={s.suave}>Desconto incondicionado</Text>
                <Text>- {formatBRL(p.valorDesconto)}</Text>
              </View>
            )}
            <View style={[s.linha, { justifyContent: "space-between", paddingVertical: 2 }]}>
              <Text style={s.suave}>Base de cálculo do ISS</Text>
              <Text>{formatBRL(p.baseCalculo)}</Text>
            </View>
            <View style={[s.linha, { justifyContent: "space-between", paddingVertical: 2 }]}>
              <Text style={s.suave}>
                ISSQN {p.aliquotaIss != null ? `(${p.aliquotaIss.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%)` : "(Simples Nacional / MEI)"}
              </Text>
              <Text>{formatBRL(p.valorIss)}</Text>
            </View>
            {p.valorRetencoes > 0 && (
              <View style={[s.linha, { justifyContent: "space-between", paddingVertical: 2 }]}>
                <Text style={s.suave}>
                  Retenções federais{" "}
                  {p.retencoes
                    ? `(${[
                        p.retencoes.pis ? `PIS ${formatBRL(p.retencoes.pis)}` : null,
                        p.retencoes.cofins ? `COFINS ${formatBRL(p.retencoes.cofins)}` : null,
                        p.retencoes.csll ? `CSLL ${formatBRL(p.retencoes.csll)}` : null,
                        p.retencoes.irrf ? `IRRF ${formatBRL(p.retencoes.irrf)}` : null,
                        p.retencoes.inss ? `INSS ${formatBRL(p.retencoes.inss)}` : null,
                      ]
                        .filter(Boolean)
                        .join(", ")})`
                    : ""}
                </Text>
                <Text>- {formatBRL(p.valorRetencoes)}</Text>
              </View>
            )}
            <View style={[s.linha, { justifyContent: "space-between", borderTopWidth: 1, borderTopColor: COR.texto, marginTop: 4, paddingTop: 5 }]}>
              <Text style={[s.negrito, { fontSize: 11 }]}>Valor líquido da NFS-e</Text>
              <Text style={[s.negrito, { fontSize: 11 }]}>{formatBRL(p.valorLiquido)}</Text>
            </View>
          </View>
        </View>

        {p.ibsCbs && (p.ibsCbs.cst || p.ibsCbs.cClassTrib) && (
          <View style={s.secao} wrap={false}>
            <Text style={s.tituloSecao}>Reforma Tributária — IBS / CBS (LC 214/2025)</Text>
            <View style={[s.caixa, s.linha, { gap: 16, flexWrap: "wrap" }]}>
              {p.ibsCbs.cst && <Text style={s.suave}>CST: {p.ibsCbs.cst}</Text>}
              {p.ibsCbs.cClassTrib && <Text style={s.suave}>Class. Trib.: {p.ibsCbs.cClassTrib}</Text>}
              {p.ibsCbs.cIndOp && <Text style={s.suave}>Ind. Op.: {p.ibsCbs.cIndOp}</Text>}
              {p.ibsCbs.pIbsUf != null && <Text style={s.suave}>IBS UF: {p.ibsCbs.pIbsUf}%</Text>}
              {p.ibsCbs.pIbsMun != null && <Text style={s.suave}>IBS Mun: {p.ibsCbs.pIbsMun}%</Text>}
              {p.ibsCbs.pCbs != null && <Text style={s.suave}>CBS: {p.ibsCbs.pCbs}%</Text>}
            </View>
          </View>
        )}

        <View style={[s.secao, { marginTop: 18 }]} wrap={false}>
          <Text style={[s.muted, { fontSize: 7.5 }]}>
            Documento Auxiliar da Nota Fiscal de Serviços Eletrônica (Padrão Nacional). Consulte a autenticidade em https://www.nfse.gov.br/ConsultaPublica/
          </Text>
        </View>

        <Rodape texto={`${p.id.titulo} · DANFSe${p.numeroNota ? ` nº ${p.numeroNota}` : ""}`} />
      </Page>
    </Document>
  );
}

export async function renderizarDanfseBuffer(props: DanfseProps): Promise<Buffer> {
  return renderToBuffer(<DanfsePdf {...props} />);
}
