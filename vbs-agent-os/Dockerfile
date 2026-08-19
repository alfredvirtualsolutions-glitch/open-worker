FROM node:20-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prime Control Gate UI (ADR-002) — built separately, copied into the
# runtime image as static files. Same container, no new service.
FROM node:20-slim AS web-build
WORKDIR /web
COPY web/package.json ./
RUN npm install
COPY web ./
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY src/db/schema.sql ./dist/db/schema.sql
COPY --from=web-build /web/dist ./web-dist
EXPOSE 8787
USER node
CMD ["node", "dist/index.js"]
