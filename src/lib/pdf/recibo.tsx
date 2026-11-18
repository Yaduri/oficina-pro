import "server-only";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { FORMAS, ehForma } from "@/lib/financeiro";
import { obterOS } from "@/lib/queries";
import { situacaoRecebimento } from "@/lib/recebimento";
import { formatBRL, formatData } from "@/lib/utils";
import { Assinatura, Cabecalho, COR, Dados, Rodape, s, type Identificacao } from "./base";
import { ident, logoDa, pessoa, veiculoPdf } from "./gerar";
import { oficinaCompleta, placaArquivo } from "./carregar";
import type { ImagemPdf } from "./imagens";

/* ---------- Valor por extenso ---------- */

const UNID = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEM = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** 0–999 por extenso */
function ate999(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CEM[c]);
  if (r < 20) {
    if (r) partes.push(UNID[r]);
  } else {
    partes.push(DEZ[Math.floor(r / 10)] + (r % 10 ? ` e ${UNID[r % 10]}` : ""));
  }
  return partes.join(" e ");
}

/** Inteiro até 999.999.999 por extenso */
function inteiro(n: number): string {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const grupos: string[] = [];
  if (milhoes) grupos.push(`${ate999(milhoes)} ${milhoes === 1 ? "milhão" : "milhões"}`);
  if (milhares) grupos.push(milhares === 1 ? "mil" : `${ate999(milhares)} mil`);
  if (resto) grupos.push(ate999(resto));
  // "mil e cem", "mil duzentos e trinta": usa "e" antes do último grupo quando ele é redondo ou < 100
  if (grupos.length > 1 && resto && (resto < 100 || resto % 100 === 0)) {
    const ult = grupos.pop()!;
    return `${grupos.join(" ")} e ${ult}`;
  }
  return grupos.join(" ");
}

/** "quatrocentos e vinte reais e cinquenta centavos" */
export function valorPorExtenso(centavos: number) {
  const r = Math.floor(centavos / 100);
  const c = centavos % 100;
  const partes: string[] = [];
  if (r) partes.push(`${inteiro(r)}${r % 1_000_000 === 0 && r >= 1_000_000 ? " de" : ""} ${r === 1 ? "real" : "reais"}`);
  if (c) partes.push(`${inteiro(c)} ${c === 1 ? "centavo" : "centavos"}`);
  return partes.join(" e ") || "zero reais";
}

/* ---------- Documento ---------- */

type Pessoa = ReturnType<typeof pessoa>;
type VeiculoPdf = ReturnType<typeof veiculoPdf>;

export type ReciboPdfProps = {
  id: Identificacao;
  logo: ImagemPdf | null;
  numeroOS: number;
  emitidoEm: string;
  cliente: Pessoa;
  veiculo: VeiculoPdf;
  pagamentos: { data: string; forma: string; valor: number }[];
  totalOS: number;
  recebido: number;
  saldo: number;
};

const brl = (c: number) => formatBRL(c / 100);

