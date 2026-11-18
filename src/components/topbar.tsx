"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Brand } from "@/components/brand";
import { BuscaGlobal } from "@/components/busca-global";
import { Sino } from "@/components/sino";
import { cn } from "@/lib/utils";
import { pode, type Acao, type Papel } from "@/lib/permissoes";

const NAV: { href: string; label: string; acao?: Acao }[] = [
  { href: "/inicio", label: "Início" },
  { href: "/agenda", label: "Agenda" },
  { href: "/check-in", label: "Check-in" },
  { href: "/orcamentos", label: "Orçamentos", acao: "verValores" },
  { href: "/ordens-servico", label: "Ordens de serviço" },
  { href: "/clientes", label: "Clientes" },
  { href: "/estoque", label: "Estoque" },
  { href: "/financeiro", label: "Financeiro", acao: "financeiro" },
];

export function Topbar({ oficina, papel }: { oficina: string; papel: Papel }) {
  const admin = pode(papel, "configurar");
  const pathname = usePathname();
  const navLinks = NAV.filter((item) => !item.acao || pode(papel, item.acao)).map((item) => {
    const ativo = pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={ativo ? "page" : undefined}
        className={cn(
          "whitespace-nowrap rounded-md px-2.5 py-1.5 font-medium transition-colors",
          ativo ? "bg-subtle text-foreground" : "text-muted hover:text-foreground",
        )}
      >
        {item.label}
      </Link>
    );
  });

  // pt/px com env(): app instalado em tela cheia não fica sob o entalhe (no navegador é 0)
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] print:hidden">
      <div className="flex h-16 items-center gap-2.5 px-4 sm:px-8">
        <Link href="/inicio" className="mr-3 shrink-0" aria-label={`Início — ${oficina}`}>
          <Brand />
        </Link>
        <nav className="hidden xl:flex gap-0.5" aria-label="Principal">
          {navLinks}
        </nav>
        <div className="flex-1" />

        <BuscaGlobal />
        <Sino />
        {admin && (
          <Link
            href="/configuracoes"
            aria-label="Configurações"
            title="Configurações"
            aria-current={pathname.startsWith("/configuracoes") ? "page" : undefined}
            className={cn(
              "grid size-9 place-items-center rounded-md border border-border text-foreground-2 hover:bg-subtle",
              pathname.startsWith("/configuracoes") && "bg-subtle text-foreground",
            )}
          >
            <Settings className="size-[18px]" strokeWidth={1.75} />
          </Link>
        )}
        <div className="grid size-9 place-items-center">
          <UserButton />
        </div>
      </div>

      {/* Telas menores: menu em linha rolável */}
      <div className="xl:hidden border-t border-border">
        <nav className="flex gap-0.5 no-scrollbar overflow-x-auto px-3 py-2 sm:px-7" aria-label="Principal (compacto)">
          {navLinks}
        </nav>
      </div>
    </header>
  );
}
