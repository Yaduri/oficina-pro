import { Construction } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";

/** Página provisória para módulos ainda não desenvolvidos. */
export function EmBreve({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <>
      <PageHeader title={titulo} />
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-subtle text-foreground-2">
          <Construction className="size-5" strokeWidth={1.75} />
        </span>
        <h2 className="text-[15px] font-semibold">Em desenvolvimento</h2>
        <p className="max-w-md text-muted">{descricao}</p>
      </Card>
    </>
  );
}
