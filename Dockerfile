FROM node:24-alpine AS base
RUN npm install -g pnpm@12.21.0
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/protocol/package.json packages/protocol/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base
ENV HOST=0.0.0.0 PORT=3001 WEB_DIST=/app/apps/web/dist
COPY --from=build /app /app
USER node
EXPOSE 3001
CMD ["pnpm", "start"]
