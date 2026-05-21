FROM oven/bun:1
WORKDIR /app
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install
COPY . .
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
