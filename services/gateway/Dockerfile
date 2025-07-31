# Multi-stage Dockerfile for Gateway Service

# Stage 1: Dependencies
FROM oven/bun:1.2 AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY services/gateway/package.json ./services/gateway/
COPY shared/ ./shared/
COPY client/package.json ./client/

# Install dependencies
RUN bun install

# Stage 2: Build
FROM oven/bun:1.2 AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build the gateway
WORKDIR /app/services/gateway
RUN bun build ./src/index.ts --target=bun --outdir=./dist --minify

# Stage 3: Runtime
FROM oven/bun:1.2-alpine AS runtime
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    tini

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built application and dependencies
COPY --from=builder --chown=nodejs:nodejs /app/services/gateway/dist ./dist
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy package.json for scripts
COPY --chown=nodejs:nodejs services/gateway/package.json ./

# Set environment
ENV NODE_ENV=production
ENV PORT=4000

# Health check with longer start period for gateway
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD bun healthcheck.js || exit 1

# Create health check script
RUN echo 'fetch("http://localhost:4000/health").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))' > healthcheck.js

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4000

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the gateway
CMD ["bun", "run", "dist/index.js"]
