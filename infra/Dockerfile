FROM node:24.21.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
FROM dependencies AS build
COPY . .
RUN npm run build
FROM node:24.21.0-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=optional && npm cache clean --force
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages ./packages
COPY --from=build /app/integrations/providers ./integrations/providers
COPY --from=build /app/infra/migrations ./infra/migrations
COPY --from=build /app/scripts ./scripts
USER node
EXPOSE 3001
CMD ["npm","run","start:api"]
FROM caddy:2.10.2-alpine AS web
COPY --from=build /app/apps/web/dist /srv
COPY infra/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
FROM api AS scanner
USER root
RUN apt-get update && apt-get install -y --no-install-recommends clamav qpdf imagemagick util-linux && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/apps/worker ./apps/worker
RUN mkdir -p /var/lib/clamav && chown node:node /var/lib/clamav
USER node
EXPOSE 3002
CMD ["npx","--no-install","tsx","apps/worker/src/scanner.ts"]
