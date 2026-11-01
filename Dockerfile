## build runner
FROM oven/bun:1 as build-runner

# Set temp directory
WORKDIR /tmp/app

# Move package.json
COPY package.json .
COPY bun.lock .

# Install dependencies
RUN bun install --frozen-lockfile

# Move source files
COPY src ./src
COPY tsconfig.json   .

# Build project
RUN bun run build

## development runner
FROM oven/bun:1 as dev-runner

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY tsconfig.json .

CMD [ "bun", "run", "dev" ]

## production runner
FROM oven/bun:1-slim as prod-runner

# Set work directory
WORKDIR /app

# Copy package.json from build-runner
COPY --from=build-runner /tmp/app/package.json /app/package.json
COPY --from=build-runner /tmp/app/bun.lock /app/bun.lock

# Install dependencies
RUN bun install --frozen-lockfile --production

# Move build files
COPY --from=build-runner /tmp/app/build /app/build

# Start bot
CMD [ "bun", "run", "start" ]
