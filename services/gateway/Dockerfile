FROM oven/bun:1.2.15-alpine

WORKDIR /app

# Copy workspace files
COPY package.json bun.lockb ./
COPY services/gateway/package.json ./services/gateway/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY services/gateway/src ./services/gateway/src
WORKDIR /app/services/gateway
EXPOSE 4000

CMD ["bun", "run", "start"]
