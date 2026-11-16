"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { CarFront, X } from "lucide-react";
import { Button, Campo, Erro, Input, Textarea } from "@/components/ui";
import { Assinatura, type AssinaturaHandle } from "@/components/assinatura";
import { enviarArquivo } from "@/lib/upload-cliente";
import { entregarOS } from "../edicao";

/** Botão "Entregar veículo" + janela com km de saída, garantia, observação e assinatura de retirada */
export function EntregarOS({
  osId,
  kmEntrada,
  garantiaPadrao,
  textoGarantia,
}: {
  osId: string;
  kmEntrada: number | null;
  /** AAAA-MM-DD sugerido */
  garantiaPadrao: string;
  textoGarantia: string | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const assinatura = useRef<AssinaturaHandle>(null);
  const [state, dispatch, pending] = useActionState(entregarOS.bind(null, osId), undefined);
  const [enviando, setEnviando] = useState(false);
  const [erroLocal, setErroLocal] = useState<string>();

  // Abre direto quando vem do quadro ("Entregar" no cartão)
  useEffect(() => {
    if (window.location.hash === "#entregar") dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (state?.ok) dialog.current?.close();
  }, [state]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErroLocal(undefined);
    const dados = new FormData(e.currentTarget);
    if (assinatura.current?.vazia() && !confirm("O cliente não assinou a retirada. Entregar mesmo assim?")) return;
    setEnviando(true);
    try {
      const blob = await assinatura.current?.exportar();
      dados.set("assinaturaKey", blob ? await enviarArquivo(blob, "os") : "");
    } catch {
      setEnviando(false);
      return setErroLocal("Não foi possível enviar a assinatura. Tente de novo.");
    }
    setEnviando(false);
    startTransition(() => dispatch(dados));
  }

  const ocupado = pending || enviando;

  return (
    <>
      <Button variant="primary" onClick={() => dialog.current?.showModal()}>
        <CarFront />
        Entregar veículo
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="entrega-titulo"
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-border bg-card p-0 text-foreground shadow-pop backdrop:bg-zinc-950/40"
      >
        <form onSubmit={onSubmit} className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id="entrega-titulo" className="text-[17px] font-semibold">
              Entregar veículo
            </h2>
            <Button type="button" variant="ghost" className="px-2" onClick={() => dialog.current?.close()} aria-label="Fechar">
              <X />
            </Button>
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Km de saída" htmlFor="ent-km">
                <Input
                  id="ent-km"
                  name="kmSaida"
                  inputMode="numeric"
                  placeholder={kmEntrada != null ? `Entrada: ${kmEntrada.toLocaleString("pt-BR")}` : ""}
                />
              </Campo>
              <Campo label="Garantia até" htmlFor="ent-garantia">
                <Input id="ent-garantia" name="garantiaAte" type="date" defaultValue={garantiaPadrao} />
              </Campo>
            </div>
            <Campo label="Observações da entrega" hint="(opcional)" htmlFor="ent-obs">
              <Textarea id="ent-obs" name="entregaObs" rows={2} className="min-h-16" placeholder="Ex.: peças antigas entregues ao cliente" />
            </Campo>
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-medium text-foreground-2">Assinatura de retirada</p>
              <p className="text-[13px] text-foreground-2">
                Declaro que retirei o veículo com os serviços realizados.{textoGarantia ? ` ${textoGarantia}` : ""}
              </p>
              <Assinatura ref={assinatura} />
            </div>
            <Erro>{erroLocal ?? state?.erro}</Erro>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={ocupado}>
              {ocupado ? "Registrando…" : "Confirmar entrega"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
