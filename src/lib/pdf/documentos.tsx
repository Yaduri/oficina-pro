import "server-only";
import { Document, Image, Link, Page, Text, View } from "@react-pdf/renderer";
import { Assinatura, Bloco, Cabecalho, COR, Dados, Rodape, TabelaItens, Totais, s, type Identificacao, type ItemPdf } from "./base";
import type { ImagemPdf } from "./imagens";

/*
 * Os três documentos em PDF. Recebem dados já prontos (textos formatados e imagens
 * convertidas) — a busca no banco fica em gerar.ts.
 */

type Pessoa = { nome: string; documento?: string | null; telefone?: string | null; endereco?: string | null } | null;
type VeiculoPdf = {
  placa: string;
  descricao: string;
  ano?: number | null;
  cor?: string | null;
  km?: string | null;
  chassi?: string | null;
  combustivel?: string | null;
};
type TotaisPdf = { pecas: number; servicos: number; desconto: number; total: number };

function ClienteVeiculo({ cliente, veiculo }: { cliente: Pessoa; veiculo: VeiculoPdf }) {
  return (
    <View style={[s.linha, s.secao, { gap: 10 }]} wrap={false}>
      <Dados
        titulo="Cliente"
        pares={
          cliente
            ? [
                ["Nome", cliente.nome],
                ["CPF/CNPJ", cliente.documento],
                ["Telefone", cliente.telefone],
                ["Endereço", cliente.endereco],
              ]
            : [["Nome", "Não informado"]]
        }
      />
      <Dados
        titulo="Veículo"
        pares={[
          ["Placa", veiculo.placa],
          ["Veículo", veiculo.descricao],
          ["Ano / cor", [veiculo.ano, veiculo.cor].filter(Boolean).join(" · ") || null],
          ["Km", veiculo.km],
          ["Combustível", veiculo.combustivel],
          ["Chassi", veiculo.chassi],
        ]}
      />
    </View>
  );
}

function linhasTotais(t: TotaisPdf): [string, number, boolean?][] {
  const l: [string, number, boolean?][] = [];
  if (t.pecas > 0) l.push(["Peças", t.pecas]);
  if (t.servicos > 0) l.push(["Serviços", t.servicos]);
  if (t.desconto > 0) l.push(["Desconto", t.desconto, true]);
  return l;
}

/* ---------- Orçamento ---------- */

export type OrcamentoPdfProps = {
  id: Identificacao;
  logo: ImagemPdf | null;
  numeroOS: number;
  emitidoEm: string;
  validoAte: string | null;
  situacao: string | null;
  cliente: Pessoa;
  veiculo: VeiculoPdf;
  relato: string;
  itens: ItemPdf[];
  totais: TotaisPdf;
  observacao: string | null;
  textoGarantia: string | null;
  link: string | null;
  resposta: string | null;
};

export function OrcamentoPdf(p: OrcamentoPdfProps) {
  return (
    <Document title={`Orçamento OS ${p.numeroOS} - ${p.veiculo.placa}`} author={p.id.titulo} language="pt-BR">
      <Page size="A4" style={s.pagina}>
        <Cabecalho
          id={p.id}
          logo={p.logo}
          documento="Orçamento"
          numero={`OS nº ${p.numeroOS}`}
          linhas={[`Emitido em ${p.emitidoEm}`, ...(p.validoAte ? [`Válido até ${p.validoAte}`] : []), ...(p.situacao ? [p.situacao] : [])]}
        />
        <ClienteVeiculo cliente={p.cliente} veiculo={p.veiculo} />
        <Bloco titulo="Problema relatado">
          <Text style={s.suave}>{p.relato}</Text>
        </Bloco>
        <View style={s.secao}>
          <Text style={s.tituloSecao}>Peças e serviços</Text>
          <TabelaItens itens={p.itens} valores />
          <Totais linhas={linhasTotais(p.totais)} total={p.totais.total} rotulo={p.resposta ? "Total orçado" : "Total"} />
        </View>
        {p.resposta && (
          <Bloco titulo="Resposta do cliente" quebra={false}>
            <Text style={s.suave}>{p.resposta}</Text>
          </Bloco>
        )}
        {p.observacao && (
          <Bloco titulo="Observações">
            <Text style={s.suave}>{p.observacao}</Text>
          </Bloco>
        )}
        {p.textoGarantia && (
          <Bloco titulo="Garantia">
            <Text style={s.suave}>{p.textoGarantia}</Text>
          </Bloco>
        )}
        {p.link && (
          <View style={[s.secao, s.caixa, { backgroundColor: COR.fundo }]} wrap={false}>
            <Text style={s.negrito}>Aprove pelo celular</Text>
            <Link src={p.link} style={{ color: COR.texto, fontSize: 8 }}>
              {p.link}
            </Link>
          </View>
        )}
        <Rodape texto={`${p.id.titulo} · Orçamento da OS nº ${p.numeroOS}`} />
      </Page>
    </Document>
  );
}

