import pino from "pino";

export const logger = pino({
  name: "Ramen's Shop Bot",
  level: process.env.LOG_LEVEL ?? "debug",
  ...(process.env.NODE_ENV !== "production"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});
