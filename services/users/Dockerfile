# Multi-stage Dockerfile for Users Service

# Stage 1: Dependencies
FROM oven/bun:1.2 AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./
COPY services/users/package.json ./services/users/
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

# Generate Prisma client
WORKDIR /app/services/users
RUN bunx prisma generate

# Build the service
RUN bun build ./src/index.ts --target=bun --outdir=./dist --minify

# Stage 3: Runtime
FROM oven/bun:1.2-alpine AS runtime
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    openssl \
    ca-certificates \
    tini

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/services/users/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/services/users/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy package.json for scripts
COPY --chown=nodejs:nodejs services/users/package.json ./

# Set environment
ENV NODE_ENV=production
ENV PORT=4001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD bun healthcheck.js || exit 1

# Create health check script
RUN echo 'fetch("http://localhost:4001/health").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))' > healthcheck.js

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4001

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the service
CMD ["bun", "run", "dist/index.js"]
