import "server-only";
import type { ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ImagemPdf } from "./imagens";
import { formatBRL } from "@/lib/utils";

/*
 * Peças comuns dos PDFs (orçamento, OS e termo de entrada).
 * Fonte Helvetica embutida no leitor de PDF (cobre os acentos do português).
 */

export const COR = {
  texto: "#18181b",
  suave: "#52525b",
  muted: "#71717a",
  borda: "#e4e4e7",
  fundo: "#f4f4f5",
  ok: "#15803d",
  perigo: "#b91c1c",
};

export const s = StyleSheet.create({
  pagina: { paddingTop: 32, paddingBottom: 48, paddingHorizontal: 36, fontFamily: "Helvetica", fontSize: 9, color: COR.texto, lineHeight: 1.35 },
  negrito: { fontFamily: "Helvetica-Bold" },
  muted: { color: COR.muted },
  suave: { color: COR.suave },
  linha: { flexDirection: "row" },
  secao: { marginTop: 14 },
  tituloSecao: { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 5 },
  caixa: { borderWidth: 1, borderColor: COR.borda, borderRadius: 4, padding: 8 },
  rodape: { position: "absolute", bottom: 20, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: COR.muted },
});

export type Identificacao = {
  titulo: string;
  razaoSocial: string;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
};

/** Cabeçalho: logo + dados do CNPJ à esquerda, tipo do documento e número à direita */
export function Cabecalho({
  id,
  logo,
  documento,
  numero,
  linhas = [],
  via,
}: {
  id: Identificacao;
  logo: ImagemPdf | null;
  documento: string;
  numero?: string;
  linhas?: string[];
  via?: string;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 16, paddingBottom: 12, borderBottomWidth: 1.5, borderBottomColor: COR.texto }}>
      <View style={{ flexDirection: "row", gap: 10, flex: 1 }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do @react-pdf não tem alt */}
        {logo && <Image src={logo} style={{ width: 52, height: 52, objectFit: "contain" }} />}
        <View style={{ flex: 1 }}>
          <Text style={[s.negrito, { fontSize: 13 }]}>{id.titulo}</Text>
          <Text style={s.suave}>
            {id.razaoSocial}
            {id.cnpj ? ` · CNPJ ${id.cnpj}` : ""}
          </Text>
          {id.endereco && <Text style={s.muted}>{id.endereco}</Text>}
          {(id.telefone || id.email) && <Text style={s.muted}>{[id.telefone, id.email].filter(Boolean).join(" · ")}</Text>}
        </View>
      </View>
      <View style={{ alignItems: "flex-end", maxWidth: 190 }}>
        <Text style={[s.negrito, { fontSize: 14, lineHeight: 1.2 }]}>{documento}</Text>
        {numero && <Text style={[s.negrito, { fontSize: 11, lineHeight: 1.2, marginTop: 5 }]}>{numero}</Text>}
        {linhas.map((l) => (
          <Text key={l} style={s.muted}>
            {l}
          </Text>
        ))}
        {via && (
          <Text style={{ marginTop: 4, paddingVertical: 2, paddingHorizontal: 6, borderWidth: 1, borderColor: COR.texto, borderRadius: 3, fontSize: 8 }}>{via}</Text>
        )}
      </View>
    </View>
  );
}

