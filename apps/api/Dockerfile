FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared libs (required by file:../../libs/core dependency)
COPY libs/core/package.json ./libs/core/package.json
COPY libs/core/src ./libs/core/src

# Install API dependencies (resolves file:../../libs/core)
COPY apps/api/package*.json ./apps/api/
WORKDIR /app/apps/api
RUN npm ci

# Copy API source and build (esbuild bundles @flow/core inline)
COPY apps/api/tsconfig.json ./tsconfig.json
COPY apps/api/src ./src
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

# Copy shared libs so npm can resolve the file: dependency
COPY libs/core/package.json ./libs/core/package.json
COPY libs/core/src ./libs/core/src

# Install only production dependencies
COPY apps/api/package*.json ./apps/api/
WORKDIR /app/apps/api
RUN npm ci --omit=dev

# Copy bundled output from build stage
COPY --from=builder /app/apps/api/dist ./dist

EXPOSE 3001
CMD ["npm", "start"]
