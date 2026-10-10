# dist/ is architecture-independent: build it natively once instead of under QEMU per platform.
FROM --platform=$BUILDPLATFORM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Runtime: dist/ is self-contained (bundled server + frontends, migrations, content, media).
# It must be the working directory: Bun resolves bundled frontend chunks relative to it.
FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY --from=build /app/dist ./
RUN mkdir -p /data && chown -R bun:bun /data
USER bun
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["bun", "src/server/index.js"]
