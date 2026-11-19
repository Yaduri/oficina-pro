import Link from "next/link";
import { Search } from "lucide-react";
import { Badge, Button, Card, CardHeader, Input, PageHeader, Placa, Vazio, buttonClass, inputClass } from "@/components/ui";
import { exigir } from "@/lib/oficina";
import { DIA_RE } from "@/lib/agenda-datas";
import { LABEL_TIPO, type TipoMensagem } from "@/lib/mensagens";
import { ORDEM_FILA, filaMensagens, listarMensagens } from "@/lib/fila-mensagens";
import { cn, formatEntrada, formatTelefone } from "@/lib/utils";
import { ItemFilaMensagem } from "./fila";

export const metadata = { title: "Mensagens" };

type SP = Record<string, string | string[] | undefined>;

const GRUPOS: Partial<Record<TipoMensagem, string>> = {
  pronto: "Veículos prontos",
  agendamento: "Lembretes de agendamento",
  orcamento: "Orçamentos sem resposta",
  pos_venda: "Pós-venda",
  revisao: "Revisões",
};

const ehTipo = (v: string): v is TipoMensagem => v in LABEL_TIPO;

export default async function MensagensPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { oficina, admin } = await exigir("mensagens");
  const sp = await searchParams;
  const p = (k: string) => {
    const x = sp[k];
    return ((Array.isArray(x) ? x[0] : x) ?? "").trim();
  };
  const enviadas = p("aba") === "enviadas";

  return (
    <>
      <PageHeader
        title="Mensagens"
        actions={
          admin && (
            <Link href="/configuracoes/mensagens" className={buttonClass("secondary")}>
              Editar modelos
            </Link>
          )
        }
      />

      <nav aria-label="Mensagens" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border">
        {[
          { href: "/mensagens", label: "A enviar", ativo: !enviadas },
          { href: "/mensagens?aba=enviadas", label: "Enviadas", ativo: enviadas },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            aria-current={a.ativo ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 font-medium",
              a.ativo ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {a.label}
          </Link>
        ))}
      </nav>

      {enviadas ? <Enviadas oficinaId={oficina.id} p={p} /> : <Fila oficina={oficina} />}
    </>
  );
}

/* ---------- A enviar ---------- */

async function Fila({ oficina }: { oficina: Parameters<typeof filaMensagens>[0] }) {
  const fila = await filaMensagens(oficina);
  if (fila.length === 0) {
    return (
      <Card>
        <Vazio titulo="Nenhuma mensagem a enviar">
          Aqui aparecem veículos prontos, lembretes de agendamento, orçamentos sem resposta, pós-venda e revisões.
        </Vazio>
      </Card>
    );
  }
  const grupos = ORDEM_FILA.map((tipo) => ({ tipo, itens: fila.filter((x) => x.tipo === tipo) })).filter((g) => g.itens.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {grupos.map((g) => (
        <Card key={g.tipo} className="overflow-hidden">
          <CardHeader title={GRUPOS[g.tipo] ?? LABEL_TIPO[g.tipo]} action={<span className="text-[13px] text-muted tabular-nums">{g.itens.length}</span>} />
          <ul className="divide-y divide-border">
            {g.itens.map((x) => (
              <ItemFilaMensagem key={x.chave} p={x} />
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

/* ---------- Enviadas ---------- */

async function Enviadas({ oficinaId, p }: { oficinaId: string; p: (k: string) => string }) {
  const tipo = ehTipo(p("tipo")) ? (p("tipo") as TipoMensagem) : undefined;
  const de = DIA_RE.test(p("de")) ? p("de") : undefined;
  const ate = DIA_RE.test(p("ate")) ? p("ate") : undefined;
  const busca = p("q").slice(0, 60) || undefined;
  const pagina = Math.min(1000, Math.max(1, Number(p("pagina")) || 1));
  const filtrando = !!(tipo || de || ate || busca);
  const { itens, temMais } = await listarMensagens(oficinaId, { tipo, de, ate, busca, pagina });

  const linkPagina = (n: number) => {
    const q = new URLSearchParams({ aba: "enviadas" });
    for (const [k, v] of Object.entries({ tipo, de, ate, q: busca })) if (v) q.set(k, v);
    if (n > 1) q.set("pagina", String(n));
    return `/mensagens?${q.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
        <input type="hidden" name="aba" value="enviadas" />
        <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
          <span className="text-[13px] font-medium text-foreground-2">Buscar</span>
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input name="q" defaultValue={busca} placeholder="Cliente, placa ou telefone" className="h-10 pl-9" />
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">Tipo</span>
          <select name="tipo" defaultValue={tipo ?? ""} className={cn(inputClass, "h-10 cursor-pointer")}>
            <option value="">Todos</option>
            {Object.entries(LABEL_TIPO).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">De</span>
          <Input type="date" name="de" defaultValue={de} className="h-10" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-foreground-2">até</span>
          <Input type="date" name="ate" defaultValue={ate} className="h-10" />
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <Button variant="primary" className="h-10 flex-1">
            Filtrar
          </Button>
          {filtrando && (
            <Link href="/mensagens?aba=enviadas" className={buttonClass("ghost", "h-10")}>
              Limpar
            </Link>
          )}
        </div>
      </form>

      <Card className="overflow-hidden">
        {itens.length === 0 ? (
          <Vazio titulo={filtrando ? "Nenhuma mensagem com esses filtros" : "Nenhuma mensagem enviada"}>
            {!filtrando && "As mensagens abertas pelo sistema no WhatsApp ficam registradas aqui."}
          </Vazio>
        ) : (
          <ul className="divide-y divide-border">
            {itens.map((x) => (
              <li key={x.id} className="flex flex-col gap-1.5 px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge tom={x.dispensada ? "neutro" : "info"}>{ehTipo(x.tipo) ? LABEL_TIPO[x.tipo] : x.tipo}</Badge>
                    {x.placa && <Placa placa={x.placa} />}
                    {x.clienteId && x.cliente ? (
                      <Link href={`/clientes/${x.clienteId}`} className="font-medium hover:underline">
                        {x.cliente}
                      </Link>
                    ) : (
                      <span className="font-medium">{x.cliente ?? "Sem cliente"}</span>
                    )}
                  </div>
                  <span className="text-[13px] text-muted tabular-nums">{formatEntrada(x.criadoEm)}</span>
                </div>
                {x.dispensada ? (
                  <p className="text-[13px] text-muted">Dispensada sem enviar</p>
                ) : (
                  <p className="whitespace-pre-line text-[13px] text-foreground-2">{x.texto}</p>
                )}
                <p className="flex flex-wrap gap-x-2 text-[12px] text-muted">
                  <span>{x.enviadoPorNome ?? "—"}</span>
                  {x.telefone && <span>· para {formatTelefone(x.telefone.replace(/^55(?=\d{10,11}$)/, ""))}</span>}
                  {x.osId && (
                    <Link href={`/ordens-servico/${x.osId}`} className="underline-offset-4 hover:text-foreground hover:underline">
                      · Ver OS
                    </Link>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
        {(pagina > 1 || temMais) && (
          <nav aria-label="Páginas" className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-[13px]">
            {pagina > 1 ? (
              <Link href={linkPagina(pagina - 1)} className={buttonClass("ghost", "h-8")}>
                Mais recentes
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted">Página {pagina}</span>
            {temMais ? (
              <Link href={linkPagina(pagina + 1)} className={buttonClass("ghost", "h-8")}>
                Anteriores
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </Card>
    </div>
  );
}
