import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ptBR } from "@clerk/localizations";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { RegistrarSW } from "@/components/pwa";
import "./globals.css";

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Oficina Pro", template: "%s · Oficina Pro" },
  description: "Gestão para oficinas",
  applicationName: "Oficina Pro",
  // iPhone/iPad: abre em tela cheia quando adicionado à Tela de Início (ícone: app/apple-icon.png)
  appleWebApp: { capable: true, title: "Oficina Pro", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Mesma cor do topo (bg-card) para a barra de status do app instalado
  themeColor: "#ffffff",
  // Ocupa a tela toda; as margens seguras (entalhe, barra de gestos) ficam no topo e no <main>
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${plex.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <ClerkProvider localization={ptBR} appearance={clerkAppearance}>
          {children}
          <RegistrarSW />
        </ClerkProvider>
      </body>
    </html>
  );
}
