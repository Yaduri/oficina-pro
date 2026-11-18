/**
 * Rascunho do check-in em andamento, salvo no IndexedDB do navegador.
 * Protege contra o celular recarregar a página (comum ao abrir a câmera no Android).
 */

import type { ResultadoPlaca } from "@/app/(app)/ordens-servico/actions";
import type { Posicao } from "@/lib/checkin";
import type { EstadoChecklist } from "@/lib/checklist";

export type RascunhoCheckin = {
  versao: 1;
  salvoEm: number;
  /** Chave de idempotência do envio (mantida após recarregar) */
  chaveEnvio: string;
  /** Veículo escolhido e cliente selecionado no cadastro de placa nova */
  veiculo: ResultadoPlaca | null;
  clienteId: string;
  agendamento: { id: string; relato: string } | null;
  /** Campos de texto pelo `name` */
  campos: Record<string, string>;
  combustivel: string;
  checklist: Record<string, { estado: EstadoChecklist | null; obs: string }>;
  /** Fotos já reduzidas; `key` quando já enviadas */
  fotos: { posicao: Posicao; key?: string; arquivo?: Blob; erro?: string }[];
};

const BANCO = "oficina-pro";
const LOJA = "rascunhos";
/** Rascunhos mais antigos que isso são descartados */
const VALIDADE = 7 * 24 * 60 * 60 * 1000;

let conexao: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (!conexao) {
    conexao = new Promise<IDBDatabase>((res, rej) => {
      const req = indexedDB.open(BANCO, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(LOJA);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    conexao.catch(() => (conexao = null));
  }
  return conexao;
}

async function operar<T>(modo: IDBTransactionMode, fn: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  return new Promise<T>((res, rej) => {
    const tx = db.transaction(LOJA, modo);
    const req = fn(tx.objectStore(LOJA));
    tx.oncomplete = () => res(req.result);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

const chave = (oficinaId: string) => `checkin-novo:${oficinaId}`;

// As gravações saem em fila para a última sempre prevalecer
let fila: Promise<unknown> = Promise.resolve();
const enfileirar = <T>(fn: () => Promise<T>) => {
  const p = fila.then(fn, fn);
  fila = p.catch(() => undefined);
  return p;
};

export async function lerRascunho(oficinaId: string): Promise<RascunhoCheckin | null> {
  try {
    const r = await operar<RascunhoCheckin | undefined>("readonly", (l) => l.get(chave(oficinaId)));
    if (!r || r.versao !== 1) return null;
    if (Date.now() - r.salvoEm > VALIDADE) {
      void apagarRascunho(oficinaId);
      return null;
    }
    return r;
  } catch {
    return null; // navegador sem IndexedDB (ex.: aba anônima antiga): segue sem rascunho
  }
}

export function salvarRascunho(oficinaId: string, r: RascunhoCheckin) {
  return enfileirar(() => operar("readwrite", (l) => l.put(r, chave(oficinaId)))).catch(() => undefined);
}

export function apagarRascunho(oficinaId: string) {
  return enfileirar(() => operar("readwrite", (l) => l.delete(chave(oficinaId)))).catch(() => undefined);
}
