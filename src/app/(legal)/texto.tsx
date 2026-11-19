import type { ReactNode } from "react";
import { LEGAL } from "@/lib/legal";

/** Estrutura comum das páginas legais */
export function Documento({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <article className="flex flex-col gap-6 text-[15px] leading-relaxed text-foreground-2">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{titulo}</h1>
        <p className="text-[13px] text-muted">Atualizado em {LEGAL.atualizadoEm}</p>
      </header>
      {children}
    </article>
  );
}

export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[17px] font-semibold text-foreground">{titulo}</h2>
      {children}
    </section>
  );
}

export function Lista({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1.5 pl-5">{children}</ul>;
}

/** Como falar com o responsável */
export function Contato() {
  return LEGAL.email ? (
    <>
      pelo e-mail{" "}
      <a href={`mailto:${LEGAL.email}`} className="font-medium text-foreground underline underline-offset-2">
        {LEGAL.email}
      </a>
    </>
  ) : (
    <>pelos canais de atendimento informados na contratação</>
  );
}
