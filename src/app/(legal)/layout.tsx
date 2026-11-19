import Link from "next/link";
import { Brand } from "@/components/brand";

// Termos de uso e Política de privacidade: páginas públicas, sem login
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col px-6 py-8 sm:px-14 sm:py-10">
      <Link href="/" className="self-start" aria-label="Oficina Pro, página inicial">
        <Brand />
      </Link>
      <main className="mx-auto w-full max-w-[720px] py-10">{children}</main>
      <footer className="mt-auto flex justify-between text-xs text-muted">
        <span>© 2026 Oficina Pro</span>
        <span className="flex gap-3">
          <Link href="/termos" className="hover:text-foreground">
            Termos
          </Link>
          <Link href="/privacidade" className="hover:text-foreground">
            Privacidade
          </Link>
        </span>
      </footer>
    </div>
  );
}
