# Drizzle + MariaDB for household data

We need multi-user concurrent writes from phones/tablet with Better Auth session storage self-hosted alongside the app. We use Drizzle ORM with `provider: mysql` on MariaDB (`utf8mb4`, UTC, `timezone: Z`), rejecting Postgres (heavier for home server) and SQLite (concurrency limits).
