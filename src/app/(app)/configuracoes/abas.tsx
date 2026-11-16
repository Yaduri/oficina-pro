"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/configuracoes", label: "Oficina e empresas" },
  { href: "/configuracoes/usuarios", label: "Usuários" },
];

export function AbasConfig() {
  const pathname = usePathname();
  return (
    <nav aria-label="Configurações" className="flex gap-1 border-b border-border">
      {ABAS.map((a) => {
        const ativo = pathname === a.href;
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 font-medium",
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
