# Wavio — one container, one volume. Build:  docker build -t wavio .   Run: see docker-compose.yml
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# a throw-away value so the build can run; the real APP_SECRET is read when the container starts
RUN APP_SECRET=build-time-placeholder-not-used-at-runtime npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_PATH=/data/app.db BACKUP_DIR=/data/backups MEDIA_DIR=/data/media
COPY --from=build /app .
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["npm", "start"]
