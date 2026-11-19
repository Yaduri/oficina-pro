"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, History, ImagePlus, Loader2, RotateCcw, Trash2, WifiOff } from "lucide-react";
import { Button, Campo, Erro, Input, Textarea } from "@/components/ui";
import { SeletorVeiculo, type ClienteOpcao } from "@/components/seletor-veiculo";
import { FOTOS_PADRAO, ROTULO_POSICAO, type Posicao } from "@/lib/checkin";
import { cn } from "@/lib/utils";
import type { ResultadoPlaca } from "@/app/(app)/ordens-servico/actions";
import { criarCheckin } from "../actions";
import { ChecklistCampo, type Resposta } from "./checklist";
import { Assinatura, type AssinaturaHandle } from "@/components/assinatura";
import { comprimir, ehFalhaDeConexao, enviarArquivo, ErroEnvio, esperar, esperarConexao, offline } from "@/lib/upload-cliente";
import { apagarRascunho, lerRascunho, salvarRascunho, type RascunhoCheckin } from "@/lib/rascunho-checkin";

/* ---------- Upload e conexão ---------- */

const enviar = (blob: Blob, signal?: AbortSignal) => enviarArquivo(blob, "checkins", { signal });

type Foto = {
  id: number;
  posicao: Posicao;
  preview?: string;
  key?: string;
  /** aguardando = falhou por falta de internet; reenvia sozinha */
  status: "vazia" | "enviando" | "aguardando" | "ok" | "erro";
  erro?: string;
  arquivo?: Blob;
  /** Envio repetido (mostra "Reenviando…") */
  reenvio?: boolean;
};

const fotosPadrao = (): Foto[] => FOTOS_PADRAO.map((posicao, i) => ({ id: i, posicao, status: "vazia" }));

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const assinarConexao = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};
/** navigator.onLine com atualização pelos eventos online/offline */
function useConectado() {
  return useSyncExternalStore(assinarConexao, () => navigator.onLine, () => true);
}

/** Chave de idempotência (randomUUID só existe em HTTPS/localhost) */
function novaChave() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Falha de rede ao chamar a server action (o fetch rejeita com TypeError) */
const falhaDeRede = (e: unknown) => e instanceof TypeError || offline();

/** Erro com mensagem pronta para o usuário */
class ErroFormulario extends Error {}

/** Campos de texto guardados no rascunho (pelo `name`) */
const CAMPOS_TEXTO = ["km", "avarias", "objetos", "relato", "marca", "modelo", "clienteNome", "clienteTelefone"];

type Props = {
  /** Separa o rascunho salvo no navegador por oficina */
  oficinaId: string;
  clientes: ClienteOpcao[];
  inicial: ResultadoPlaca | null;
  /** Texto que o cliente lê antes de assinar */
  termo: string;
  /** Itens ativos do checklist da oficina */
  checklist: { id: string; grupo: string; descricao: string }[];
  /** Check-in de um agendamento: o relato começa com o serviço agendado */
  agendamento?: { id: string; relato: string } | null;
};

type Restauracao = { rascunho: RascunhoCheckin; fotos: Foto[] };

/* ---------- Rascunho ---------- */

/**
 * Procura um check-in não finalizado salvo neste navegador e pergunta se continua.
 * O formulário é montado de novo (key) com os dados recuperados.
 */
