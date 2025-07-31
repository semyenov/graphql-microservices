# Users Service Dockerfile

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

# Copy users service source code
COPY services/users/ ./services/users/

# Generate Prisma client
WORKDIR /app/services/users
RUN bunx prisma generate

# Build the service using the new build system
RUN bun run /app/packages/builder/dist/index.js

# Runtime stage
FROM oven/bun:1.2-alpine AS runtime
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    openssl \
    ca-certificates \
    tini \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/services/users/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/services/users/package.json ./

# Copy Prisma files
COPY --from=builder --chown=nodejs:nodejs /app/services/users/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/services/users/generated/prisma ./generated/prisma

# Copy only production dependencies
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Users service specific environment
ENV NODE_ENV=production \
    PORT=4001 \
    SERVICE_NAME=users

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:4001/health || exit 1

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4001

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the service
CMD ["bun", "run", "dist/index.js"]