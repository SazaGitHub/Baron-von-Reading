FROM oven/bun:1
WORKDIR /app
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN bun install
COPY . .
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
