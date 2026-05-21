# Stage 1: build
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install
COPY . .
RUN bun run build

# Stage 2: serve with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY error_413.html /usr/share/nginx/html/error_413.html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