export function ReciboPdf(p: ReciboPdfProps) {
  const cel = { paddingVertical: 4, paddingHorizontal: 6 };
  return (
    <Document title={`Recibo OS ${p.numeroOS} - ${p.veiculo.placa}`} author={p.id.titulo} language="pt-BR">
      <Page size="A4" style={s.pagina}>
        <Cabecalho id={p.id} logo={p.logo} documento="Recibo" numero={`OS nº ${p.numeroOS}`} linhas={[`Emitido em ${p.emitidoEm}`]} />

        <View style={[s.secao, s.caixa, { padding: 12 }]} wrap={false}>
          <View style={[s.linha, { justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }]}>
            <Text style={[s.negrito, { fontSize: 11 }]}>Valor recebido</Text>
            <Text style={[s.negrito, { fontSize: 16 }]}>{brl(p.recebido)}</Text>
          </View>
          <Text style={{ fontSize: 10, lineHeight: 1.5 }}>
            Recebemos de <Text style={s.negrito}>{p.cliente?.nome ?? "cliente"}</Text>
            {p.cliente?.documento ? `, CPF/CNPJ ${p.cliente.documento},` : ""} a importância de {brl(p.recebido)} ({valorPorExtenso(p.recebido)}), referente
            aos serviços e peças da ordem de serviço nº {p.numeroOS}, veículo {[p.veiculo.descricao, `placa ${p.veiculo.placa}`].filter(Boolean).join(", ")}.
          </Text>
        </View>

        <View style={[s.linha, s.secao, { gap: 10 }]} wrap={false}>
          <Dados
            titulo="Cliente"
            pares={p.cliente ? [["Nome", p.cliente.nome], ["CPF/CNPJ", p.cliente.documento], ["Telefone", p.cliente.telefone]] : [["Nome", "Não informado"]]}
          />
          <Dados titulo="Veículo" pares={[["Placa", p.veiculo.placa], ["Veículo", p.veiculo.descricao], ["Ano / cor", [p.veiculo.ano, p.veiculo.cor].filter(Boolean).join(" · ") || null]]} />
        </View>

        <View style={s.secao}>
          <Text style={s.tituloSecao}>Pagamentos</Text>
          <View style={{ borderWidth: 1, borderColor: COR.borda, borderRadius: 4 }}>
            <View style={[s.linha, { backgroundColor: COR.fundo, borderBottomWidth: 1, borderBottomColor: COR.borda }]}>
              <Text style={[cel, s.negrito, { width: 80 }]}>Data</Text>
              <Text style={[cel, s.negrito, { flex: 1 }]}>Forma</Text>
              <Text style={[cel, s.negrito, { width: 90, textAlign: "right" }]}>Valor</Text>
            </View>
            {p.pagamentos.map((x, n) => (
              <View key={n} style={[s.linha, n < p.pagamentos.length - 1 ? { borderBottomWidth: 0.5, borderBottomColor: COR.borda } : {}]} wrap={false}>
                <Text style={[cel, { width: 80 }]}>{x.data}</Text>
                <Text style={[cel, { flex: 1 }]}>{x.forma}</Text>
                <Text style={[cel, { width: 90, textAlign: "right" }]}>{brl(x.valor)}</Text>
              </View>
            ))}
          </View>
          <View style={{ alignSelf: "flex-end", width: 210, marginTop: 8 }} wrap={false}>
            <View style={[s.linha, { justifyContent: "space-between", paddingVertical: 1.5 }]}>
              <Text style={s.suave}>Total da OS</Text>
              <Text>{brl(p.totalOS)}</Text>
            </View>
            {p.saldo > 0 && (
              <View style={[s.linha, { justifyContent: "space-between", paddingVertical: 1.5 }]}>
                <Text style={s.suave}>Saldo a pagar</Text>
                <Text>{brl(p.saldo)}</Text>
              </View>
            )}
            <View style={[s.linha, { justifyContent: "space-between", borderTopWidth: 1, borderTopColor: COR.texto, marginTop: 3, paddingTop: 4 }]}>
              <Text style={[s.negrito, { fontSize: 11 }]}>Total recebido</Text>
              <Text style={[s.negrito, { fontSize: 11 }]}>{brl(p.recebido)}</Text>
            </View>
          </View>
        </View>

        <View style={[s.secao, { marginTop: 40, width: 280, alignSelf: "center" }]} wrap={false}>
          <Assinatura rotulo={p.id.razaoSocial || p.id.titulo} detalhe={p.id.cnpj ? `CNPJ ${p.id.cnpj}` : null} />
        </View>
        <Rodape texto={`${p.id.titulo} · Recibo da OS nº ${p.numeroOS}`} />
      </Page>
    </Document>
  );
}

/** Recibo da OS com os pagamentos não estornados. Nulo se não há OS ou pagamento. */
export async function pdfRecibo(oficinaId: string, osId: string) {
  const oficina = await oficinaCompleta(oficinaId);
  if (!oficina) return null;
  const dados = await obterOS(oficinaId, osId);
  if (!dados) return null;
  const sit = await situacaoRecebimento(oficinaId, dados.os);
  const pagos = sit.pagamentos.filter((p) => !p.estornadaEm);
  if (pagos.length === 0) return null;
  const recebido = pagos.reduce((t, p) => t + p.pagoCliente, 0);
  const doc = (
    <ReciboPdf
      id={ident(oficina)}
      logo={await logoDa(oficina)}
      numeroOS={dados.os.numero}
      emitidoEm={formatData(new Date())}
      cliente={pessoa(dados.cliente)}
      veiculo={veiculoPdf(dados.veiculo)}
      pagamentos={pagos.map((p) => ({
        data: p.data.split("-").reverse().join("/"),
        forma: p.forma && ehForma(p.forma) ? FORMAS[p.forma] : "Pagamento",
        valor: p.pagoCliente,
      }))}
      totalOS={sit.totais.total}
      recebido={recebido}
      saldo={Math.max(sit.totais.total - sit.recebido, 0)}
    />
  );
  return { doc, nome: `Recibo-OS-${dados.os.numero}-${placaArquivo(dados.veiculo.placa)}.pdf` };
}
