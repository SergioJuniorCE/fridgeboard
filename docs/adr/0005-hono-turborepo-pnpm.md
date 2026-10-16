# Hono backend in a pnpm Turborepo

Next.js Route Handlers would couple domain logic to the PWA, and npm cannot isolate workspace dependencies. We run all domain APIs (household, lists, budgets, receipts, calendar) plus the Better Auth handler in a Hono service (`@yoggan/api`), sharing Drizzle models via `@yoggan/db`, orchestrated with Turbo and installed with pnpm. The web app stays a thin PWA shell proxying same-origin `/api/*` to Hono, rejecting a Next-only backend.
