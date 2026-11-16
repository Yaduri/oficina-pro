import { cn } from "@/lib/utils";

/** Ícone do app (chave + raio) — mesmo desenho de src/app/icon.svg */
export function BrandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden className={cn("size-[30px] shrink-0", className)}>
      <rect width="512" height="512" rx="112" fill="#18181b" />
      <defs>
        <mask id="brand-chave">
          <rect width="512" height="512" fill="#fff" />
          <rect x="230" y="40" width="52" height="118" rx="6" fill="#000" />
          <circle cx="256" cy="402" r="13" fill="#000" />
        </mask>
      </defs>
      <g transform="rotate(-45 256 256)" mask="url(#brand-chave)" fill="#fafafa">
        <circle cx="256" cy="148" r="80" />
        <rect x="230" y="190" width="52" height="244" rx="26" />
      </g>
      <path
        d="M290 70 L150 290 H245 L215 445 L365 215 H268 Z"
        fill="#f59e0b"
        stroke="#18181b"
        strokeWidth="22"
        strokeLinejoin="round"
        paintOrder="stroke"
        transform="translate(256 256) scale(.9) translate(-257 -257)"
      />
    </svg>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-[15px] font-bold", className)}>
      <BrandIcon />
      Oficina<span className="-ml-1 font-medium text-muted">Pro</span>
    </span>
  );
}
