"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/estoque", label: "Peças" },
  { href: "/estoque/compras", label: "Compras e entradas" },
  { href: "/estoque/fornecedores", label: "Fornecedores" },
  { href: "/estoque/reposicao", label: "Reposição" },
  { href: "/estoque/inventario", label: "Inventário" },
];

/** Abas do estoque */
export function AbasEstoque() {
  const pathname = usePathname();
  return (
    <nav aria-label="Estoque" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border">
      {ABAS.map((a) => {
        const ativo = a.href === "/estoque" ? pathname === a.href : pathname.startsWith(a.href);
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
