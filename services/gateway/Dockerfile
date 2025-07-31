# Gateway Service Dockerfile

# Dependencies stage
FROM oven/bun:1.2 AS deps
WORKDIR /app

# Copy workspace package files
COPY package.json bun.lock ./
COPY packages/*/package.json ./packages/
COPY shared/*/package.json ./shared/
COPY services/*/package.json ./services/
COPY client/package.json ./client/

# Install all dependencies
RUN bun install

# Build packages stage
FROM deps AS package-builder
WORKDIR /app

# Copy package source code
COPY packages/ ./packages/
COPY shared/ ./shared/
COPY tsconfig.json ./
COPY biome.json ./
COPY codegen.yml ./

# Install tsdown as dev dependency for building
RUN bun add -D tsdown

# Build all packages
RUN bun run build:packages

# Build stage
FROM package-builder AS builder
WORKDIR /app

# Copy gateway source code
COPY services/gateway/ ./services/gateway/

# Build the gateway service using the new build system
WORKDIR /app/services/gateway
RUN bun run /app/packages/builder/dist/index.js

# Runtime stage
FROM oven/bun:1.2-alpine AS runtime
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    tini \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/services/gateway/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/services/gateway/package.json ./

# Copy only production dependencies
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Gateway specific environment
ENV NODE_ENV=production \
    PORT=4000 \
    SERVICE_NAME=gateway

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4000

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the gateway
CMD ["bun", "run", "dist/index.js"]