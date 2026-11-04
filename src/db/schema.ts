import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  int,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

function hexColorRangeCheck(name: string, column: AnySQLiteColumn) {
  return check(
    name,
    sql`${column} IS NULL OR ${column} BETWEEN 0 AND 16777215`,
  );
}
export const configTable = sqliteTable("config_table", {
  key: text().primaryKey(),
  value: text(),
});

export const trackedStreamersTable = sqliteTable(
  "tracked_streamers_table",
  {
    id: int().primaryKey({ autoIncrement: true }),
    displayName: text().notNull().unique(),
    roleId: text({ length: 32 }),
    message: text().notNull(),
    color: int().notNull().default(0x9146ff),
  },
  (table) => [hexColorRangeCheck("tracked_streamers_color_range", table.color)],
);

export const voiceChatGeneratorsTable = sqliteTable(
  "voice_chat_generators_table",
  {
    channelId: text().primaryKey(),
    categoryId: text().notNull(),
    name: text().notNull().default("Joice to Create Voice Chat"),
    size: int().notNull().default(-1),
  },
);

export const minecraftModsTable = sqliteTable(
  "minecraft_mods_table",
  {
    id: int().primaryKey({ autoIncrement: true }),
    homepageUrlType: text({
      enum: ["github", "curseforge", "modrinth", "other"],
    }),
    gitRepo: text().notNull().unique(),
    modrinthSlug: text().unique(),
    curseForgeSlug: text().unique(),
    modrinthProjectId: text().unique(),
    curseForgeProjectId: int().unique(),
    otherUrl: text(),
    wikiUrl: text(),
    issuesUrl: text(),
    projectBoardUrl: text(),
    mavenUrl: text(),
    color: int(),
    infoChannel: text().notNull().unique(),
    announcementsChannel: text().notNull().unique(),
    updatesRole: text().notNull().unique(),
    githubUpdatesChannel: text().notNull().unique(),
    collaboratorChannel: text().notNull().unique(),
    collaboratorRole: text().notNull().unique(),
    chatChannel: text().notNull().unique(),
    suggestionsChannel: text().notNull().unique(),
    supportChannel: text().notNull().unique(),
    infoMessageId: text().unique(),
  },
  (table) => [
    check(
      "git_repo_name_valid",
      sql`length(${table.gitRepo}) > 0 AND ${table.gitRepo} NOT GLOB '*[^a-zA-Z0-9_.-]*'`,
    ),
    hexColorRangeCheck("minecraft_mods_color_range", table.color),
  ],
);
