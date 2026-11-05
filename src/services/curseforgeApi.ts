import { CurseforgeV1Client } from "@xmcl/curseforge";

const curseforgeToken = process.env.CURSEFORGE_TOKEN;

if (!curseforgeToken) {
  throw new Error("Missing CurseForge API token");
}

const curseforgeApi = new CurseforgeV1Client(curseforgeToken);

export async function getCurseforgeProjectIconUrl(
  projectId: number,
): Promise<string | null> {
  const project = await getCurseforgeProject(projectId);

  return project.logo?.url ?? null;
}

async function getCurseforgeProject(projectId: number) {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error("A valid CurseForge project ID is required");
  }

  return curseforgeApi.getMod(projectId);
}

export async function getCurseforgeProjectDownloadCount(
  projectId: number,
): Promise<number> {
  const project = await getCurseforgeProject(projectId);

  return project.downloadCount;
}