/** Lista "rótulo: valor" em duas colunas */
export function Dados({ titulo, pares }: { titulo: string; pares: [string, string | number | null | undefined][] }) {
  const visiveis = pares.filter(([, v]) => v !== null && v !== undefined && v !== "");
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.tituloSecao}>{titulo}</Text>
      <View style={s.caixa}>
        {visiveis.length === 0 ? (
          <Text style={s.muted}>—</Text>
        ) : (
          visiveis.map(([k, v]) => (
            <View key={k} style={[s.linha, { marginBottom: 1.5 }]}>
              <Text style={[s.muted, { width: 62 }]}>{k}</Text>
              <Text style={{ flex: 1 }}>{String(v)}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

export type ItemPdf = {
  tipo: "peca" | "servico";
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  /** Marca ao lado da descrição (ex.: "Recusado", "Aprovado") */
  marca?: { texto: string; cor: string } | null;
  riscado?: boolean;
};

const qtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Tabela de peças e serviços, com ou sem valores */
export function TabelaItens({ itens, valores }: { itens: ItemPdf[]; valores: boolean }) {
  const cel = { paddingVertical: 4, paddingHorizontal: 4 };
  return (
    <View style={{ borderWidth: 1, borderColor: COR.borda, borderRadius: 4 }}>
      <View style={[s.linha, { backgroundColor: COR.fundo, borderBottomWidth: 1, borderBottomColor: COR.borda }]} fixed>
        <Text style={[cel, s.negrito, { flex: 1 }]}>Descrição</Text>
        <Text style={[cel, s.negrito, { width: 46 }]}>Tipo</Text>
        <Text style={[cel, s.negrito, { width: 34, textAlign: "right" }]}>Qtd</Text>
        {valores && <Text style={[cel, s.negrito, { width: 66, textAlign: "right" }]}>Unitário</Text>}
        {valores && <Text style={[cel, s.negrito, { width: 70, textAlign: "right" }]}>Total</Text>}
      </View>
      {itens.length === 0 ? (
        <Text style={[cel, s.muted]}>Nenhum item lançado.</Text>
      ) : (
        itens.map((i, n) => {
          const estilo = i.riscado ? { color: COR.muted, textDecoration: "line-through" as const } : {};
          return (
            <View key={n} style={[s.linha, n < itens.length - 1 ? { borderBottomWidth: 0.5, borderBottomColor: COR.borda } : {}]} wrap={false}>
              <View style={[cel, { flex: 1 }]}>
                <Text style={estilo}>{i.descricao}</Text>
                {i.marca && <Text style={{ fontSize: 7.5, color: i.marca.cor }}>{i.marca.texto}</Text>}
              </View>
              <Text style={[cel, s.suave, { width: 46 }]}>{i.tipo === "peca" ? "Peça" : "Serviço"}</Text>
              <Text style={[cel, { width: 34, textAlign: "right" }, estilo]}>{qtd(i.quantidade)}</Text>
              {valores && <Text style={[cel, { width: 66, textAlign: "right" }, estilo]}>{formatBRL(i.valorUnitario)}</Text>}
              {valores && <Text style={[cel, { width: 70, textAlign: "right" }, estilo]}>{formatBRL(i.quantidade * i.valorUnitario)}</Text>}
            </View>
          );
        })
      )}
    </View>
  );
}

/** Quadro de totais alinhado à direita */
export function Totais({ linhas, total, rotulo = "Total" }: { linhas: [string, number, boolean?][]; total: number; rotulo?: string }) {
  return (
    <View style={{ alignSelf: "flex-end", width: 210, marginTop: 8 }} wrap={false}>
      {linhas.map(([k, v, negativo]) => (
        <View key={k} style={[s.linha, { justifyContent: "space-between", paddingVertical: 1.5 }]}>
          <Text style={s.suave}>{k}</Text>
          <Text>{negativo ? `- ${formatBRL(v)}` : formatBRL(v)}</Text>
        </View>
      ))}
      <View style={[s.linha, { justifyContent: "space-between", borderTopWidth: 1, borderTopColor: COR.texto, marginTop: 3, paddingTop: 4 }]}>
        <Text style={[s.negrito, { fontSize: 11 }]}>{rotulo}</Text>
        <Text style={[s.negrito, { fontSize: 11 }]}>{formatBRL(total)}</Text>
      </View>
    </View>
  );
}

/** Bloco de texto com título (relato, observações, termos) */
export function Bloco({ titulo, children, quebra = true }: { titulo: string; children: ReactNode; quebra?: boolean }) {
  return (
    <View style={s.secao} wrap={quebra}>
      <Text style={s.tituloSecao}>{titulo}</Text>
      {children}
    </View>
  );
}

/** Espaço de assinatura: imagem colhida no app ou linha em branco */
export function Assinatura({ imagem, rotulo, detalhe }: { imagem?: ImagemPdf | null; rotulo: string; detalhe?: string | null }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }} wrap={false}>
      <View style={{ height: 56, width: "100%", justifyContent: "flex-end", alignItems: "center" }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do @react-pdf não tem alt */}
        {imagem && <Image src={imagem} style={{ width: "100%", height: 52, objectFit: "contain" }} />}
      </View>
      <View style={{ width: "100%", borderTopWidth: 0.75, borderTopColor: COR.texto, marginTop: 2, paddingTop: 3, alignItems: "center" }}>
        <Text>{rotulo}</Text>
        {detalhe && <Text style={[s.muted, { fontSize: 7.5 }]}>{detalhe}</Text>}
      </View>
    </View>
  );
}

/** Rodapé com o nome da oficina e a página */
export function Rodape({ texto }: { texto: string }) {
  return (
    <View style={s.rodape} fixed>
      <Text>{texto}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}
