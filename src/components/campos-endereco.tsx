"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Campo, Input, Select } from "@/components/ui";
import { formatCep, soDigitos, type Endereco } from "@/lib/utils";

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

type Valores = Record<keyof Endereco, string>;

const vazio = (e?: Partial<Endereco> | null): Valores => ({
  cep: formatCep(e?.cep),
  logradouro: e?.logradouro ?? "",
  numero: e?.numero ?? "",
  complemento: e?.complemento ?? "",
  bairro: e?.bairro ?? "",
  cidade: e?.cidade ?? "",
  uf: e?.uf ?? "",
});

/**
 * Campos de endereço com preenchimento pelo CEP (ViaCEP).
 * Os nomes dos campos são cep, logradouro, numero, complemento, bairro, cidade e uf.
 */
export function CamposEndereco({ inicial, idPrefixo }: { inicial?: Partial<Endereco> | null; idPrefixo: string }) {
  const [v, setV] = useState<Valores>(() => vazio(inicial));
  const [busca, setBusca] = useState<"idle" | "buscando" | "nao-encontrado" | "erro">("idle");
  const ultimo = useRef(soDigitos(inicial?.cep));
  const numero = useRef<HTMLInputElement>(null);
  const set = (k: keyof Valores) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function buscarCep(valor: string) {
    const cep = soDigitos(valor);
    if (cep.length !== 8 || cep === ultimo.current) return;
    ultimo.current = cep;
    setBusca("buscando");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (j.erro) {
        setBusca("nao-encontrado");
        return;
      }
      setV((s) => ({
        ...s,
        logradouro: j.logradouro || s.logradouro,
        bairro: j.bairro || s.bairro,
        cidade: j.localidade || s.cidade,
        uf: j.uf || s.uf,
      }));
      setBusca("idle");
      numero.current?.focus();
    } catch {
      setBusca("erro");
    }
  }

  const id = (n: string) => `${idPrefixo}-${n}`;

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-6">
      <Campo
        label="CEP"
        htmlFor={id("cep")}
        className="sm:col-span-2"
        hint={
          busca === "buscando" ? (
            <Loader2 className="inline size-3.5 animate-spin" aria-label="Buscando CEP" />
          ) : busca === "nao-encontrado" ? (
            "não encontrado"
          ) : busca === "erro" ? (
            "busca indisponível"
          ) : undefined
        }
      >
        <Input
          id={id("cep")}
          name="cep"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          value={v.cep}
          onChange={(e) => {
            const d = soDigitos(e.target.value).slice(0, 8);
            setV((s) => ({ ...s, cep: d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d }));
            if (d.length === 8) buscarCep(d);
          }}
        />
      </Campo>
      <Campo label="Rua / avenida" htmlFor={id("logradouro")} className="col-span-2 sm:col-span-4">
        <Input id={id("logradouro")} name="logradouro" autoComplete="address-line1" value={v.logradouro} onChange={set("logradouro")} />
      </Campo>
      <Campo label="Número" htmlFor={id("numero")} className="sm:col-span-2">
        <Input id={id("numero")} name="numero" ref={numero} value={v.numero} onChange={set("numero")} />
      </Campo>
      <Campo label="Complemento" htmlFor={id("complemento")} className="sm:col-span-4">
        <Input id={id("complemento")} name="complemento" autoComplete="address-line2" value={v.complemento} onChange={set("complemento")} />
      </Campo>
      <Campo label="Bairro" htmlFor={id("bairro")} className="col-span-2 sm:col-span-2">
        <Input id={id("bairro")} name="bairro" value={v.bairro} onChange={set("bairro")} />
      </Campo>
      <Campo label="Cidade" htmlFor={id("cidade")} className="sm:col-span-3">
        <Input id={id("cidade")} name="cidade" autoComplete="address-level2" value={v.cidade} onChange={set("cidade")} />
      </Campo>
      <Campo label="UF" htmlFor={id("uf")} className="sm:col-span-1">
        <Select id={id("uf")} name="uf" value={v.uf} onChange={set("uf")}>
          <option value="">—</option>
          {UFS.map((uf) => (
            <option key={uf}>{uf}</option>
          ))}
        </Select>
      </Campo>
    </div>
  );
}
