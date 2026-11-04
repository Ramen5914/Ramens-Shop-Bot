import { readFileSync } from "node:fs";
import { App } from "octokit";

const appId = process.env.GITHUB_APP_ID;
const privateKey = getPrivateKey();

if (!appId || !privateKey) {
  throw new Error(
    `Environment variables "GITHUB_APP_ID" and either "GITHUB_APP_PRIVATE_KEY" or "GITHUB_APP_PRIVATE_KEY_FILE" must be set`,
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
