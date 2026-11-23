/** Envio de imagens (e PDFs do financeiro) pelo navegador para /api/upload */

/** Reduz a foto no próprio celular (máx. 1600 px, JPEG 80%) antes de enviar */
export async function comprimir(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.8));
    if (blob) return blob;
  } catch {
    // formato que o navegador não decodifica: tenta enviar o original
  }
  return file;
}

/**
 * Falha no envio.
 * - "conexao": sem internet, tempo esgotado ou servidor indisponível (5xx/429) — vale tentar depois.
 * - "recusado": o servidor recusou o arquivo (4xx); a mensagem vem do servidor.
 * - "cancelado": quem chamou abortou.
 */
export class ErroEnvio extends Error {
  constructor(
    message: string,
    readonly tipo: "conexao" | "recusado" | "cancelado",
  ) {
    super(message);
    this.name = "ErroEnvio";
  }
}

/** A falha foi de conexão (tentar de novo quando a internet voltar) */
export const ehFalhaDeConexao = (e: unknown) => e instanceof ErroEnvio && e.tipo === "conexao";

/** Espera `ms`, interrompendo se o sinal for abortado */
export function esperar(ms: number, signal?: AbortSignal) {
  return new Promise<void>((res, rej) => {
    if (signal?.aborted) return rej(new ErroEnvio("Cancelado", "cancelado"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", abortar);
      res();
    }, ms);
    const abortar = () => {
      clearTimeout(t);
      rej(new ErroEnvio("Cancelado", "cancelado"));
    };
    signal?.addEventListener("abort", abortar, { once: true });
  });
}

export const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/**
 * Espera a internet voltar: resolve logo após o evento `online` ou, sem ele, depois de
 * alguns segundos (o navegador nem sempre percebe a volta da conexão, e "online" não garante rede boa).
 */
export function esperarConexao(signal?: AbortSignal) {
  return new Promise<void>((res, rej) => {
    const fim = () => {
      clearTimeout(t);
      window.removeEventListener("online", voltou);
      signal?.removeEventListener("abort", abortar);
    };
    const voltou = () => {
      fim();
      setTimeout(res, 1_000); // dá um tempo para a rede estabilizar
    };
    const abortar = () => {
      fim();
      rej(new ErroEnvio("Cancelado", "cancelado"));
    };
    const t = setTimeout(
      () => {
        fim();
        res();
      },
      offline() ? 20_000 : 5_000,
    );
    if (signal?.aborted) return abortar();
    window.addEventListener("online", voltou);
    signal?.addEventListener("abort", abortar, { once: true });
  });
}

/** Esperas entre as tentativas (a 1ª é imediata) */
const ESPERAS = [2_000, 5_000, 10_000];
const TEMPO_LIMITE = 60_000;

/**
 * Envia e devolve a chave do arquivo no armazenamento.
 * Tenta até 4 vezes (esperas de 2 s, 5 s e 10 s) quando a falha é de rede, tempo esgotado,
 * 5xx ou 429. Erros 4xx não são repetidos. Sem internet, desiste logo (ErroEnvio "conexao").
 */
export async function enviarArquivo(
  blob: Blob,
  pasta: "checkins" | "logos" | "os" | "financeiro",
  opcoes: { signal?: AbortSignal; tentativas?: number; oficinaId?: string } = {},
): Promise<string> {
  const { signal, oficinaId } = opcoes;
  const tentativas = opcoes.tentativas ?? ESPERAS.length + 1;
  let ultimo = new ErroEnvio("Sem conexão com o servidor", "conexao");

  for (let i = 0; i < tentativas; i++) {
    if (i > 0) {
      // Sem internet não adianta insistir: quem chamou decide quando tentar de novo
      if (offline()) break;
      await esperar(ESPERAS[Math.min(i - 1, ESPERAS.length - 1)], signal);
    }
    if (signal?.aborted) throw new ErroEnvio("Cancelado", "cancelado");

    const form = new FormData();
    form.append("arquivo", blob, "foto");
    form.append("pasta", pasta);
    if (oficinaId) form.append("oficinaId", oficinaId);
    const ctrl = new AbortController();
    let estourou = false;
    const timer = setTimeout(() => {
      estourou = true;
      ctrl.abort();
    }, TEMPO_LIMITE);
    const repassar = () => ctrl.abort();
    signal?.addEventListener("abort", repassar, { once: true });

    try {
      const res = await fetch("/api/upload", { method: "POST", body: form, signal: ctrl.signal });
      const json = (await res.json().catch(() => ({}))) as { key?: string; erro?: string };
      if (res.ok && json.key) return json.key;
      if (res.status >= 500 || res.status === 429) {
        ultimo = new ErroEnvio("Servidor indisponível. Tentando de novo…", "conexao");
        continue;
      }
      throw new ErroEnvio(json.erro ?? `Falha no envio (${res.status})`, "recusado");
    } catch (e) {
      if (e instanceof ErroEnvio) throw e;
      if (signal?.aborted) throw new ErroEnvio("Cancelado", "cancelado");
      // TypeError do fetch (rede) ou tempo esgotado
      ultimo = new ErroEnvio(estourou ? "O envio demorou demais" : "Sem conexão com o servidor", "conexao");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", repassar);
    }
  }
  throw ultimo;
}
