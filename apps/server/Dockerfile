# Збірка з кореня репозиторію: docker build -f apps/server/Dockerfile .
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter "@gen/server..."
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @gen/server build

FROM node:22-bookworm-slim
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
WORKDIR /app
# Лише нативний модуль SQLite і його залежності; решта коду вбудована в dist/main.js
COPY --from=build /src/node_modules/better-sqlite3 node_modules/better-sqlite3
COPY --from=build /src/node_modules/bindings node_modules/bindings
COPY --from=build /src/node_modules/file-uri-to-path node_modules/file-uri-to-path
COPY --from=build /src/apps/server/dist dist
RUN echo '{"type":"module"}' > package.json && mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/main.js"]
