import {
  type AuthConfig,
  AuthFeature,
  GenericModrinthClient,
} from "@modrinth/api-client";

const modrinthPat = process.env.MODRINTH_PAT;

if (!modrinthPat) {
  throw new Error("Missing Modrinth API token");
}

const authConfig: AuthConfig = {
  token: modrinthPat,
};

const modrinthApi = new GenericModrinthClient({
  userAgent: "Ramens-Shop-Bot",
  features: [new AuthFeature(authConfig)],
});

async function getModrinthProject(projectIdOrSlug: string) {
  const project = projectIdOrSlug.trim();

  if (!project) {
    throw new Error("A Modrinth project ID or slug is required");
  }

  return modrinthApi.labrinth.projects_v2.get(project);
}

export async function getModrinthProjectIconUrl(
  projectIdOrSlug: string,
): Promise<string | null> {
  const project = await getModrinthProject(projectIdOrSlug);

  return project.icon_url ?? null;
}

export async function getModrinthProjectColor(
  projectIdOrSlug: string,
): Promise<number | null> {
  const project = await getModrinthProject(projectIdOrSlug);

  return project.color ?? null;
}

export async function getModrinthProjectDownloadCount(
  projectIdOrSlug: string,
): Promise<number> {
  const project = await getModrinthProject(projectIdOrSlug);

  return project.downloads;
}
