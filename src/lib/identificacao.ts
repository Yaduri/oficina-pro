import { formatDocumento, formatEndereco, formatTelefone, type Endereco } from "@/lib/utils";

type OficinaInfo = Partial<Endereco> & {
  nome: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  cnpj: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
};

/** Como a oficina (o CNPJ) se apresenta nos documentos e na página do orçamento */
export function identificacao(oficina: OficinaInfo) {
  return {
    titulo: oficina.nomeFantasia || oficina.nome,
    razaoSocial: oficina.razaoSocial || oficina.nome,
    cnpj: oficina.cnpj ? formatDocumento(oficina.cnpj) : null,
    endereco: formatEndereco(oficina),
    telefone: oficina.telefone ? formatTelefone(oficina.telefone) : null,
    whatsapp: oficina.whatsapp,
    email: oficina.email,
  };
}
