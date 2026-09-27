# ==============================================================================
# BhoomiSetu Production Container (Bun + Node Tools)
# ==============================================================================
FROM oven/bun:1.1-debian AS base
WORKDIR /app

# Install system dependencies (tar/curl for 7z extraction and health probes)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tar \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# Copy source files
COPY . .

# Build frontend and pre-build village storage engine
RUN bun run build
RUN bun run geography:build-engine

# Expose production port
ENV PORT=3001
ENV NODE_ENV=production
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Start the unified API server and static frontend
CMD ["bun", "run", "server/index.ts"]
