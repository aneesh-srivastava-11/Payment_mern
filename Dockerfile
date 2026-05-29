# Build stage
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for prisma generate)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Production stage
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

COPY package*.json ./
# Only install production dependencies
RUN npm ci --only=production

# Copy node_modules from builder (contains generated prisma client)
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /usr/src/app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /usr/src/app/prisma ./prisma

# Copy source code
COPY src ./src

# Expose microservice port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Healthcheck to verify status
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
