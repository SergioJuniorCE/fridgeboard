# Serwist disabled in development

The Serwist service worker precaches production output; when that precache (or
a stale `apps/web/.next` from `pnpm build`) leaks into `next dev`, the tab
serves production React/CSS against a development server — unstyled pages and
RSC version-mismatch errors. We pass `disable={NODE_ENV === 'development'}` to
`SerwistProvider` so dev never registers, and never run `next build` and
`next dev` from the same directory without deleting `apps/web/.next` between.
Production PWA behavior is unaffected.
