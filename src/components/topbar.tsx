"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bell, Search, Settings } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Brand } from "@/components/brand";
import { cn } from "@/lib/utils";
import type { TipoEmpresa } from "@/components/ui";
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

type EmpresaResumo = { id: string; nome: string; tipo: TipoEmpresa };

const dot: Record<TipoEmpresa, string> = { mecanica: "bg-mec", eletrica: "bg-ele", outra: "bg-muted" };
const txt: Record<TipoEmpresa, string> = { mecanica: "text-mec", eletrica: "text-ele", outra: "text-foreground-2" };

export function Topbar({ empresas, oficina, papel }: { empresas: EmpresaResumo[]; oficina: string; papel: Papel }) {
  const admin = pode(papel, "configurar");
  const pathname = usePathname();
  const params = useSearchParams();
  const atual = params.get("empresa");

  // Mantém o filtro de empresa ao navegar entre páginas
  const comFiltro = (href: string) => (atual ? `${href}?empresa=${atual}` : href);
  const filtroHref = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set("empresa", id);
    else p.delete("empresa");
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const navLinks = NAV.filter((item) => !item.acao || pode(papel, item.acao)).map((item) => {
    const ativo = pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        key={item.href}
        href={comFiltro(item.href)}
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

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card print:hidden">
      <div className="flex h-16 items-center gap-2.5 px-4 sm:px-8">
        <Link href={comFiltro("/inicio")} className="mr-3 shrink-0" aria-label={`Início — ${oficina}`}>
          <Brand />
        </Link>
        <nav className="hidden xl:flex gap-0.5" aria-label="Principal">
          {navLinks}
        </nav>
        <div className="flex-1" />

        {empresas.length > 1 && (
          <div className="hidden sm:flex rounded-lg bg-subtle p-[3px] gap-0.5" role="group" aria-label="Filtrar por empresa">
            <Link
              href={filtroHref(null)}
              className={cn("rounded-md px-3 py-1 text-[13px] font-medium", !atual ? "bg-card text-foreground shadow-card" : "text-muted")}
            >
              Todas
            </Link>
            {empresas.map((e) => (
              <Link
                key={e.id}
                href={filtroHref(e.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-[13px] font-medium",
                  txt[e.tipo],
                  atual === e.id && "bg-card shadow-card",
                )}
              >
                <span className={cn("size-1.5 rounded-full", dot[e.tipo])} />
                {e.nome}
              </Link>
            ))}
          </div>
        )}

        <button className="grid size-9 place-items-center rounded-md border border-border text-foreground-2 hover:bg-subtle" aria-label="Buscar">
          <Search className="size-[18px]" strokeWidth={1.75} />
        </button>
        <button className="relative grid size-9 place-items-center rounded-md border border-border text-foreground-2 hover:bg-subtle" aria-label="Notificações">
          <Bell className="size-[18px]" strokeWidth={1.75} />
        </button>
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

      {/* Telas menores: menu em linha rolável + filtro de empresa */}
      <div className="xl:hidden border-t border-border">
        <nav className="flex gap-0.5 no-scrollbar overflow-x-auto px-3 py-2 sm:px-7" aria-label="Principal (compacto)">
          {navLinks}
        </nav>
        {empresas.length > 1 && (
          <div className="sm:hidden no-scrollbar flex gap-1.5 overflow-x-auto border-t border-border px-4 py-2">
            <Link href={filtroHref(null)} className={cn("rounded-full border px-3 py-1 text-[13px] font-medium", !atual ? "border-primary bg-primary text-white" : "border-border text-muted")}>
              Todas
            </Link>
            {empresas.map((e) => (
              <Link
                key={e.id}
                href={filtroHref(e.id)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[13px] font-medium",
                  atual === e.id ? "border-primary bg-primary text-white" : cn("border-border", txt[e.tipo]),
                )}
              >
                {e.nome}
              </Link>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
