FROM docker.io/oven/bun:1.4@sha256:c017a211c49a21adc0e49dda7b60ac8112887c3d9465e01427f434ed107c830e AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun --bun run build

FROM docker.io/oven/bun:1.4@sha256:c017a211c49a21adc0e49dda7b60ac8112887c3d9465e01427f434ed107c830e AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM docker.io/oven/bun:1.4-slim@sha256:686427843343e931d31dcca0c95221040dec48a8b5a7374c7ae9fd7959f8234d AS runtime
RUN export DEBIAN_FRONTEND=noninteractive \
    && apt-get update && apt-get install -y --no-install-recommends git \
    && dpkg --compare-versions "$(git --version | cut -d ' ' -f 3)" ge 2.40 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ARG SW_VERSION=dev
ARG SW_COMMIT=unknown
ARG SW_SOURCE=semantic-workbench
ARG SW_CREATED=unknown
LABEL org.opencontainers.image.version=$SW_VERSION \
      org.opencontainers.image.revision=$SW_COMMIT \
      org.opencontainers.image.source=$SW_SOURCE \
      org.opencontainers.image.created=$SW_CREATED
ENV SW_VERSION=$SW_VERSION SW_COMMIT=$SW_COMMIT
ENV DATA_DIR=/data SW_CACHE_DIR=/tmp/sw-cache SW_SERVE_STATIC=1 SW_IN_CONTAINER=1 SW_PORT=4310
COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
COPY --from=build /app/policies ./policies
COPY --from=build /app/schemas ./schemas
COPY --from=build /app/public/examples ./public/examples
COPY --from=build /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
RUN mkdir /data && chown bun:bun /data
USER bun
VOLUME /data
EXPOSE 4310
HEALTHCHECK --interval=10s --timeout=5s CMD bun -e 'const r = await fetch(`http://127.0.0.1:${process.env.SW_PORT}/healthz`); process.exit(r.ok ? 0 : 1)'
ENTRYPOINT ["bun", "server/index.ts"]
