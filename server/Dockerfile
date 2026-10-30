# ==============================================================================
# TaskFlow Backend — Production Multi-Stage Container Image
# ==============================================================================

# Stage 1: Dependency Installation
FROM node:20-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Stage 2: Production Runtime
FROM node:20-alpine AS runner
WORKDIR /app

# Install dumb-init for proper PID 1 signal forwarding to Node processes
RUN apk add --no-cache dumb-init wget

ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0

# Copy node_modules from dependencies stage
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src/ ./src/

# Run as non-privileged user for container security
USER node

EXPOSE 5000

# Container healthcheck using liveness probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/api/health/live || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/server.js"]
