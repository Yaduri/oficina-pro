// Service worker do Oficina Pro — mínimo e seguro.
// Só guarda a página /offline e os arquivos estáticos dela. Nada de HTML logado,
// API, ações do servidor (POST), arquivos, PDFs, links públicos ou Clerk.
// Ao mudar este arquivo, suba a VERSAO para limpar o cache antigo.
const VERSAO = "v2";
const CACHE = `oficina-offline-${VERSAO}`;
const OFFLINE = "/offline";

// Rotas que o SW nem toca (vão direto para a rede, como sem SW)
const IGNORAR = ["/api/", "/arquivos/", "/pdf/", "/documento/", "/orcamento/", "/acompanhamento/", "/pesquisa/", "/portal/", "/convite/", "/sign-in", "/sign-up", "/_next/data/", "/__clerk", "/sw.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const resp = await fetch(OFFLINE, { cache: "reload", credentials: "omit" });
      if (!resp.ok) throw new Error("offline indisponível");
      const html = await resp.clone().text();
      await cache.put(OFFLINE, resp);
      // CSS/JS/fontes que a página /offline usa (nomes com hash, imutáveis)
      const estaticos = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\<>]+/g) ?? [])];
      await Promise.all(
        estaticos.map((url) =>
          fetch(url, { credentials: "omit" })
            .then((r) => (r.ok ? cache.put(url, r) : undefined))
            .catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((n) => n.startsWith("oficina-") && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (IGNORAR.some((p) => url.pathname.startsWith(p))) return;

  // Páginas: sempre da rede; sem internet, mostra /offline (nunca guarda a resposta)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match(OFFLINE)) ?? Response.error()),
    );
    return;
  }

  // Estáticos da página offline: só se já estiverem no cache; o resto segue para a rede
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => (await cache.match(req)) ?? fetch(req)),
    );
  }
});
