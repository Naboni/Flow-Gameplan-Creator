FROM node:20-alpine AS builder

WORKDIR /app

# Install API dependencies (including dev dependencies for TypeScript build)
COPY apps/api/package*.json ./apps/api/
WORKDIR /app/apps/api
RUN npm ci

# Build API
COPY apps/api/tsconfig.json ./tsconfig.json
COPY apps/api/src ./src
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app/apps/api
ENV NODE_ENV=production

# Install only production dependencies
COPY apps/api/package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from build stage
COPY --from=builder /app/apps/api/dist ./dist

EXPOSE 3001
CMD ["npm", "start"]
