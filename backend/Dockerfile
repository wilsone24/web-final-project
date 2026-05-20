# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests first (leverages Docker layer caching)
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for TypeScript compilation)
RUN npm ci

# Copy source and config files
COPY tsconfig.json ./
COPY *.ts ./

# Compile TypeScript to JavaScript
RUN npm run build

# ---- Production stage ----
FROM node:22-alpine AS production

# Security: run as non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Switch to non-root user
USER appuser

# Expose the backend port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8000/health || exit 1

# Start the server
CMD ["node", "dist/server.js"]
