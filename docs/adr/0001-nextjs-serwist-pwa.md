# Next.js + Serwist for PWA over TanStack Start

TanStack Start production builds skip SW generation via vite-plugin-pwa/Serwist (upstream Vite 6 Environment API issue), requiring SPA-mode workarounds, while Next.js App Router has a stable Serwist path (Turbopack route-handler + provider). We use Next.js + `@serwist/turbopack` for installable offline shell, rejecting `next-pwa` (abandoned) and TanStack Start for v1.
