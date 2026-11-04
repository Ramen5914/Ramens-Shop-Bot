import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { logger } from "../logger.js";

const port = Number(process.env.GITHUB_WEBHOOK_PORT ?? 8787);
const secret = getWebhookSecret();

export function startGithubWebhookServer() {
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/webhooks/github") {
      response.writeHead(404).end();
      return;
    }

    const event = request.headers["x-github-event"];
    logger.info(
      {
        event: event ?? "unknown",
        delivery: request.headers["x-github-delivery"] ?? "unknown",
      },
      "GitHub webhook request received",
    );

    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      const signature = request.headers["x-hub-signature-256"];

      if (!isValidSignature(body, signature, secret)) {
        logger.warn("GitHub webhook rejected: invalid signature");
        response.writeHead(401).end("Invalid signature");
        return;
      }

      response.writeHead(200).end("OK");

      if (event === "push") {
        logger.info("GitHub push webhook received");
      }
    });
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info(`GitHub webhook server listening on port ${port}`);
  });
}

function isValidSignature(
  body: Buffer,
  signature: string | string[] | undefined,
  secret: string,
) {
  if (typeof signature !== "string") {
    return false;
  }

  const expectedSignature = `sha256=${createHmac("sha256", secret)
    .update(body)
    .digest("hex")}`;

  if (signature.length !== expectedSignature.length) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );
}

function getWebhookSecret(): string {
  const value = process.env.GITHUB_WEBHOOK_SECRET;

  if (!value) {
    throw new Error("Could not find GITHUB_WEBHOOK_SECRET in your environment");
  }

  return value;
}
