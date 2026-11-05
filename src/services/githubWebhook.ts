import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type {
  EmitterWebhookEvent,
  WebhookEventName,
} from "@octokit/webhooks/types";
import { ChannelType, EmbedBuilder } from "discord.js";
import { eq } from "drizzle-orm";
import { minecraftModsTable } from "../db/schema.js";
import { logger } from "../logger.js";
import { bot, db } from "../main.js";

const port = Number(process.env.GITHUB_WEBHOOK_PORT ?? 8787);
const secret = getWebhookSecret();

export function startGithubWebhookServer() {
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/webhooks/github") {
      response.writeHead(404).end();
      return;
    }

    const event = request.headers["x-github-event"] as
      | WebhookEventName
      | undefined;
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

      let data: unknown;

      try {
        data = JSON.parse(body.toString("utf8"));
      } catch {
        logger.warn("GitHub webhook rejected: invalid JSON payload");
        response.writeHead(400).end("Invalid payload");
        return;
      }

      response.writeHead(200).end("OK");

      switch (event) {
        case "push":
          handlePushWebhook(data as EmitterWebhookEvent<"push">["payload"]);
          return;
        case "star":
          handleStarWebhook(data as EmitterWebhookEvent<"star">["payload"]);
          return;
        case "release":
          handleReleaseWebhook(
            data as EmitterWebhookEvent<"release">["payload"],
          );
      }
    });
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info(`GitHub webhook server listening on port ${port}`);
  });
}

async function handlePushWebhook(data: EmitterWebhookEvent<"push">["payload"]) {
  const mod = await getModFromGitRepoName(data.repository.name);

  if (!mod) return;

  // Ignore tag and pull-request refs; only handle branches.
  if (!data.ref?.startsWith("refs/heads/")) return;

  const branch = data.ref.replace(/^refs\/heads\//, "");

  const embed = new EmbedBuilder().setColor(0x7289da);

  if (data.deleted) {
    embed
      .setColor(0xeb6420)
      .setTitle(`[${data.repository.full_name}] Deleted branch: ${branch}`)
      .setURL(data.repository.html_url);
  } else if (data.created) {
    embed
      .setColor(0x009800)
      .setTitle(`[${data.repository.full_name}] New branch created: ${branch}`)
      .setURL(`${data.repository.html_url}/tree/${encodeURIComponent(branch)}`);
  } else if (data.forced) {
    embed
      .setColor(0xfc2929)
      .setTitle(
        `[${data.repository.name}] Branch ${branch} was force-pushed to ${data.after.slice(0, 7)}`,
      )
      .setURL(
        `${data.repository.html_url}/compare/${data.before.slice(0, 12)}...${data.after.slice(0, 12)}`,
      )
      .setDescription(
        `[Compare changes](${data.repository.html_url}/compare/${data.before.slice(0, 12)}...${data.after.slice(0, 12)})`,
      );
  } else {
    const commits = data.commits ?? [];

    if (commits.length === 0) return;

    let description = "";

    for (const commit of commits) {
      let message = commit.message.split("\n")[0];

      if (message.length > 50) {
        message = `${message.slice(0, 47)}...`;
      }

      description += `[\`${commit.id.slice(0, 7)}\`](${commit.url}) ${message} - ${commit.author.username}\n`;
    }

    embed
      .setTitle(
        `[${data.repository.name}:${branch}] ${commits.length} new ${
          commits.length === 1 ? "commit" : "commits"
        }`,
      )
      .setURL(
        `${data.repository.html_url}/compare/${data.before.slice(0, 12)}...${data.after.slice(0, 12)}`,
      )
      .setDescription(description);
  }

  embed.setAuthor({
    name: data.sender?.login ?? "Unknown user",
    iconURL: data.sender?.avatar_url,
  });

  const channel = await bot.channels.fetch(mod.githubUpdatesChannel);

  if (
    !channel ||
    (channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement)
  ) {
    throw new Error(
      `Invalid Minecraft mod github channel: ${mod.githubUpdatesChannel}`,
    );
  }

  await channel.send({
    embeds: [embed],
  });
}

async function handleStarWebhook(data: EmitterWebhookEvent<"star">["payload"]) {
  if (data.action === "deleted") return;

  const mod = await getModFromGitRepoName(data.repository.name);

  if (!mod) {
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xe3b341)
    .setAuthor({
      name: `${data.sender.login}`,
      iconURL: `${data.sender.avatar_url}`,
    })
    .setTitle(`[${data.repository.full_name}] New star added`)
    .setURL(data.repository.html_url);

  const channel = await bot.channels.fetch(mod.githubUpdatesChannel);

  if (
    !channel ||
    (channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement)
  ) {
    throw new Error(
      `Invalid Minecraft mod github channel: ${mod.githubUpdatesChannel}`,
    );
  }

  channel.send({
    embeds: [embed],
  });
}

async function handleReleaseWebhook(
  data: EmitterWebhookEvent<"release">["payload"],
) {
  if (data.action !== "published") return;

  const mod = await getModFromGitRepoName(data.repository.name);

  if (!mod) {
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(data.release.prerelease ? 0xd29922 : 0x3fb950)
    .setAuthor({
      name: `${data.release.author?.login}`,
      iconURL: `${data.release.author?.avatar_url}`,
    })
    .setTitle(
      `[${data.repository.full_name}] New ${
        data.release.prerelease ? "pre-release" : "release"
      } published: ${data.release.tag_name}`,
    )
    .setURL(`${data.release.html_url}`);

  const channel = await bot.channels.fetch(mod.githubUpdatesChannel);

  if (
    !channel ||
    (channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement)
  ) {
    throw new Error(
      `Invalid Minecraft mod github channel: ${mod.githubUpdatesChannel}`,
    );
  }

  channel.send({
    embeds: [embed],
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

async function getModFromGitRepoName(name: string) {
  return await db
    .select({
      id: minecraftModsTable.id,
      gitRepo: minecraftModsTable.gitRepo,
      githubUpdatesChannel: minecraftModsTable.githubUpdatesChannel,
    })
    .from(minecraftModsTable)
    .where(eq(minecraftModsTable.gitRepo, name))
    .get();
}
