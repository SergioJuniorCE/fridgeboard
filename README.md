# Yoggan Home — family life manager (PWA, self-hosted)

Shared calendars (Google), budgets + price history, shopping lists with spend
limits, receipt scanning. One household: Adults, Minors, Admins.

## Stack

- `apps/web` — Next.js PWA (`@yoggan/web`), Astryx Neutral theme, Serwist
- `apps/api` — Hono API (`@yoggan/api`), Better Auth, Google Calendar, DeepSeek
- `packages/db` — Drizzle + MariaDB (`@yoggan/db`)
- pnpm workspaces + Turborepo. Decisions in `docs/adr/`, language in `CONTEXT.md`.

## Run locally

Requires Node 22.13+, pnpm 12, Docker.

```bash
pnpm install
cp .env.example .env   # set BETTER_AUTH_SECRET (32+ chars)
docker compose up -d db
pnpm --filter @yoggan/db db:migrate
pnpm dev               # web :3000, api :3001
```

Migrations live in `packages/db/drizzle/` (generate: `pnpm --filter @yoggan/db db:generate`).

## Self-host

```bash
docker compose up -d --build   # web + api + db, Cloudflare Tunnel, no open ports
```

Set in `.env`: `BETTER_AUTH_URL`, `TRUSTED_ORIGINS`, `CLOUDFLARE_TUNNEL_TOKEN`,
`GOOGLE_CLIENT_ID/SECRET` + `FAMILY_CALENDAR_ID` (share the calendar with each
Adult), `DEEPSEEK_API_KEY` (optional, per-receipt opt-in AI). Nightly
`mariadb-dump` + `uploads/` backups, 7-day retention — restore-test them.

## Conventions

- UI: Astryx workflow (`astryx build` → `template` → blocks), deep subpath
  imports (`@astryxdesign/core/theme`, never the barrel — breaks RSC builds),
  tokens over raw hex/px, theme for palettes. Run every CLI command as
  `pnpm dlx @astryxdesign/cli <cmd>`.
- API: Hono routes in `apps/api/src/routes/`, session via
  `getEffectiveMember(c)` (supports `X-Active-Profile` + `X-Profile-Unlock`
  for the shared-tablet switcher), `{error}` JSON + status codes.
- Never `pnpm build` the web app while `next dev` runs from the same
  directory — stale `apps/web/.next` output breaks dev chunk serving.
  Serwist is disabled in development for the same reason.
