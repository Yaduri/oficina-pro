"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/financeiro", label: "Visão geral" },
  { href: "/financeiro/receber", label: "A receber" },
  { href: "/financeiro/pagar", label: "A pagar" },
  { href: "/financeiro/caixa", label: "Caixa e bancos" },
  { href: "/financeiro/relatorios", label: "Relatórios" },
  { href: "/financeiro/comissoes", label: "Comissões" },
  { href: "/financeiro/configuracoes", label: "Contas e categorias" },
];

/** Abas do financeiro */
export function AbasFinanceiro() {
  const pathname = usePathname();
  return (
    <nav aria-label="Financeiro" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border">
      {ABAS.map((a) => {
        const ativo = a.href === "/financeiro" ? pathname === a.href : pathname.startsWith(a.href);
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 font-medium",
              ativo ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {a.label}
          </Link>
        );
      })}
    </nav>
  );
}
