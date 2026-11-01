import { ApiClient } from "@twurple/api";
import { RefreshingAuthProvider } from "@twurple/auth";
import { EventSubWsListener } from "@twurple/eventsub-ws";
import { ChannelType } from "discord.js";
import type { Client } from "discordx";
import { buildTwitchLiveMessage } from "../utils/twitchMessage.js";
import {
	removeTwitchNotification as deleteTwitchNotification,
	getNotificationChannel,
	listTwitchNotifications,
	setNotificationChannel as saveNotificationChannel,
	addTwitchNotification as saveTwitchNotification,
	updateTwitchNotification as saveUpdatedTwitchNotification,
	type TwitchNotification,
} from "./notificationStore.js";

let started = false;
let api: ApiClient;
let listener: EventSubWsListener;
let notificationClient: Client;
const messages = new Map<string, string>();
const subscribedLogins = new Set<string>();
const subscriptions = new Map<
	string,
	ReturnType<EventSubWsListener["onStreamOnline"]>
>();

export async function addTwitchNotification(
	notification: TwitchNotification,
): Promise<boolean> {
	const login = notification.twitchLogin.trim().toLowerCase();
	const saved = await saveTwitchNotification({
		twitchLogin: login,
		message: notification.message,
	});

	if (!saved) return false;

	messages.set(login, notification.message);

	if (started) {
		await registerSubscription(login, notification.message);
	}

	return true;
}

export async function setNotificationChannel(channelId: string): Promise<void> {
	await saveNotificationChannel(channelId);
}

export async function updateTwitchNotification(
	login: string,
	message: string,
): Promise<boolean> {
	const normalizedLogin = login.trim().toLowerCase();
	const updated = await saveUpdatedTwitchNotification(normalizedLogin, message);

	if (updated) {
		messages.set(normalizedLogin, message);
	}

	return updated;
}

export async function removeTwitchNotification(
	login: string,
): Promise<boolean> {
	const normalizedLogin = login.trim().toLowerCase();
	const removed = await deleteTwitchNotification(normalizedLogin);

	if (!removed) return false;

	messages.delete(normalizedLogin);
	subscribedLogins.delete(normalizedLogin);
	subscriptions.get(normalizedLogin)?.stop();
	subscriptions.delete(normalizedLogin);
	return true;
}

export async function getConfiguredNotificationChannel(): Promise<
	string | undefined
> {
	return getNotificationChannel();
}

export async function startTwitchNotifications(client: Client): Promise<void> {
	if (started) return;

	const clientId = process.env.TWITCH_CLIENT_ID;
	const clientSecret = process.env.TWITCH_CLIENT_SECRET;
	const accessToken = process.env.TWITCH_ACCESS_TOKEN;
	const refreshToken = process.env.TWITCH_REFRESH_TOKEN;

	if (!clientId || !clientSecret) {
		throw new Error("Missing Twitch client ID or client secret");
	}

	if (!accessToken || !refreshToken) {
		throw new Error(
			"Missing Twitch user access token or refresh token for EventSub",
		);
	}

	const twitchAccessToken = accessToken;
	const twitchRefreshToken = refreshToken;
	const authProvider = new RefreshingAuthProvider({
		clientId,
		clientSecret,
	});

	authProvider.onRefresh((userId, token) => {
		console.log(`Refreshed Twitch access token for user ${userId}.`);
		console.log(
			"Update TWITCH_ACCESS_TOKEN and TWITCH_REFRESH_TOKEN with the new token values.",
		);
		console.log(
			`Twitch access token expires in ${token.expiresIn ?? "unknown"} seconds.`,
		);
	});

	authProvider.onRefreshFailure((userId, error) => {
		console.error(
			`Could not refresh Twitch access token for user ${userId}:`,
			error,
		);
	});

	api = new ApiClient({ authProvider });
	listener = new EventSubWsListener({ apiClient: api });
	notificationClient = client;

	listener.onUserSocketDisconnect((userId, error) => {
		if (error) {
			console.error(`Twitch EventSub disconnected for user ${userId}:`, error);
		} else {
			console.warn(`Twitch EventSub disconnected for user ${userId}.`);
		}
	});

	for (const notification of await listTwitchNotifications()) {
		const login = notification.twitchLogin.trim().toLowerCase();
		messages.set(login, notification.message);
	}

	async function registerSubscriptions(): Promise<void> {
		const userId = await authProvider.addUserForToken({
			accessToken: twitchAccessToken,
			refreshToken: twitchRefreshToken,
			expiresIn: 0,
			obtainmentTimestamp: 0,
			scope: [],
		});

		for (const [login, message] of messages) {
			await registerSubscription(login, message);
		}

		console.log(`Twitch EventSub is authenticated as user ${userId}.`);
		listener.start();
	}

	try {
		await registerSubscriptions();
		started = true;
	} catch (error) {
		console.error("Could not start Twitch EventSub notifications:", error);
	}
}

async function registerSubscription(
	login: string,
	message: string,
): Promise<void> {
	if (subscribedLogins.has(login)) return;

	const user = await api.users.getUserByName(login);

	if (!user) {
		console.error(
			`Could not find Twitch user ${login}; skipping subscription.`,
		);
		return;
	}

	const subscription = listener.onStreamOnline(user.id, (event) => {
		void sendNotification(login, event.broadcasterDisplayName, message, event);
	});
	subscribedLogins.add(login);
	subscriptions.set(login, subscription);
	console.log(`Watching Twitch stream.online events for ${login}.`);
}

async function sendNotification(
	login: string,
	displayName: string,
	message: string,
	event: Parameters<Parameters<typeof listener.onStreamOnline>[1]>[0],
): Promise<void> {
	let channelInfo: Awaited<ReturnType<typeof api.channels.getChannelInfoById>> =
		null;
	let stream: Awaited<ReturnType<typeof event.getStream>> = null;

	try {
		[channelInfo, stream] = await Promise.all([
			api.channels.getChannelInfoById(event.broadcasterId),
			event.getStream(),
		]);
	} catch (error) {
		console.error(`Could not load Twitch channel details for ${login}:`, error);
	}

	const channelId = await getNotificationChannel();
	if (!channelId) {
		console.error("No global Twitch notification channel is configured.");
		return;
	}

	try {
		const channel = await notificationClient.channels.fetch(channelId);

		if (
			!channel ||
			(channel.type !== ChannelType.GuildText &&
				channel.type !== ChannelType.GuildAnnouncement)
		) {
			console.error(`Invalid notifications channel: ${channelId}`);
			return;
		}

		const thumbnailUrl = stream
			? new URL(stream.getThumbnailUrl(1280, 720))
			: undefined;
		thumbnailUrl?.searchParams.set("v", Date.now().toString());

		await channel.send(
			buildTwitchLiveMessage({
				login,
				displayName,
				message,
				title: stream?.title ?? channelInfo?.title ?? "Watch live on Twitch",
				gameName: stream?.gameName ?? channelInfo?.gameName,
				imageUrl: thumbnailUrl?.toString(),
			}),
		);
	} catch (error) {
		console.error(`Could not notify channel ${channelId} for ${login}:`, error);
	}
}
