# Remote (Streamable HTTP) image for Cloud Run. Local harnesses keep using `npx ge-app-mcp` over stdio.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Distroless runtime: no shell or package manager, runs as an unprivileged user.
FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    PORT=8080
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
USER nonroot
EXPOSE 8080
CMD ["build/index.js"]
