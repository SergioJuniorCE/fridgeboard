FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.6.0 --activate

FROM base AS builder
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/db/package.json ./packages/db/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @yoggan/api... build
RUN pnpm --filter @yoggan/api --prod deploy /app/deploy

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3001
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/deploy ./
RUN mkdir -p /app/uploads && chown app:app /app/uploads
USER app
EXPOSE 3001
CMD ["node", "dist/index.js"]