/* ---------- Ordem de serviço ---------- */

export type OSPdfProps = {
  id: Identificacao;
  logo: ImagemPdf | null;
  via: "cliente" | "oficina";
  numero: number;
  status: string;
  entrada: string;
  previsao: string | null;
  entregue: string | null;
  cliente: Pessoa;
  veiculo: VeiculoPdf;
  relato: string;
  responsavel: string | null;
  valores: boolean;
  itens: ItemPdf[];
  totais: TotaisPdf;
  recusados: number;
  kmEntrada: string | null;
  kmSaida: string | null;
  garantiaAte: string | null;
  textoGarantia: string | null;
  entregaObs: string | null;
  entreguePor: string | null;
  assinaturaRetirada: ImagemPdf | null;
  checklistProblemas: string[];
};

export function OSPdf(p: OSPdfProps) {
  const oficina = p.via === "oficina";
  return (
    <Document title={`OS ${p.numero} - ${p.veiculo.placa}`} author={p.id.titulo} language="pt-BR">
      <Page size="A4" style={s.pagina}>
        <Cabecalho
          id={p.id}
          logo={p.logo}
          documento="Ordem de serviço"
          numero={`Nº ${p.numero}`}
          linhas={[
            `Entrada ${p.entrada}`,
            ...(p.entregue ? [`Entregue ${p.entregue}`] : p.previsao ? [`Previsão ${p.previsao}`] : []),
            p.status,
          ]}
          via={oficina ? "Via da oficina" : "Via do cliente"}
        />
        <ClienteVeiculo cliente={p.cliente} veiculo={p.veiculo} />
        <Bloco titulo="Problema relatado">
          <Text style={s.suave}>{p.relato}</Text>
        </Bloco>
        {oficina && (p.responsavel || p.checklistProblemas.length > 0) && (
          <View style={[s.secao, s.caixa]} wrap={false}>
            {p.responsavel && (
              <Text>
                <Text style={s.muted}>Responsável: </Text>
                {p.responsavel}
              </Text>
            )}
            {p.checklistProblemas.length > 0 && (
              <Text>
                <Text style={s.muted}>Na chegada (checklist): </Text>
                {p.checklistProblemas.join("; ")}
              </Text>
            )}
          </View>
        )}
        <View style={s.secao}>
          <Text style={s.tituloSecao}>Peças e serviços</Text>
          <TabelaItens itens={p.itens} valores={p.valores} />
          {p.valores && <Totais linhas={linhasTotais(p.totais)} total={p.totais.total} />}
          {p.recusados > 0 && (
            <Text style={[s.muted, { marginTop: 4, fontSize: 8 }]}>
              {p.recusados === 1 ? "1 item recusado pelo cliente não está incluído." : `${p.recusados} itens recusados pelo cliente não estão incluídos.`}
            </Text>
          )}
        </View>

        <View style={[s.linha, s.secao, { gap: 10 }]} wrap={false}>
          <Dados
            titulo="Entrega"
            pares={[
              ["Km entrada", p.kmEntrada],
              ["Km saída", p.kmSaida],
              ["Entregue", p.entregue],
              ["Por", oficina ? p.entreguePor : null],
              ["Garantia até", p.garantiaAte],
            ]}
          />
          {p.entregaObs ? (
            <View style={{ flex: 1 }}>
              <Text style={s.tituloSecao}>Observações da entrega</Text>
              <Text style={[s.caixa, s.suave]}>{p.entregaObs}</Text>
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}
        </View>

        {p.textoGarantia && (
          <Bloco titulo="Garantia">
            <Text style={s.suave}>{p.textoGarantia}</Text>
          </Bloco>
        )}

        <View style={[s.secao, { marginTop: 22 }]} wrap={false}>
          <Text style={[s.suave, { marginBottom: 6 }]}>Declaro que retirei o veículo com os serviços acima realizados.</Text>
          <View style={[s.linha, { gap: 28 }, oficina ? {} : { width: 280, alignSelf: "center" }]}>
            <Assinatura imagem={p.assinaturaRetirada} rotulo={p.cliente?.nome ?? "Cliente"} detalhe={p.entregue ? `Retirada em ${p.entregue}` : "Assinatura do cliente"} />
            {oficina && <Assinatura rotulo={p.id.titulo} detalhe="Responsável pela oficina" />}
          </View>
        </View>
        <Rodape texto={`${p.id.titulo} · OS nº ${p.numero} · ${oficina ? "via da oficina" : "via do cliente"}`} />
      </Page>
    </Document>
  );
}

/* ---------- Termo de entrada (check-in) ---------- */

export type TermoPdfProps = {
  id: Identificacao;
  logo: ImagemPdf | null;
  data: string;
  ordens: string | null;
  cliente: Pessoa;
  veiculo: VeiculoPdf;
  relato: string;
  combustivel: string;
  avarias: string | null;
  objetos: string | null;
  checklist: { grupo: string; itens: { descricao: string; estado: string; obs: string | null; problema: boolean }[] }[];
  fotos: { imagem: ImagemPdf; rotulo: string }[];
  termo: string;
  assinatura: ImagemPdf | null;
};

export function TermoPdf(p: TermoPdfProps) {
  return (
    <Document title={`Termo de entrada - ${p.veiculo.placa}`} author={p.id.titulo} language="pt-BR">
      <Page size="A4" style={s.pagina}>
        <Cabecalho id={p.id} logo={p.logo} documento="Termo de entrada" numero={p.veiculo.placa} linhas={[p.data, ...(p.ordens ? [p.ordens] : [])]} />
        <ClienteVeiculo cliente={p.cliente} veiculo={p.veiculo} />
        <View style={[s.linha, s.secao, { gap: 10 }]} wrap={false}>
          <Dados
            titulo="Estado na chegada"
            pares={[
              ["Combustível", p.combustivel],
              ["Avarias", p.avarias ?? "Nenhuma informada"],
              ["Objetos", p.objetos ?? "Nenhum informado"],
            ]}
          />
        </View>
        <Bloco titulo="Relato do cliente">
          <Text style={s.suave}>{p.relato}</Text>
        </Bloco>

        {p.checklist.length > 0 && (
          <View style={s.secao}>
            <Text style={s.tituloSecao}>Checklist</Text>
            <View style={[s.linha, { flexWrap: "wrap", gap: 10 }]}>
              {p.checklist.map((g) => (
                <View key={g.grupo} style={[s.caixa, { width: "48.5%" }]} wrap={false}>
                  <Text style={[s.negrito, { marginBottom: 3 }]}>{g.grupo}</Text>
                  {g.itens.map((i) => (
                    <View key={i.descricao} style={[s.linha, { justifyContent: "space-between", gap: 6, marginBottom: 1 }]}>
                      <Text style={{ flex: 1 }}>
                        {i.descricao}
                        {i.obs ? <Text style={s.muted}> — {i.obs}</Text> : null}
                      </Text>
                      <Text style={i.problema ? [s.negrito, { color: COR.perigo }] : s.muted}>{i.estado}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}

        {p.fotos.length > 0 && (
          <View style={s.secao}>
            <Text style={s.tituloSecao}>Fotos de chegada</Text>
            <View style={[s.linha, { flexWrap: "wrap", gap: 8 }]}>
              {p.fotos.map((f, n) => (
                <View key={n} style={{ width: "31.8%" }} wrap={false}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do @react-pdf não tem alt */}
                  <Image src={f.imagem} style={{ width: "100%", height: 112, objectFit: "cover", borderRadius: 3 }} />
                  <Text style={[s.muted, { fontSize: 7.5, marginTop: 2 }]}>{f.rotulo}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={[s.secao, { marginTop: 18 }]} wrap={false}>
          <Text style={[s.suave, { fontSize: 8, marginBottom: 8 }]}>{p.termo}</Text>
          <View style={[s.linha, { width: 260, alignSelf: "center" }]}>
            <Assinatura imagem={p.assinatura} rotulo={p.cliente?.nome ?? "Cliente"} detalhe={p.assinatura ? `Assinado em ${p.data}` : "Assinatura do cliente"} />
          </View>
        </View>
        <Rodape texto={`${p.id.titulo} · Termo de entrada · ${p.veiculo.placa}`} />
      </Page>
    </Document>
  );
}
