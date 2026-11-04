# Charada Cubana mini-app.
#
# Multi-stage: dependencies are installed once with the lockfile, then only
# production files are copied into a slim runtime. The container runs as a
# non-root user and never bakes secrets: everything comes from the environment
# at run time.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` needs the lockfile; --omit=dev keeps the image small.
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# tini reaps zombies and forwards SIGTERM so the server can close its pool.
RUN apk add --no-cache tini

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY migrations ./migrations

# Run unprivileged. The app owns nothing on disk; uploads and results live in
# Postgres, so no writable volume is needed.
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "scripts/dev.js"]
