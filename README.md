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

## Household access

Only the first account can register without an invitation and initialize the
household as an Admin. Once that account exists, public account creation is
closed, including through Google sign-in. Existing members can still log in.

Admins create shareable invite links in Settings. New members open the link to
create an account and join; existing accounts log in and return to the same
invite. The link determines Adult or Minor membership and never grants Admin.
Expired or fully used links cannot create accounts or memberships.

Run `pnpm --filter @yoggan/api test:access` to test access rules and concurrent
registration against a temporary MariaDB database cloned from the local schema.
The test requires `TEST_DB_ROOT_PASSWORD` (or `DB_ROOT_PASSWORD`); with the local
Compose database it can read the configured password from `yoggan-home-db-1`.
It removes its temporary database after the run and leaves household data intact.

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
