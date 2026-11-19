"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button, Campo, Card, CardHeader, Erro, Input, Select, Vazio } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { qtdTexto, UNIDADES } from "@/lib/estoque-formato";
import { cn, formatBRL } from "@/lib/utils";
import { alternarItemCatalogo, removerItemCatalogo, salvarItemCatalogo, type CatalogoState } from "./actions";

type Tipo = "servico" | "peca";
type Item = {
  id: string;
  tipo: Tipo;
  codigo: string | null;
  descricao: string;
  valor: number;
  tempoMinutos: number | null;
  tempo: string | null;
  codigoServicoMunicipal: string | null;
  ativo: boolean;
  controlaEstoque: boolean;
  unidade: string;
  estoqueAtual: number;
  estoqueMinimo: number;
  localizacao: string | null;
  marca: string | null;
  gtin: string | null;
  ncm: string | null;
};

const valorTxt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtdCampo = (n: number) => (n ? n.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false }) : "");

/* ---------- Formulário (novo e edição) ---------- */

export function FormItemCatalogo({ tipo, item, onDone }: { tipo: Tipo; item?: Item; onDone?: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  const [controla, setControla] = useState(item?.controlaEstoque ?? false);
  const { state, pending, onSubmit } = useFormAction(async (prev: CatalogoState, dados: FormData) => {
    const r = await salvarItemCatalogo(item?.id ?? null, prev, dados);
    if (r?.ok && !item) setControla(false);
    return r;
  });
  useEffect(() => {
    if (!state?.ok) return;
    if (item) onDone?.();
    else {
      form.current?.reset();
      form.current?.querySelector<HTMLInputElement>("[name=descricao]")?.focus();
    }
  }, [state, item, onDone]);
  const servico = tipo === "servico";
  const pid = item?.id ?? `novo-${tipo}`;

  return (
    <form ref={form} onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="tipo" value={tipo} />
      <Campo label="Descrição" htmlFor={`${pid}-desc`}>
        <Input id={`${pid}-desc`} name="descricao" defaultValue={item?.descricao} required placeholder={servico ? "Troca de óleo e filtro" : "Filtro de óleo"} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label={servico ? "Valor" : "Preço de venda"} htmlFor={`${pid}-valor`}>
          <Input id={`${pid}-valor`} name="valor" inputMode="decimal" placeholder="R$ 0,00" defaultValue={item ? valorTxt(item.valor) : ""} className="text-right" />
        </Campo>
        {servico ? (
          <Campo label="Tempo padrão" hint="(opcional)" htmlFor={`${pid}-tempo`}>
            <Input id={`${pid}-tempo`} name="tempo" placeholder="1h30" defaultValue={item?.tempo ?? ""} />
          </Campo>
        ) : (
          <Campo label="Código" hint="(opcional)" htmlFor={`${pid}-cod`}>
            <Input id={`${pid}-cod`} name="codigo" defaultValue={item?.codigo ?? ""} autoComplete="off" />
          </Campo>
        )}
      </div>
      {servico && (
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Código interno" hint="(opcional)" htmlFor={`${pid}-cod`}>
            <Input id={`${pid}-cod`} name="codigo" defaultValue={item?.codigo ?? ""} autoComplete="off" />
          </Campo>
          <Campo label="Cód. serviço municipal" hint="(NFS-e)" htmlFor={`${pid}-mun`}>
            <Input id={`${pid}-mun`} name="codigoServicoMunicipal" defaultValue={item?.codigoServicoMunicipal ?? ""} placeholder="14.01" />
          </Campo>
        </div>
      )}
      {!servico && (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
            <Campo label="Marca" hint="(opcional)" htmlFor={`${pid}-marca`}>
              <Input id={`${pid}-marca`} name="marca" defaultValue={item?.marca ?? ""} autoComplete="off" />
            </Campo>
            <Campo label="Unidade" htmlFor={`${pid}-un`}>
              <Select id={`${pid}-un`} name="unidade" defaultValue={item?.unidade ?? "UN"}>
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-foreground-2">
            <input
              type="checkbox"
              name="controlaEstoque"
              checked={controla}
              onChange={(e) => setControla(e.target.checked)}
              className="size-4 accent-zinc-900"
            />
            Controlar estoque
          </label>
          {controla && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Estoque mínimo" htmlFor={`${pid}-min`}>
                  <Input id={`${pid}-min`} name="estoqueMinimo" inputMode="decimal" defaultValue={qtdCampo(item?.estoqueMinimo ?? 0)} placeholder="0" className="text-right" />
                </Campo>
                <Campo label="Localização" hint="(opcional)" htmlFor={`${pid}-loc`}>
                  <Input id={`${pid}-loc`} name="localizacao" defaultValue={item?.localizacao ?? ""} placeholder="Prateleira A2" autoComplete="off" />
                </Campo>
              </div>
              {!item && (
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Estoque inicial" hint="(opcional)" htmlFor={`${pid}-ini`}>
                    <Input id={`${pid}-ini`} name="estoqueInicial" inputMode="decimal" placeholder="0" className="text-right" />
                  </Campo>
                  <Campo label="Custo unitário" hint="(opcional)" htmlFor={`${pid}-custo`}>
                    <Input id={`${pid}-custo`} name="custoInicial" inputMode="decimal" placeholder="R$ 0,00" className="text-right" />
                  </Campo>
                </div>
              )}
            </>
          )}
          {/* Sem controle, mantém a localização e o mínimo já cadastrados */}
          {!controla && item && (
            <>
              <input type="hidden" name="estoqueMinimo" value={qtdCampo(item.estoqueMinimo)} />
              <input type="hidden" name="localizacao" value={item.localizacao ?? ""} />
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Código de barras" hint="(opcional)" htmlFor={`${pid}-gtin`}>
              <Input id={`${pid}-gtin`} name="gtin" inputMode="numeric" defaultValue={item?.gtin ?? ""} autoComplete="off" />
            </Campo>
            <Campo label="NCM" hint="(opcional)" htmlFor={`${pid}-ncm`}>
              <Input id={`${pid}-ncm`} name="ncm" inputMode="numeric" maxLength={10} defaultValue={item?.ncm ?? ""} placeholder="8 dígitos" autoComplete="off" />
            </Campo>
          </div>
        </>
      )}
      <Erro>{state?.erro}</Erro>
      <div className="flex justify-end gap-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        )}
        <Button variant="primary" disabled={pending}>
          {!item && <Plus />}
          {pending ? "Salvando…" : item ? "Salvar" : servico ? "Adicionar serviço" : "Adicionar peça"}
        </Button>
      </div>
    </form>
  );
}

/* ---------- Lista ---------- */

export function ListaCatalogo({ tipo, itens }: { tipo: Tipo; itens: Item[] }) {
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const servico = tipo === "servico";

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter(
      (i) => i.descricao.toLowerCase().includes(q) || i.codigo?.toLowerCase().includes(q) || i.marca?.toLowerCase().includes(q) || i.gtin?.includes(q),
    );
  }, [busca, itens]);

  return (
    <Card className="min-w-0">
      <CardHeader
        title={servico ? "Serviços" : "Peças"}
        action={<span className="text-[13px] text-muted">{itens.length}</span>}
      />
      {itens.length > 6 && (
        <div className="relative border-b border-border px-4 py-3 sm:px-5">
          <Search className="pointer-events-none absolute left-7 top-1/2 size-4 -translate-y-1/2 text-muted sm:left-8" aria-hidden />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={servico ? "Buscar por descrição ou código" : "Buscar por descrição, código ou marca"} aria-label="Buscar no catálogo" className="pl-9" />
        </div>
      )}
      {itens.length === 0 ? (
        <Vazio titulo={servico ? "Nenhum serviço no catálogo" : "Nenhuma peça no catálogo"}>
          {servico
            ? "Cadastre os serviços mais comuns com o valor. Na OS, é só buscar e o preço já vem preenchido."
            : "Cadastre as peças que vocês vendem com o preço."}
        </Vazio>
      ) : filtrados.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted">Nada encontrado para “{busca}”.</p>
      ) : (
        <ul className={cn("divide-y divide-border", pending && "opacity-60")}>
          {filtrados.map((i) => {
            if (editando === i.id) {
              return (
                <li key={i.id} className="bg-subtle/60 px-4 py-4 sm:px-5">
                  <FormItemCatalogo tipo={tipo} item={i} onDone={() => setEditando(null)} />
                </li>
              );
            }
            return (
              <li key={i.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:px-5", !i.ativo && "text-muted")}>
                <div className="min-w-0 flex-1 basis-56">
                  <p className={cn("font-medium", !i.ativo && "line-through")}>{i.descricao}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                    {i.codigo && <span>Cód. {i.codigo}</span>}
                    {i.marca && <span>{i.marca}</span>}
                    {i.controlaEstoque && (
                      <Link href={`/estoque/${i.id}`} className={cn("font-medium underline-offset-4 hover:underline", i.estoqueAtual <= 0 ? "text-warn" : "text-foreground-2")}>
                        {i.estoqueAtual <= 0 ? (i.estoqueAtual < 0 ? `Saldo ${qtdTexto(i.estoqueAtual, i.unidade)}` : "Sem estoque") : `${qtdTexto(i.estoqueAtual, i.unidade)} em estoque`}
                      </Link>
                    )}
                    {i.tempo && <span>{i.tempo}</span>}
                    {i.codigoServicoMunicipal && <span>NFS-e {i.codigoServicoMunicipal}</span>}
                    {!i.ativo && <span>Desativado</span>}
                  </p>
                </div>
                <span className="font-semibold tabular-nums">{formatBRL(i.valor)}</span>
                <div className="flex items-center gap-1">
                  <label className="flex cursor-pointer items-center gap-1.5 px-1.5 text-[12px] text-muted" title={i.ativo ? "Aparece na OS" : "Não aparece na OS"}>
                    <input
                      type="checkbox"
                      checked={i.ativo}
                      onChange={(e) => start(() => alternarItemCatalogo(i.id, e.target.checked))}
                      className="size-4 accent-zinc-900"
                      aria-label={`Usar “${i.descricao}” na OS`}
                    />
                    Ativo
                  </label>
                  <Button variant="ghost" className="px-2" onClick={() => setEditando(i.id)} aria-label={`Editar ${i.descricao}`}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2 hover:text-danger"
                    onClick={() => {
                      if (confirm(`Remover “${i.descricao}” do catálogo? As OS que já usam continuam iguais.`)) start(() => removerItemCatalogo(i.id));
                    }}
                    aria-label={`Remover ${i.descricao}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
