import { cn, iniciais } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

/* ---------- Botão ---------- */
type ButtonVariant = "primary" | "secondary" | "ghost";
const buttonBase =
  "inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "bg-card border border-border text-foreground hover:bg-subtle",
  ghost: "text-foreground-2 hover:bg-subtle",
};
export function buttonClass(variant: ButtonVariant = "secondary", className?: string) {
  return cn(buttonBase, buttonVariants[variant], className);
}
export function Button({
  variant = "secondary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

/* ---------- Cartão ---------- */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("bg-card border border-border rounded-lg shadow-card", className)} {...props} />;
}
export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {action}
    </div>
  );
}

/* ---------- Status ---------- */
export type Tom = "neutro" | "info" | "ok" | "warn" | "danger";
const tomStyle: Record<Tom, string> = {
  neutro: "bg-card text-foreground-2 border-border",
  info: "bg-info-soft text-info border-blue-200",
  ok: "bg-ok-soft text-ok border-green-200",
  warn: "bg-warn-soft text-warn border-amber-200",
  danger: "bg-danger-soft text-danger border-red-200",
};
export function Badge({ tom = "neutro", children, className }: { tom?: Tom; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tomStyle[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------- Placa Mercosul ---------- */
export function Placa({ placa, className }: { placa: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex flex-col min-w-[76px] overflow-hidden rounded border border-border-strong bg-white",
        className,
      )}
      aria-label={`Placa ${placa}`}
    >
      <span className="bg-[#1e3a8a] text-white text-center text-[6px] leading-[9px] font-semibold tracking-[.12em]" aria-hidden>
        BRASIL
      </span>
      <span className="px-1.5 py-0.5 text-center text-[12.5px] leading-[18px] font-semibold tracking-[.06em] tabular-nums">
        {placa}
      </span>
    </span>
  );
}

/* ---------- Avatar ---------- */
const avatarCores = [
  "bg-indigo-100 text-indigo-800",
  "bg-amber-100 text-amber-800",
  "bg-green-100 text-green-800",
  "bg-sky-100 text-sky-800",
  "bg-rose-100 text-rose-800",
];
export function Avatar({ nome, size = "md" }: { nome: string; size?: "sm" | "md" }) {
  const cor = avatarCores[[...nome].reduce((a, c) => a + c.charCodeAt(0), 0) % avatarCores.length];
  return (
    <span
      className={cn(
        "inline-grid place-items-center rounded-full font-semibold shrink-0",
        size === "sm" ? "size-[26px] text-[11px]" : "size-8 text-xs",
        cor,
      )}
      aria-hidden
    >
      {iniciais(nome)}
    </span>
  );
}

/* ---------- Formulário ---------- */
export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-[13px] font-medium text-foreground-2", className)} {...props} />;
}
export const inputClass =
  "h-11 w-full rounded-md border border-border-strong bg-white px-3 text-[15px] text-foreground placeholder:text-zinc-400 focus:outline-none focus:border-primary focus:ring-3 focus:ring-zinc-900/10";
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

/* ---------- Cabeçalho de página ---------- */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

/* ---------- Campo de formulário ---------- */
export function Campo({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {hint && <span className="font-normal text-muted"> {hint}</span>}
      </Label>
      {children}
    </div>
  );
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(inputClass, "cursor-pointer", className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "h-auto min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}
export function Erro({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
      {children}
    </p>
  );
}

/* ---------- Estado vazio ---------- */
export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <p className="font-medium">{titulo}</p>
      {children && <div className="max-w-sm text-[13px] text-muted">{children}</div>}
    </div>
  );
}
