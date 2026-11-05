import { eq, sql } from "drizzle-orm";
import {
  configTable,
  trackedStreamersTable,
  voiceChatGeneratorsTable,
} from "../db/schema.js";
import { db } from "../main.js";

export async function setConfigValue(
  key: string,
  value: string,
): Promise<typeof configTable.$inferSelect | null> {
  return (
    (await db
      .insert(configTable)
      .values({ key, value })
      .onConflictDoUpdate({
        target: configTable.key,
        set: { value },
      })
      .returning()
      .get()) ?? null
  );
}

export async function getConfigValue(key: string): Promise<string | null> {
  const configSet = await db
    .select()
    .from(configTable)
    .where(eq(configTable.key, key))
    .get();

  if (!configSet) {
    return null;
  } else {
    return configSet.value;
  }
}

export async function listTrackedStreamers(): Promise<
  (typeof trackedStreamersTable.$inferSelect)[]
> {
  return db.select().from(trackedStreamersTable).all();
}

export async function addTrackedStreamer(
  trackedStreamer: typeof trackedStreamersTable.$inferInsert,
): Promise<typeof trackedStreamersTable.$inferSelect | null> {
  return (
    (await db
      .insert(trackedStreamersTable)
      .values(trackedStreamer)
      .onConflictDoNothing()
      .returning()
      .get()) ?? null
  );
}

export async function updateTrackedStreamer(
  login: string,
  message: string,
  roleId: string | null,
): Promise<typeof trackedStreamersTable.$inferSelect | null> {
  return (
    (await db
      .update(trackedStreamersTable)
      .set({ message, roleId })
      .where(
        sql`lower(${trackedStreamersTable.displayName}) = ${login.trim().toLowerCase()}`,
      )
      .returning()
      .get()) ?? null
  );
}

export async function removeTrackedStreamer(login: string): Promise<boolean> {
  const removed = await db
    .delete(trackedStreamersTable)
    .where(
      sql`lower(${trackedStreamersTable.displayName}) = ${login.trim().toLowerCase()}`,
    )
    .returning({ id: trackedStreamersTable.id })
    .get();

  return removed !== undefined;
}

export type VoiceChatGenerator = typeof voiceChatGeneratorsTable.$inferSelect;

export async function listVoiceChatGenerators(): Promise<VoiceChatGenerator[]> {
  return db.select().from(voiceChatGeneratorsTable).all();
}

export async function addVoiceChatGenerator(
  generator: typeof voiceChatGeneratorsTable.$inferInsert,
): Promise<boolean> {
  const added = await db
    .insert(voiceChatGeneratorsTable)
    .values(generator)
    .onConflictDoNothing()
    .returning({ channelId: voiceChatGeneratorsTable.channelId })
    .get();

  return added !== undefined;
}

export async function removeVoiceChatGenerator(
  channelId: string,
): Promise<boolean> {
  const removed = await db
    .delete(voiceChatGeneratorsTable)
    .where(eq(voiceChatGeneratorsTable.channelId, channelId))
    .returning({ channelId: voiceChatGeneratorsTable.channelId })
    .get();

  return removed !== undefined;
}
