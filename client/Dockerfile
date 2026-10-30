# ==============================================================================
# TaskFlow Frontend — Production Multi-Stage Container Image
# ==============================================================================

# Stage 1: Build Frontend Assets
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependency definitions and install
COPY package*.json ./
RUN npm ci

# Copy client source code
COPY . ./

# Build optimized production bundle
RUN npm run build

# Stage 2: Production Nginx Server
FROM nginx:1.27-alpine AS runner

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built distribution from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
