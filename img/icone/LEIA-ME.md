# Ícone Oficina Pro (chave + raio)

| Arquivo | Uso |
| --- | --- |
| `icon.svg` | Ícone principal em vetor (cantos arredondados). Favicon moderno e logo. |
| `icon-square.svg` | Mesmo desenho sem cantos arredondados. |
| `icon-maskable.svg` | Versão com margem de segurança para Android (PWA). |
| `favicon.ico` | Favicon clássico com 16, 32 e 48 px dentro. |
| `favicon-16x16.png`, `favicon-32x32.png` | Favicons em PNG. |
| `apple-touch-icon.png` | 180×180, atalho na tela inicial do iPhone/iPad. |
| `android-chrome-192x192.png`, `android-chrome-512x512.png` | Ícones do PWA. |
| `maskable-192x192.png`, `maskable-512x512.png` | Ícones do PWA para Android (recorte redondo/quadrado). |
| `icon-16.png` … `icon-512.png` | PNGs avulsos em vários tamanhos. |
| `site.webmanifest` | Manifesto do PWA já apontando para os ícones. |

## No Next.js (App Router)

Copie para `src/app/` (o Next gera as tags sozinho):

- `favicon.ico` → `src/app/favicon.ico` (substitui o atual)
- `icon.svg` → `src/app/icon.svg`
- `apple-touch-icon.png` → `src/app/apple-icon.png`

Copie para `public/`:

- `android-chrome-192x192.png`, `android-chrome-512x512.png`, `maskable-192x192.png`, `maskable-512x512.png`
- `site.webmanifest` → `src/app/manifest.webmanifest` (o Next adiciona o `<link rel="manifest">`)

## Em HTML puro

Coloque todos os arquivos na raiz do site e adicione no `<head>`:

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#18181b">
```

Cores: fundo `#18181b`, chave `#fafafa`, raio `#f59e0b`.
