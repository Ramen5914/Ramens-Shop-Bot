import { EmbedBuilder } from "discord.js";
import type { minecraftModsTable } from "@/db/schema.js";
import { logger } from "@/logger.js";
import {
  getCurseforgeProjectDownloadCount,
  getCurseforgeProjectIconUrl,
} from "@/services/curseforgeApi.js";
import {
  getGithubRepoReleaseDownloadCount,
  getRepoDescription,
} from "@/services/githubApi.js";
import {
  getModrinthProjectColor,
  getModrinthProjectDownloadCount,
  getModrinthProjectIconUrl,
} from "@/services/modrinthApi.js";

export async function buildModInfoMessage(
  mod: typeof minecraftModsTable.$inferSelect,
): Promise<EmbedBuilder> {
  const modrinthProject = mod.modrinthProjectId ?? mod.modrinthSlug;
  const color =
    mod.color ??
    (modrinthProject ? await getModrinthProjectColor(modrinthProject) : null);
  let imageUrl: string | null = null;
  try {
    imageUrl = mod.modrinthProjectId
      ? await getModrinthProjectIconUrl(mod.modrinthProjectId)
      : mod.modrinthSlug
        ? await getModrinthProjectIconUrl(mod.modrinthSlug)
        : mod.curseForgeProjectId
          ? await getCurseforgeProjectIconUrl(mod.curseForgeProjectId)
          : null;
  } catch (error) {
    logger.warn({ error, mod: mod.gitRepo }, "Failed to fetch mod icon");
  }

  const [githubResult, modrinthResult, curseforgeResult] =
    await Promise.allSettled([
      getGithubRepoReleaseDownloadCount(mod.gitRepo),
      modrinthProject ? getModrinthProjectDownloadCount(modrinthProject) : 0,
      mod.curseForgeProjectId
        ? getCurseforgeProjectDownloadCount(mod.curseForgeProjectId)
        : 0,
    ]);

  if (curseforgeResult.status === "rejected") {
    logger.warn(
      { error: curseforgeResult.reason, mod: mod.gitRepo },
      "Failed to fetch CurseForge download count",
    );
  }

  const githubDownloads =
    githubResult.status === "fulfilled" ? githubResult.value : 0;
  const modrinthDownloads =
    modrinthResult.status === "fulfilled" ? modrinthResult.value : 0;
  const curseforgeDownloads =
    curseforgeResult.status === "fulfilled" ? curseforgeResult.value : 0;

  const githubUrl = `https://github.com/Ramen5914/${mod.gitRepo}`;
  const curseforgeUrl = mod.curseForgeSlug
    ? `https://www.curseforge.com/minecraft/mc-mods/${mod.curseForgeSlug}`
    : null;
  const modrinthUrl = mod.modrinthProjectId
    ? `https://modrinth.com/project/${mod.modrinthProjectId}`
    : mod.modrinthSlug
      ? `https://modrinth.com/mod/${mod.modrinthSlug}`
      : null;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(mod.gitRepo.replace("-", " "))
    .setURL(
      (() => {
        switch (mod.homepageUrlType) {
          case "github":
            return `https://github.com/Ramen5914/${mod.gitRepo}`;
          case "modrinth":
            if (mod.modrinthProjectId) {
              return `https://modrinth.com/project/${mod.modrinthProjectId}`;
            } else if (mod.modrinthSlug) {
              return `https://modrinth.com/mod/${mod.modrinthSlug}`;
            } else {
              return null;
            }
          case "curseforge":
            if (mod.curseForgeSlug) {
              return `https://www.curseforge.com/minecraft/mc-mods/${mod.curseForgeSlug}`;
            } else {
              return null;
            }
          case "other":
            return mod.otherUrl ?? null;
          default:
            return null;
        }
      })(),
    )
    .setDescription(
      (await getRepoDescription(mod.gitRepo)) ?? "No description available",
    )
    .setThumbnail(imageUrl)
    .setTimestamp();

  const totalDownloads =
    githubDownloads + modrinthDownloads + curseforgeDownloads;

  embed.addFields(
    {
      name: "Downloads",
      value: totalDownloads.toLocaleString(),
      inline: false,
    },
    {
      name: "CurseForge",
      value: curseforgeUrl
        ? `[${curseforgeDownloads.toLocaleString()} Downloads](${curseforgeUrl})`
        : curseforgeDownloads.toLocaleString(),
      inline: true,
    },
    {
      name: "Modrinth",
      value: modrinthUrl
        ? `[${modrinthDownloads.toLocaleString()} Downloads](${modrinthUrl})`
        : modrinthDownloads.toLocaleString(),
      inline: true,
    },
    {
      name: "GitHub",
      value: `[${githubDownloads.toLocaleString()} Downloads](${githubUrl}/releases)`,
      inline: true,
    },
  );

  const links = [
    mod.wikiUrl ? `[Wiki](${mod.wikiUrl})` : null,
    mod.issuesUrl ? `[Issues](${mod.issuesUrl})` : null,
    mod.projectBoardUrl ? `[Project Board](${mod.projectBoardUrl})` : null,
    mod.mavenUrl ? `[Maven](${mod.mavenUrl})` : null,
    `[Source](${githubUrl})`,
  ].filter((link): link is string => link !== null);

  embed.addFields({
    name: "Links",
    value: links.join(" • "),
    inline: false,
  });

  return embed;
}