export function CheckinForm(props: Props) {
  const { oficinaId } = props;
  const [verificado, setVerificado] = useState(false);
  const [encontrado, setEncontrado] = useState<RascunhoCheckin | null>(null);
  const [restauracao, setRestauracao] = useState<Restauracao | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    lerRascunho(oficinaId).then((r) => {
      if (!vivo) return;
      setEncontrado(r);
      setVerificado(true);
    });
    return () => {
      vivo = false;
    };
  }, [oficinaId]);

  function continuar(r: RascunhoCheckin) {
    const fotos = r.fotos.map(
      (f, i): Foto => ({
        id: i,
        posicao: f.posicao,
        key: f.key,
        arquivo: f.arquivo,
        erro: f.erro,
        preview: f.arquivo ? URL.createObjectURL(f.arquivo) : undefined,
        status: f.key ? "ok" : !f.arquivo ? "vazia" : f.erro ? "erro" : "aguardando",
      }),
    );
    setRestauracao({ rascunho: r, fotos });
    setEncontrado(null);
    setVersao((v) => v + 1);
  }

  function descartar() {
    void apagarRascunho(oficinaId);
    setEncontrado(null);
  }

  const placa = encontrado?.veiculo && encontrado.veiculo.status !== "invalida" ? encontrado.veiculo.placa : null;
  const nFotos = encontrado?.fotos.filter((f) => f.arquivo || f.key).length ?? 0;

  return (
    <>
      {encontrado && (
        <div role="status" className="mb-6 flex flex-col gap-3 rounded-lg border border-blue-200 bg-info-soft p-3 sm:flex-row sm:items-center">
          <History className="hidden size-5 shrink-0 text-info sm:block" />
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-medium text-foreground">Recuperamos um check-in não finalizado</p>
            <p className="text-foreground-2">
              {[
                placa,
                nFotos > 0 && plural(nFotos, "foto", "fotos"),
                `salvo às ${new Date(encontrado.salvoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` +
                  (new Date(encontrado.salvoEm).toDateString() === new Date().toDateString()
                    ? ""
                    : ` de ${new Date(encontrado.salvoEm).toLocaleDateString("pt-BR")}`),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="primary" className="flex-1 sm:flex-none" onClick={() => continuar(encontrado)}>
              Continuar
            </Button>
            <Button type="button" className="flex-1 sm:flex-none" onClick={descartar}>
              Descartar
            </Button>
          </div>
        </div>
      )}
      <FormularioCheckin key={versao} {...props} restauracao={restauracao} podeSalvar={verificado && !encontrado} />
    </>
  );
}

/* ---------- Formulário ---------- */

type Fase =
  | { etapa: "fotos"; faltam: number }
  | { etapa: "assinatura" }
  | { etapa: "registrando" }
  | { etapa: "sem-conexao" }
  | { etapa: "concluido" };

function FormularioCheckin({
  oficinaId,
  clientes,
  inicial,
  termo,
  checklist,
  agendamento: agendamentoProp = null,
  restauracao,
  podeSalvar,
}: Props & { restauracao: Restauracao | null; podeSalvar: boolean }) {
  const router = useRouter();
  const r = restauracao?.rascunho;
  const agendamento = r ? r.agendamento : agendamentoProp;
  const [resultado, setResultado] = useState<ResultadoPlaca | null>(r ? r.veiculo : inicial);
  const [fotos, setFotos] = useState<Foto[]>(() => restauracao?.fotos ?? fotosPadrao());
  const [seq, setSeq] = useState(() => restauracao?.fotos.length ?? FOTOS_PADRAO.length);
  const [combustivel, setCombustivel] = useState<string>(r?.combustivel ?? "");
  const [chaveEnvio] = useState(() => r?.chaveEnvio ?? novaChave());
  const [erroLocal, setErroLocal] = useState<string>();
  const [fase, setFase] = useState<Fase | null>(null);
  const assinatura = useRef<AssinaturaHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const conectado = useConectado();

  // Estado mais recente para timers, eventos e a finalização (que roda fora do render)
  const atual = useRef({ fotos, resultado, combustivel, podeSalvar });
  useEffect(() => {
    atual.current = { fotos, resultado, combustivel, podeSalvar };
  });

  // Libera as prévias da memória ao sair
  const previews = useRef<string[]>(restauracao?.fotos.flatMap((f) => (f.preview ? [f.preview] : [])) ?? []);
  useEffect(() => {
    const lista = previews.current;
    return () => lista.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  // Rascunho recuperado: devolve os textos digitados (inclusive os do cadastro de placa nova)
  useEffect(() => {
    const form = formRef.current;
    if (!r || !form) return;
    for (const [nome, valor] of Object.entries(r.campos)) {
      const el = form.elements.namedItem(nome);
      if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type !== "hidden")) el.value = valor;
    }
  }, [r]);

  /* --- Fotos --- */

  const atualizar = (id: number, patch: Partial<Foto>) => setFotos((l) => l.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  // Só aplica o resultado se a foto ainda for a mesma (pode ter sido trocada/removida no meio do envio)
  const aplicar = (id: number, blob: Blob, patch: Partial<Foto>) =>
    setFotos((l) => l.map((f) => (f.id === id && f.arquivo === blob ? { ...f, ...patch } : f)));

  const emEnvio = useRef(new Set<Blob>());
  async function subir(id: number, blob: Blob, reenvio = false) {
    if (emEnvio.current.has(blob)) return;
    emEnvio.current.add(blob);
    aplicar(id, blob, { status: "enviando", erro: undefined, reenvio });
    try {
      aplicar(id, blob, { key: await enviar(blob), status: "ok", reenvio: false });
    } catch (e) {
      aplicar(
        id,
        blob,
        ehFalhaDeConexao(e)
          ? { status: "aguardando", reenvio: false }
          : { status: "erro", erro: e instanceof Error ? e.message : "Falha no envio", reenvio: false },
      );
    } finally {
      emEnvio.current.delete(blob);
    }
  }

  async function escolher(id: number, file: File | undefined) {
    if (!file) return;
    marcarAlteracao();
    const blob = await comprimir(file);
    const preview = URL.createObjectURL(blob);
    previews.current.push(preview);
    atualizar(id, { preview, arquivo: blob, status: "enviando", erro: undefined, key: undefined, reenvio: false });
    void subir(id, blob);
  }

  function adicionarExtra(posicao: Posicao) {
    marcarAlteracao();
    setFotos((l) => [...l, { id: seq, posicao, status: "vazia" }]);
    setSeq((n) => n + 1);
  }

  const enviando = fotos.filter((f) => f.status === "enviando").length;
  const aguardando = fotos.filter((f) => f.status === "aguardando").length;
  const temAguardando = aguardando > 0;

  // Reenvio automático: logo que a internet volta e, depois, a cada 15 s (30 s se o navegador diz offline)
  useEffect(() => {
    if (!temAguardando) return;
    const tentar = () => {
      for (const f of atual.current.fotos) if (f.status === "aguardando" && f.arquivo) void subir(f.id, f.arquivo, true);
    };
    const t = conectado ? setTimeout(tentar, 1_500) : undefined;
    const i = setInterval(tentar, conectado ? 15_000 : 30_000);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
    // subir só usa setters e refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temAguardando, conectado]);

  /* --- Rascunho no navegador --- */

  const alterado = useRef(!!r);
  const concluido = useRef(false);
  const timerRascunho = useRef<ReturnType<typeof setTimeout>>(undefined);

  function salvarAgora() {
    clearTimeout(timerRascunho.current);
    const form = formRef.current;
    const { fotos, resultado, combustivel, podeSalvar } = atual.current;
    if (!podeSalvar || !alterado.current || concluido.current || !form) return;
    const dados = new FormData(form);
    const campos: Record<string, string> = {};
    for (const nome of CAMPOS_TEXTO) {
      const v = dados.get(nome);
      if (typeof v === "string" && v) campos[nome] = v;
    }
    const respostas: Record<string, Resposta> = {};
    try {
      const lista = JSON.parse(String(dados.get("checklist") ?? "[]")) as { id: string; estado: Resposta["estado"]; obs: string | null }[];
      for (const i of lista) respostas[i.id] = { estado: i.estado, obs: i.obs ?? "" };
    } catch {
      // checklist ilegível: salva sem ele
    }
    void salvarRascunho(oficinaId, {
      versao: 1,
      salvoEm: Date.now(),
      chaveEnvio,
      veiculo: resultado,
      clienteId: String(dados.get("clienteId") ?? ""),
      agendamento,
      campos,
      combustivel,
      checklist: respostas,
      fotos: fotos.map((f) => ({ posicao: f.posicao, key: f.key, arquivo: f.arquivo, erro: f.status === "erro" ? f.erro : undefined })),
    });
  }

  function marcarAlteracao() {
    alterado.current = true;
    clearTimeout(timerRascunho.current);
    timerRascunho.current = setTimeout(salvarAgora, 600);
  }

  // Fotos, combustível e veículo mudam fora dos eventos do formulário (ex.: fim do envio)
  useEffect(() => {
    if (alterado.current) marcarAlteracao();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotos, combustivel, resultado, podeSalvar]);

  // Salva na hora quando a página some (câmera aberta, troca de app); o Android pode matar a aba
  useEffect(() => {
    const sair = () => {
      if (document.visibilityState === "hidden") salvarAgora();
    };
    document.addEventListener("visibilitychange", sair);
    window.addEventListener("pagehide", salvarAgora);
    return () => {
      document.removeEventListener("visibilitychange", sair);
      window.removeEventListener("pagehide", salvarAgora);
      clearTimeout(timerRascunho.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- Registro --- */

  const finalizacao = useRef<AbortController | null>(null);

  /** Repete `fn` enquanto a falha for de conexão, esperando a internet voltar */
  async function comReenvio<T>(signal: AbortSignal, etapa: Fase, fn: () => Promise<T>, temporaria: (e: unknown) => boolean): Promise<T> {
    for (;;) {
      if (signal.aborted) throw new ErroEnvio("Cancelado", "cancelado");
      setFase(etapa);
      try {
        return await fn();
      } catch (e) {
        if (signal.aborted || !temporaria(e)) throw e;
        setFase({ etapa: "sem-conexao" });
        await esperarConexao(signal);
      }
    }
  }

  async function finalizar(signal: AbortSignal, assinaturaBlob: Blob | null) {
    // 1. Espera as fotos pendentes (o reenvio automático continua trabalhando)
    for (;;) {
      const atuais = atual.current.fotos;
      if (atuais.some((f) => f.status === "erro")) throw new ErroFormulario("Alguma foto foi recusada. Troque ou remova a foto antes de registrar.");
      const faltam = atuais.filter((f) => f.status === "enviando" || f.status === "aguardando").length;
      if (faltam === 0) break;
      setFase({ etapa: "fotos", faltam });
      await esperar(500, signal);
    }

    // 2. Assinatura
    const assinaturaKey = assinaturaBlob
      ? await comReenvio(signal, { etapa: "assinatura" }, () => enviar(assinaturaBlob, signal), ehFalhaDeConexao)
      : "";

    // 3. Registro (a chave de envio evita check-in duplicado se a resposta se perder)
    const dados = new FormData(formRef.current!);
    dados.set("fotos", JSON.stringify(atual.current.fotos.filter((f) => f.key).map((f) => ({ posicao: f.posicao, key: f.key }))));
    dados.set("assinaturaKey", assinaturaKey);
    dados.set("chaveEnvio", chaveEnvio);
    const res = await comReenvio(signal, { etapa: "registrando" }, () => criarCheckin(dados), falhaDeRede);
    if ("erro" in res) throw new ErroFormulario(res.erro);

    concluido.current = true;
    clearTimeout(timerRascunho.current);
    setFase({ etapa: "concluido" });
    await apagarRascunho(oficinaId);
    router.replace(`/check-in/${res.id}`);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (finalizacao.current || concluido.current) return;
    setErroLocal(undefined);
    if (fotos.some((f) => f.status === "erro")) return setErroLocal("Alguma foto foi recusada. Troque ou remova a foto antes de registrar.");
    const faltando = fotos.filter((f) => FOTOS_PADRAO.includes(f.posicao) && f.status === "vazia").length;
    if (faltando > 0 && !confirm(`Faltam ${faltando} das ${FOTOS_PADRAO.length} fotos padrão. Registrar mesmo assim?`)) return;
    if (assinatura.current?.vazia() && !confirm("O cliente não assinou. Registrar mesmo assim?")) return;

    const ctrl = new AbortController();
    finalizacao.current = ctrl;
    try {
      const assinaturaBlob = (await assinatura.current?.exportar()) ?? null;
      await finalizar(ctrl.signal, assinaturaBlob);
    } catch (err) {
      setFase(null);
      if (err instanceof ErroEnvio && err.tipo === "cancelado") return;
      if (err instanceof ErroFormulario) setErroLocal(err.message);
      else if (err instanceof ErroEnvio) setErroLocal(`Não foi possível enviar a assinatura: ${err.message}`);
      else setErroLocal("Não foi possível registrar o check-in. Tente de novo.");
    } finally {
      finalizacao.current = null;
    }
  }

  const ocupado = fase !== null;
  const podeCancelar = fase !== null && fase.etapa !== "registrando" && fase.etapa !== "concluido";

  let status: { texto: string; offline?: boolean } | null = null;
  if (fase?.etapa === "fotos") status = { texto: `Aguardando enviar ${plural(fase.faltam, "foto", "fotos")}…`, offline: !conectado };
  else if (fase?.etapa === "assinatura") status = { texto: "Enviando assinatura…" };
  else if (fase?.etapa === "registrando") status = { texto: "Registrando…" };
  else if (fase?.etapa === "sem-conexao") status = { texto: "Sem internet. O check-in será registrado quando a conexão voltar.", offline: true };
  else if (fase?.etapa === "concluido") status = { texto: "Check-in registrado. Abrindo…" };
  else if (enviando > 0) status = { texto: "Enviando fotos…" };
  else if (aguardando > 0) status = { texto: `${plural(aguardando, "foto aguardando", "fotos aguardando")} internet`, offline: true };

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onInput={marcarAlteracao}
      onChange={marcarAlteracao}
      onClick={(e) => {
        // Botões de escolha (checklist, combustível) mudam estado sem disparar input
        if ((e.target as HTMLElement).closest("button[type=button]")) marcarAlteracao();
      }}
      className="flex flex-col gap-8 pb-32 sm:pb-0"
    >
      {!conectado ? (
        <AvisoConexao>Sem internet. As fotos serão enviadas quando a conexão voltar.</AvisoConexao>
      ) : (
        aguardando > 0 && <AvisoConexao>Conexão instável. Reenviando {plural(aguardando, "foto", "fotos")}…</AvisoConexao>
      )}

      <Secao n={1} titulo="Veículo e cliente">
        <SeletorVeiculo clientes={clientes} inicial={r ? r.veiculo : inicial} inicialClienteId={r?.clienteId} onChange={setResultado} />
      </Secao>

      <Secao n={2} titulo="Fotos de chegada">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fotos.map((f) => (
            <li key={f.id}>
              <SlotFoto
                foto={f}
                onEscolher={(file) => escolher(f.id, file)}
                onReenviar={() => f.arquivo && subir(f.id, f.arquivo, true)}
                onRemover={
                  FOTOS_PADRAO.includes(f.posicao)
                    ? () => atualizar(f.id, { status: "vazia", preview: undefined, key: undefined, arquivo: undefined, erro: undefined })
                    : () => setFotos((l) => l.filter((x) => x.id !== f.id))
                }
              />
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => adicionarExtra("avaria")}>
            <ImagePlus />Foto de avaria
          </Button>
          <Button type="button" variant="ghost" onClick={() => adicionarExtra("outra")}>
            <ImagePlus />Outra foto
          </Button>
        </div>
      </Secao>

      <Secao n={3} titulo="Estado na chegada">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Km atual" htmlFor="km">
            <Input
              id="km"
              name="km"
              inputMode="numeric"
              placeholder={resultado?.status === "encontrada" && resultado.veiculo.km ? `Último: ${resultado.veiculo.km.toLocaleString("pt-BR")}` : ""}
            />
          </Campo>
          <fieldset className="flex min-w-0 flex-col gap-1.5">
            <legend className="mb-1.5 text-[13px] font-medium text-foreground-2">Combustível</legend>
            <input type="hidden" name="combustivel" value={combustivel} />
            <div className="grid grid-cols-5 overflow-hidden rounded-md border border-border-strong" role="radiogroup" aria-label="Nível de combustível">
              {[
                ["0", "Res."],
                ["2", "1/4"],
                ["4", "1/2"],
                ["6", "3/4"],
                ["8", "Cheio"],
              ].map(([v, rot]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={combustivel === v}
                  onClick={() => setCombustivel(combustivel === v ? "" : v)}
                  className={cn(
                    "h-11 border-l border-border-strong text-sm font-medium first:border-l-0",
                    combustivel === v ? "bg-primary text-white" : "bg-white text-foreground-2 hover:bg-subtle",
                  )}
                >
                  {rot}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <Campo label="Avarias já existentes" htmlFor="avarias">
          <Textarea id="avarias" name="avarias" rows={2} placeholder="Ex.: risco na porta traseira direita, para-choque trincado" />
        </Campo>
        <Campo label="Objetos deixados no veículo" htmlFor="objetos" hint="(opcional)">
          <Input id="objetos" name="objetos" placeholder="Ex.: cadeirinha, óculos, carregador" />
        </Campo>
      </Secao>

      {checklist.length > 0 && (
        <Secao n={4} titulo="Checklist">
          <ChecklistCampo itens={checklist} inicial={r?.checklist} />
        </Secao>
      )}

      <Secao n={checklist.length > 0 ? 5 : 4} titulo="Serviço">
        <Campo label="O que o cliente relatou" htmlFor="relato">
          <Textarea
            id="relato"
            name="relato"
            rows={3}
            required
            defaultValue={agendamento?.relato}
            placeholder="Ex.: carro falhando quando frio, luz da bateria acende"
          />
          {agendamento && <input type="hidden" name="agendamentoId" value={agendamento.id} />}
        </Campo>
      </Secao>

      <Secao n={checklist.length > 0 ? 6 : 5} titulo="Assinatura do cliente">
        <p className="text-[13px] text-foreground-2">{termo}</p>
        <Assinatura ref={assinatura} />
      </Secao>

      <Erro>{erroLocal}</Erro>

      {/* No celular o botão fica fixo no rodapé */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          {status && (
            <span role="status" className={cn("flex items-center gap-1.5 text-[13px]", status.offline ? "text-warn" : "text-muted")}>
              {status.offline ? <WifiOff className="size-4 shrink-0" /> : <Loader2 className="size-4 shrink-0 animate-spin" />}
              {status.texto}
            </span>
          )}
          <div className="flex gap-2">
            {podeCancelar && (
              <Button type="button" className="h-11 px-4" onClick={() => finalizacao.current?.abort()}>
                Cancelar
              </Button>
            )}
            <Button
              variant="primary"
              className="h-11 flex-1 px-5 text-[15px] sm:flex-none"
              disabled={ocupado || !resultado || resultado.status === "invalida"}
            >
              {ocupado ? "Registrando…" : "Registrar entrada"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function AvisoConexao({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-2 rounded-md border border-amber-200 bg-warn-soft px-3 py-2 text-[13px] text-warn">
      <WifiOff className="size-4 shrink-0" />
      {children}
    </p>
  );
}

function Secao({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-white">{n}</span>
        <h2 className="text-[15px] font-semibold leading-6">{titulo}</h2>
      </div>
      <div className="flex flex-col gap-4 sm:pl-9">{children}</div>
    </section>
  );
}

/* ---------- Foto ---------- */

function SlotFoto({
  foto,
  onEscolher,
  onReenviar,
  onRemover,
}: {
  foto: Foto;
  onEscolher: (f: File | undefined) => void;
  onReenviar: () => void;
  onRemover: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const rotulo = ROTULO_POSICAO[foto.posicao];
  return (
    <div className="flex flex-col gap-1">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-subtle">
        {foto.preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:)
          <img src={foto.preview} alt={rotulo} className="size-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-1.5 border-2 border-dashed border-border-strong text-[13px] font-medium text-foreground-2 hover:bg-zinc-100"
          >
            <Camera className="size-6 text-muted" strokeWidth={1.75} />
            Tirar foto
          </button>
        )}
        {foto.status === "enviando" && (
          <span className="absolute inset-0 grid place-items-center bg-white/60">
            <Loader2 className="size-6 animate-spin text-foreground-2" aria-label={foto.reenvio ? "Reenviando" : "Enviando"} />
          </span>
        )}
        {foto.status === "ok" && (
          <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-ok text-white" aria-label="Enviada">
            <Check className="size-4" />
          </span>
        )}
        {foto.status === "aguardando" && (
          <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-warn text-white" aria-label="Aguardando internet">
            <WifiOff className="size-3.5" />
          </span>
        )}
        {foto.preview && foto.status !== "enviando" && (
          <div className="absolute bottom-1.5 right-1.5 flex gap-1.5">
            <button type="button" onClick={() => input.current?.click()} className="grid size-9 place-items-center rounded-full bg-white/90 shadow-card" aria-label={`Trocar foto: ${rotulo}`}>
              <Camera className="size-4" />
            </button>
            <button type="button" onClick={onRemover} className="grid size-9 place-items-center rounded-full bg-white/90 shadow-card" aria-label={`Remover foto: ${rotulo}`}>
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
        {!foto.preview && !FOTOS_PADRAO.includes(foto.posicao) && (
          <button type="button" onClick={onRemover} className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-white/90" aria-label="Remover espaço de foto">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className="truncate font-medium">{rotulo}</span>
        {(foto.status === "erro" || foto.status === "aguardando") && (
          <button
            type="button"
            onClick={onReenviar}
            className={cn("flex shrink-0 items-center gap-1 underline", foto.status === "erro" ? "text-danger" : "text-foreground-2")}
          >
            <RotateCcw className="size-3.5" />Tentar de novo
          </button>
        )}
      </div>
      {foto.status === "aguardando" && <p className="text-xs text-warn">Aguardando internet…</p>}
      {foto.status === "enviando" && foto.reenvio && <p className="text-xs text-muted">Reenviando…</p>}
      {foto.status === "erro" && foto.erro && <p className="text-xs text-danger">{foto.erro}</p>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label={rotulo}
        onChange={(e) => {
          onEscolher(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
