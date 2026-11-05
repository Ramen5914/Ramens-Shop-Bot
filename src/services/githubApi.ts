import { readFileSync } from "node:fs";
import { App } from "octokit";

const appId = process.env.GITHUB_APP_ID;
const installationId = Number(process.env.GITHUB_INSTALLATION_ID);
const privateKey = getPrivateKey();

if (
  !appId ||
  !privateKey ||
  !Number.isSafeInteger(installationId) ||
  installationId <= 0
) {
  throw new Error(
    `Environment variables "GITHUB_APP_ID", "GITHUB_INSTALLATION_ID", and either "GITHUB_APP_PRIVATE_KEY" or "GITHUB_APP_PRIVATE_KEY_FILE" must be set`,
  );
}

const app = new App({
  appId,
  privateKey,
});

function getPrivateKey(): string | undefined {
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (privateKey && !privateKey.endsWith(".pem")) {
    return privateKey;
  }

  const privateKeyFile = process.env.GITHUB_APP_PRIVATE_KEY_FILE ?? privateKey;
  if (!privateKeyFile) {
    return undefined;
  }

  return readFileSync(privateKeyFile, "utf8");
}

export async function listInstallationRepos(
  removeUsername: boolean = false,
): Promise<string[]> {
  const { data: installations } =
    await app.octokit.rest.apps.listInstallations();

  const names: string[] = [];

  for (const installation of installations) {
    const octokit = await app.getInstallationOctokit(installation.id);
    const { data } = await octokit.request("GET /installation/repositories", {
      per_page: 100,
    });

    names.push(
      ...data.repositories.map((r) => {
        if (removeUsername) {
          return r.full_name.split("/")[1];
        } else {
          return r.full_name;
        }
      }),
    );
  }

  return names;
}

export async function getRepoDescription(
  repoName: string,
): Promise<string | null> {
  const octokit = await app.getInstallationOctokit(installationId);
  const { data } = await octokit.rest.repos.get({
    owner: "Ramen5914",
    repo: repoName,
  });

  return data.description;
}

export async function getGithubRepoReleaseDownloadCount(
  repoName: string,
): Promise<number> {
  const octokit = await app.getInstallationOctokit(installationId);
  let page = 1;
  let total = 0;

  while (true) {
    const { data: releases } = await octokit.rest.repos.listReleases({
      owner: "Ramen5914",
      repo: repoName,
      per_page: 100,
      page,
    });

    total += releases.reduce(
      (releaseTotal, release) =>
        releaseTotal +
        release.assets.reduce(
          (assetTotal, asset) => assetTotal + asset.download_count,
          0,
        ),
      0,
    );

    if (releases.length < 100) {
      return total;
    }

    page += 1;
  }
}

export async function getTotalProjectDownloadCount(options: {
  repoName: string;
  modrinthProjectIdOrSlug?: string | null;
  curseForgeProjectId?: number | null;
}): Promise<number> {
  const [
    { getCurseforgeProjectDownloadCount },
    { getModrinthProjectDownloadCount },
  ] = await Promise.all([
    import("./curseforgeApi.js"),
    import("./modrinthApi.js"),
  ]);

  const downloadCounts = await Promise.all([
    getGithubRepoReleaseDownloadCount(options.repoName),
    options.modrinthProjectIdOrSlug
      ? getModrinthProjectDownloadCount(options.modrinthProjectIdOrSlug)
      : 0,
    options.curseForgeProjectId
      ? getCurseforgeProjectDownloadCount(options.curseForgeProjectId)
      : 0,
  ]);

  return downloadCounts.reduce((total, count) => total + count, 0);
}
