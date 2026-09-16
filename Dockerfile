# syntax=docker/dockerfile:1.7
# Pin patch versions; release CI should additionally pin reviewed registry digests.
FROM node:24.14.0-bookworm-slim AS toolchain
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1 \
    EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1 WRANGLER_SEND_METRICS=false
RUN npm install --global pnpm@10.32.1 \
    && mkdir -p /workspace /pnpm/store /out && chown -R node:node /workspace /pnpm /out
WORKDIR /workspace
USER node

FROM toolchain AS dependencies
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/api/package.json apps/api/package.json
COPY --chown=node:node apps/app/package.json apps/app/package.json
COPY --chown=node:node apps/books/package.json apps/books/package.json
COPY --chown=node:node apps/wiki/package.json apps/wiki/package.json
COPY --chown=node:node apps/site/package.json apps/site/package.json
RUN --mount=type=cache,id=x-sia-pnpm,target=/pnpm/store,uid=1000,gid=1000 \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

FROM dependencies AS development
# .dockerignore excludes credentials, host dependencies and generated state.
COPY --chown=node:node . .
RUN mkdir -p apps/api/.wrangler
CMD ["pnpm", "dev:gateway"]

FROM development AS quality
RUN pnpm quality

FROM development AS web-build
# Public constants only. Empty API origin means browser same-origin, never Docker DNS.
ENV EXPO_PUBLIC_API_URL="" EXPO_PUBLIC_WIKI_URL=/wiki/
RUN pnpm build:web

FROM development AS wiki-build
RUN --mount=type=cache,id=x-sia-pnpm,target=/pnpm/store,uid=1000,gid=1000 \
    pnpm --filter wiki build \
    && pnpm --store-dir /pnpm/store --offline --filter wiki deploy --prod /out/wiki

FROM development AS site-build
RUN --mount=type=cache,id=x-sia-pnpm,target=/pnpm/store,uid=1000,gid=1000 \
    pnpm --filter site build \
    && pnpm --store-dir /pnpm/store --offline --filter site deploy --prod /out/site

FROM development AS books-build
RUN pnpm books:test && pnpm books:build

FROM development AS worker-build
# Only bundles locally; no account, remote migration, login, or upload.
RUN pnpm deploy:dry-run

FROM scratch AS artifacts
COPY --from=web-build /workspace/apps/app/dist /web
COPY --from=books-build /workspace/apps/books/dist /books
COPY --from=worker-build /workspace/.artifacts/worker /worker

FROM node:24.14.0-bookworm-slim AS ssr-runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD node -e "fetch('http://127.0.0.1:3000'+(process.env.HEALTH_PATH||'/')).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "node_modules/@react-router/serve/bin.cjs", "build/server/index.js"]

FROM ssr-runtime AS wiki
ENV HEALTH_PATH=/wiki/learn/math/linear
COPY --from=wiki-build --chown=node:node /out/wiki/node_modules ./node_modules
COPY --from=wiki-build --chown=node:node /out/wiki/package.json ./package.json
COPY --from=wiki-build --chown=node:node /workspace/apps/wiki/build ./build

FROM ssr-runtime AS site
COPY --from=site-build --chown=node:node /out/site/node_modules ./node_modules
COPY --from=site-build --chown=node:node /out/site/package.json ./package.json
COPY --from=site-build --chown=node:node /workspace/apps/site/build ./build

FROM caddy:2.10.2-alpine AS portal
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=web-build /workspace/apps/app/dist /srv
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
