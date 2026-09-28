# ==============================================================================
# BhoomiDarpan Production Container (Bun + Alpine)
# ==============================================================================
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install system dependencies (curl for health probes, ca-certificates for HTTPS)
RUN apk add --no-cache curl ca-certificates

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# Copy source files
COPY . .

# Build frontend (SQLite village engine auto-provisions at server cold-start)
RUN bun run build

# Expose production port
ENV PORT=3001
ENV NODE_ENV=production
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Start the unified API server and static frontend
CMD ["bun", "run", "server/index.ts"]
