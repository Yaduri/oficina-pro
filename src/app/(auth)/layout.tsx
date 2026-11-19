import Link from "next/link";
import { Brand } from "@/components/brand";

// Login e cadastro: cartão centralizado (design B)
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col px-6 py-8 sm:px-14 sm:py-10">
      <Brand />
      <main className="m-auto w-full max-w-[440px] py-10 flex justify-center">{children}</main>
      <footer className="flex justify-between text-xs text-muted">
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
