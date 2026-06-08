# --- build ---
FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @trener/shared && npm run build -w @trener/api

# --- runtime ---
FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/drizzle apps/api/drizzle
# Данные сидов (catalog-300.json и т.п.) — нужны seed-скриптам в рантайме.
COPY --from=build /repo/apps/api/src/data apps/api/dist/data
EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]
