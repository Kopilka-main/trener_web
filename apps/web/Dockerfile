# --- build ---
FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/telemetry/package.json packages/telemetry/
COPY packages/theme/package.json packages/theme/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/telemetry packages/telemetry
COPY packages/theme packages/theme
COPY apps/web apps/web
RUN npm run build -w @trener/shared && npm run build -w @trener/telemetry && npm run build -w @trener/web

# --- runtime ---
FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
