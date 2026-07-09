# syntax=docker/dockerfile:1
# All-in-one production image: API, web, worker, confirmation/lead/booking agents.

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true

RUN apt-get update -qq \
  && apt-get install --no-install-recommends -y ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10.0.0

FROM base AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/agent/package.json apps/agent/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/livekit/package.json packages/livekit/
COPY packages/worker/package.json packages/worker/

RUN pnpm install --frozen-lockfile

COPY apps/agent apps/agent
COPY apps/api apps/api
COPY apps/web apps/web
COPY packages/livekit packages/livekit
COPY packages/worker packages/worker
COPY scripts scripts

# Optional LiveKit model assets (no-op if no plugins need download)
WORKDIR /app/apps/agent
RUN pnpm exec livekit-agents download-files || true

WORKDIR /app
ENV VITE_API_URL=/api
ENV VITE_USE_MOCKS=false
RUN pnpm --filter @voice-repo/web build

FROM base

ARG UID=10001
RUN adduser \
  --disabled-password \
  --gecos "" \
  --home "/app" \
  --shell "/sbin/nologin" \
  --uid "${UID}" \
  appuser

WORKDIR /app
COPY --from=build --chown=appuser:appuser /app /app

USER appuser

ENV NODE_ENV=production
ENV VITE_API_URL=/api
ENV VITE_USE_MOCKS=false
# Default for single-service deploys; multi-service overrides via SERVICE_ROLE.
ENV SERVICE_ROLE=web

CMD ["pnpm", "start:railway"]
