import Link from "next/link";
import { Columns3, List } from "lucide-react";
import { cn } from "@/lib/utils";

/** Alterna entre o quadro (OS abertas) e a lista com filtros (todas as OS) */
export function AbasOS({ atual, empresaId }: { atual: "quadro" | "lista"; empresaId?: string }) {
  const qs = empresaId ? `?empresa=${empresaId}` : "";
  const aba = (href: string, ativo: boolean, icone: React.ReactNode, label: string) => (
    <Link
      href={`${href}${qs}`}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 font-medium",
        ativo ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground",
      )}
    >
      {icone}
      {label}
    </Link>
  );
  return (
    <div className="flex gap-1 border-b border-border">
      {aba("/ordens-servico", atual === "quadro", <Columns3 className="size-[18px]" strokeWidth={1.75} />, "Quadro")}
      {aba("/ordens-servico/lista", atual === "lista", <List className="size-[18px]" strokeWidth={1.75} />, "Lista")}
    </div>
  );
}
