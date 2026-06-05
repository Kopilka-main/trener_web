# --- build ---
FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/telemetry/package.json packages/telemetry/
COPY packages/theme/package.json packages/theme/
COPY apps/web-client/package.json apps/web-client/
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/telemetry packages/telemetry
COPY packages/theme packages/theme
COPY apps/web-client apps/web-client
RUN npm run build -w @trener/shared && npm run build -w @trener/telemetry && npm run build -w @trener/web-client

# --- runtime ---
FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/apps/web-client/dist /usr/share/nginx/html
COPY nginx/web-client.conf /etc/nginx/nginx.conf
EXPOSE 80
