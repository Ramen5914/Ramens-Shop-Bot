import { existsSync, renameSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";

export type TwitchNotification = {
  twitchLogin: string;
  message: string;
  roleId: string | null;
};

const defaultDatabasePath = resolve("data/bot.db");
const databasePath = resolve(process.env.SQLITE_PATH ?? defaultDatabasePath);
const legacyDatabasePath = resolve("data/notifications.db");

if (
  databasePath === defaultDatabasePath &&
  databasePath !== legacyDatabasePath &&
  !existsSync(databasePath) &&
  existsSync(legacyDatabasePath)
) {
  renameSync(legacyDatabasePath, databasePath);
}

const database = createClient({
  url: `file:${databasePath}`,
});

let initialized: Promise<void> | undefined;

async function initialize(): Promise<void> {
  await mkdir(dirname(databasePath), { recursive: true });

  await database.execute(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const columns = await database.execute(
    "PRAGMA table_info(twitch_notifications)",
  );
  const hasLegacyChannel = columns.rows.some(
    (row) => row.name === "discord_channel_id",
  );
  const hasMessage = columns.rows.some((row) => row.name === "message");

  if (hasLegacyChannel && !hasMessage) {
    await database.batch([
      {
        sql: "ALTER TABLE twitch_notifications RENAME TO twitch_notifications_old",
      },
      {
        sql: `CREATE TABLE twitch_notifications (
					twitch_login TEXT PRIMARY KEY,
					message TEXT NOT NULL,
					role_id TEXT
				)`,
      },
      {
        sql: `INSERT OR IGNORE INTO twitch_notifications
					(twitch_login, message)
					SELECT twitch_login, '' FROM twitch_notifications_old`,
      },
      {
        sql: `INSERT OR IGNORE INTO config (key, value)
					SELECT 'twitch.notification_channel_id', discord_channel_id
					FROM twitch_notifications_old
					LIMIT 1`,
      },
      { sql: "DROP TABLE twitch_notifications_old" },
    ]);
  } else {
    await database.execute(`
      CREATE TABLE IF NOT EXISTS twitch_notifications (
        twitch_login TEXT PRIMARY KEY,
        message TEXT NOT NULL,
        role_id TEXT
      )
    `);

    const legacySettings = await database.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'twitch_settings'",
    );
    if (legacySettings.rows.length > 0) {
      await database.execute(`
        INSERT OR IGNORE INTO config (key, value)
        SELECT 'twitch.notification_channel_id', value
        FROM twitch_settings
        WHERE name = 'notification_channel_id'
      `);
      await database.execute("DROP TABLE twitch_settings");
    }

    await database.execute({
      sql: `INSERT OR IGNORE INTO twitch_notifications
				(twitch_login, message)
				VALUES (?, ?)`,
      args: ["ramen5914", ""],
    });
  }

  const updatedColumns = await database.execute(
    "PRAGMA table_info(twitch_notifications)",
  );
  if (!updatedColumns.rows.some((row) => row.name === "role_id")) {
    await database.execute(
      "ALTER TABLE twitch_notifications ADD COLUMN role_id TEXT",
    );
  }
}

async function ready(): Promise<void> {
  initialized ??= initialize();
  await initialized;
}

export async function listTwitchNotifications(): Promise<TwitchNotification[]> {
  await ready();
  const result = await database.execute(
    "SELECT twitch_login, message, role_id FROM twitch_notifications",
  );

  return result.rows.map((row) => ({
    twitchLogin: String(row.twitch_login),
    message: String(row.message),
    roleId: row.role_id ? String(row.role_id) : null,
  }));
}

export async function addTwitchNotification(
  notification: TwitchNotification,
): Promise<boolean> {
  await ready();
  const result = await database.execute({
    sql: `INSERT OR IGNORE INTO twitch_notifications
			(twitch_login, message, role_id)
			VALUES (?, ?, ?)`,
    args: [notification.twitchLogin, notification.message, notification.roleId],
  });

  return result.rowsAffected > 0;
}

export async function updateTwitchNotification(
  login: string,
  message: string,
  roleId: string | null,
): Promise<boolean> {
  await ready();
  const result = await database.execute({
    sql: "UPDATE twitch_notifications SET message = ?, role_id = ? WHERE twitch_login = ?",
    args: [message, roleId, login],
  });

  return result.rowsAffected > 0;
}

export async function removeTwitchNotification(
  login: string,
): Promise<boolean> {
  await ready();
  const result = await database.execute({
    sql: "DELETE FROM twitch_notifications WHERE twitch_login = ?",
    args: [login],
  });

  return result.rowsAffected > 0;
}

export async function getConfigValue(key: string): Promise<string | undefined> {
  await ready();
  const result = await database.execute({
    sql: "SELECT value FROM config WHERE key = ?",
    args: [key],
  });

  const value = result.rows[0]?.value;
  return value ? String(value) : undefined;
}

export async function setConfigValue(
  key: string,
  value: string,
): Promise<void> {
  await ready();
  await database.execute({
    sql: `INSERT INTO config (key, value)
			VALUES (?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [key, value],
  });
}
