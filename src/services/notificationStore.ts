import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";

export type TwitchNotification = {
	twitchLogin: string;
	message: string;
};

const databasePath = resolve(
	process.env.SQLITE_PATH ?? "data/notifications.db",
);
const database = createClient({
	url: `file:${databasePath}`,
});

let initialized: Promise<void> | undefined;

async function initialize(): Promise<void> {
	await mkdir(dirname(databasePath), { recursive: true });

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
					message TEXT NOT NULL
				)`,
			},
			{
				sql: `INSERT OR IGNORE INTO twitch_notifications
					(twitch_login, message)
					SELECT twitch_login, '' FROM twitch_notifications_old`,
			},
			{
				sql: `CREATE TABLE IF NOT EXISTS twitch_settings (
					name TEXT PRIMARY KEY,
					value TEXT NOT NULL
				)`,
			},
			{
				sql: `INSERT OR IGNORE INTO twitch_settings (name, value)
					SELECT 'notification_channel_id', discord_channel_id
					FROM twitch_notifications_old
					LIMIT 1`,
			},
			{ sql: "DROP TABLE twitch_notifications_old" },
		]);
	} else {
		await database.batch([
			{
				sql: `CREATE TABLE IF NOT EXISTS twitch_notifications (
					twitch_login TEXT PRIMARY KEY,
					message TEXT NOT NULL
				)`,
			},
			{
				sql: `CREATE TABLE IF NOT EXISTS twitch_settings (
					name TEXT PRIMARY KEY,
					value TEXT NOT NULL
				)`,
			},
			{
				sql: `INSERT OR IGNORE INTO twitch_notifications
					(twitch_login, message)
					VALUES (?, ?)`,
				args: ["ramen5914", ""],
			},
		]);
	}
}

async function ready(): Promise<void> {
	initialized ??= initialize();
	await initialized;
}

export async function listTwitchNotifications(): Promise<TwitchNotification[]> {
	await ready();
	const result = await database.execute(
		"SELECT twitch_login, message FROM twitch_notifications",
	);

	return result.rows.map((row) => ({
		twitchLogin: String(row.twitch_login),
		message: String(row.message),
	}));
}

export async function addTwitchNotification(
	notification: TwitchNotification,
): Promise<boolean> {
	await ready();
	const result = await database.execute({
		sql: `INSERT OR IGNORE INTO twitch_notifications
			(twitch_login, message)
			VALUES (?, ?)`,
		args: [notification.twitchLogin, notification.message],
	});

	return result.rowsAffected > 0;
}

export async function updateTwitchNotification(
	login: string,
	message: string,
): Promise<boolean> {
	await ready();
	const result = await database.execute({
		sql: "UPDATE twitch_notifications SET message = ? WHERE twitch_login = ?",
		args: [message, login],
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

export async function getNotificationChannel(): Promise<string | undefined> {
	await ready();
	const result = await database.execute({
		sql: "SELECT value FROM twitch_settings WHERE name = ?",
		args: ["notification_channel_id"],
	});

	const value = result.rows[0]?.value;
	return value ? String(value) : undefined;
}

export async function setNotificationChannel(channelId: string): Promise<void> {
	await ready();
	await database.execute({
		sql: `INSERT INTO twitch_settings (name, value)
			VALUES (?, ?)
			ON CONFLICT(name) DO UPDATE SET value = excluded.value`,
		args: ["notification_channel_id", channelId],
	});
}
