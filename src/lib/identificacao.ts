import { formatDocumento, formatEndereco, formatTelefone, type Endereco } from "@/lib/utils";

type OficinaInfo = Partial<Endereco> & {
  nome: string;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
};
type EmpresaInfo = Partial<Endereco> & {
  nome: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  enderecoProprio: boolean;
};

/**
 * Como a empresa (CNPJ) se apresenta nos documentos: dados próprios quando existem,
 * senão os da oficina.
 */
export function identificacao(oficina: OficinaInfo, empresa: EmpresaInfo) {
  const fonteEndereco = empresa.enderecoProprio ? empresa : oficina;
  const telefone = empresa.telefone ?? oficina.telefone;
  return {
    titulo: empresa.nomeFantasia || oficina.nome,
    razaoSocial: empresa.razaoSocial || empresa.nome,
    cnpj: empresa.cnpj ? formatDocumento(empresa.cnpj) : null,
    endereco: formatEndereco(fonteEndereco),
    telefone: telefone ? formatTelefone(telefone) : null,
    whatsapp: oficina.whatsapp,
    email: empresa.email ?? oficina.email,
  };
}
