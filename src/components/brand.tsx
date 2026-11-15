import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-[15px] font-bold", className)}>
      <span className="grid size-[30px] place-items-center rounded-lg bg-primary text-white">
        <Wrench className="size-[17px]" strokeWidth={1.75} />
      </span>
      Oficina<span className="-ml-1 font-medium text-muted">Pro</span>
    </span>
  );
}
