"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Filtro de técnico que troca a URL ao escolher */
export function FiltroTecnico({ tecnicos, atual }: { tecnicos: { id: string; nome: string }[]; atual?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  if (tecnicos.length === 0) return null;
  return (
    <select
      aria-label="Filtrar por técnico"
      value={atual ?? ""}
      onChange={(e) => {
        const q = new URLSearchParams(sp.toString());
        if (e.target.value) q.set("tecnico", e.target.value);
        else q.delete("tecnico");
        router.push(`/agenda?${q.toString()}`);
      }}
      className={cn(inputClass, "h-9 w-auto cursor-pointer text-[13px]")}
    >
      <option value="">Todos os técnicos</option>
      {tecnicos.map((t) => (
        <option key={t.id} value={t.id}>
          {t.nome}
        </option>
      ))}
    </select>
  );
}
