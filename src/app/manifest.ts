import type { MetadataRoute } from "next";

// Manifesto do app instalável (servido em /manifest.webmanifest)
export default function manifest(): MetadataRoute.Manifest {
  const atalho = [{ src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" }];
  return {
    id: "/",
    name: "Oficina Pro",
    short_name: "Oficina Pro",
    description: "Gestão da oficina: check-in, orçamentos, ordens de serviço e agenda.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    display_override: ["standalone"],
    orientation: "any",
    background_color: "#fafafa",
    theme_color: "#ffffff",
    categories: ["business", "productivity"],
    icons: [
      { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/maskable-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Novo check-in", short_name: "Check-in", url: "/check-in/novo", icons: atalho },
      { name: "Nova OS", short_name: "Nova OS", url: "/ordens-servico/nova", icons: atalho },
      { name: "Agenda", url: "/agenda", icons: atalho },
    ],
  };
}
