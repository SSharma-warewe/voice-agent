# syntax=docker/dockerfile:1

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update -qq \
  && apt-get install --no-install-recommends -y ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10

FROM base AS build

ENV CI=true

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/agent/package.json apps/agent/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/livekit/package.json packages/livekit/
COPY packages/worker/package.json packages/worker/

RUN pnpm install --frozen-lockfile --filter @voice-repo/agent...

COPY apps/agent apps/agent

WORKDIR /app/apps/agent
RUN pnpm exec livekit-agents download-files
RUN pnpm build

WORKDIR /app
RUN pnpm --filter @voice-repo/agent deploy --prod --legacy /app/deployed

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

COPY --from=build --chown=appuser:appuser /app/deployed /app

USER appuser

ENV NODE_ENV=production

CMD ["node", "dist/main.js", "start"]