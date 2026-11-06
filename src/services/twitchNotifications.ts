import { ApiClient } from "@twurple/api";
import { RefreshingAuthProvider } from "@twurple/auth";
import { EventSubWsListener } from "@twurple/eventsub-ws";
import { ChannelType } from "discord.js";
import type { Client } from "discordx";
import type { trackedStreamersTable } from "@/db/schema.js";
import { logger } from "@/logger.js";
import { ConfigStrings } from "@/utils/constants.js";
import { buildTwitchLiveMessage } from "@/utils/twitchMessage.js";
import {
  addTrackedStreamer,
  getConfigValue,
  listTrackedStreamers,
  removeTrackedStreamer,
  setConfigValue,
  updateTrackedStreamer,
} from "./database.js";

let started = false;
let api: ApiClient;
let listener: EventSubWsListener;
let notificationClient: Client;
const notifications = new Map<
  string,
  { displayName: string; message: string; roleId: string | null }
>();
const subscribedLogins = new Set<string>();
const subscriptions = new Map<
  string,
  ReturnType<EventSubWsListener["onStreamOnline"]>
>();

export async function addTwitchNotification(
  trackedStreamer: typeof trackedStreamersTable.$inferInsert,
): Promise<boolean> {
  const login = trackedStreamer.displayName.trim().toLowerCase();

  const saved = await addTrackedStreamer(trackedStreamer);
  if (!saved) return false;

  notifications.set(login, {
    displayName: saved.displayName,
    message: trackedStreamer.message,
    roleId: trackedStreamer.roleId ?? null,
  });

  if (started) {
    await registerSubscription(login, trackedStreamer);
  }

  return true;
}

export async function setNotificationChannel(channelId: string): Promise<void> {
  await setConfigValue(ConfigStrings.Twitch.NotificationChannelId, channelId);
}

export async function updateTwitchNotification(
  login: string,
  message: string,
  roleId: string | null,
): Promise<boolean> {
  const normalizedLogin = login.trim().toLowerCase();
  const updated = await updateTrackedStreamer(normalizedLogin, message, roleId);

  if (updated) {
    notifications.set(normalizedLogin, {
      displayName: updated.displayName,
      message,
      roleId,
    });
  }

  return updated !== null;
}

export async function removeTwitchNotification(
  login: string,
): Promise<boolean> {
  const normalizedLogin = login.trim().toLowerCase();
  const removed = await removeTrackedStreamer(normalizedLogin);

  if (!removed) return false;

  notifications.delete(normalizedLogin);
  subscribedLogins.delete(normalizedLogin);
  subscriptions.get(normalizedLogin)?.stop();
  subscriptions.delete(normalizedLogin);
  return true;
}

export async function getConfiguredNotificationChannel(): Promise<
  string | undefined
> {
  return (
    (await getConfigValue(ConfigStrings.Twitch.NotificationChannelId)) ??
    undefined
  );
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
    logger.info(`Refreshed Twitch access token for user ${userId}.`);
    logger.info(
      "Update TWITCH_ACCESS_TOKEN and TWITCH_REFRESH_TOKEN with the new token values.",
    );
    logger.info(
      `Twitch access token expires in ${token.expiresIn ?? "unknown"} seconds.`,
    );
  });

  authProvider.onRefreshFailure((userId, error) => {
    logger.error(
      { error, command: "twitch service" },
      `Could not refresh Twitch access token for user ${userId}`,
    );
  });

  api = new ApiClient({ authProvider });
  listener = new EventSubWsListener({ apiClient: api });
  notificationClient = client;

  listener.onUserSocketDisconnect((userId, error) => {
    if (error) {
      logger.error(
        { error, command: "twitch service" },
        `Twitch EventSub disconnected for user ${userId}`,
      );
    } else {
      logger.warn(`Twitch EventSub disconnected for user ${userId}.`);
    }
  });

  for (const notification of await listTrackedStreamers()) {
    const login = notification.displayName.trim().toLowerCase();
    notifications.set(login, {
      displayName: notification.displayName,
      message: notification.message,
      roleId: notification.roleId,
    });
  }

  async function registerSubscriptions(): Promise<void> {
    const userId = await authProvider.addUserForToken({
      accessToken: twitchAccessToken,
      refreshToken: twitchRefreshToken,
      expiresIn: 0,
      obtainmentTimestamp: 0,
      scope: [],
    });

    for (const [login, notification] of notifications) {
      await registerSubscription(login, notification);
    }

    logger.info(`Twitch EventSub is authenticated as user ${userId}.`);
    listener.start();
  }

  try {
    await registerSubscriptions();
    started = true;
  } catch (error) {
    logger.error(
      { error, command: "twitch service" },
      "Could not start Twitch EventSub notifications",
    );
  }
}

async function registerSubscription(
  login: string,
  notification: typeof trackedStreamersTable.$inferInsert,
): Promise<void> {
  if (subscribedLogins.has(login)) return;

  const user = await api.users.getUserByName(login);

  if (!user) {
    logger.error(`Could not find Twitch user ${login}; skipping subscription.`);
    return;
  }

  const subscription = listener.onStreamOnline(user.id, (event) => {
    void sendNotification(
      login,
      event.broadcasterDisplayName,
      notifications.get(login) ?? notification,
      event,
    );
  });
  subscribedLogins.add(login);
  subscriptions.set(login, subscription);
  logger.info(`Watching Twitch stream.online events for ${login}.`);
}

async function sendNotification(
  login: string,
  displayName: string,
  notification: typeof trackedStreamersTable.$inferInsert,
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
    logger.error(
      { error },
      `Could not load Twitch channel details for ${login}`,
    );
  }

  const channelId = await getConfigValue(
    ConfigStrings.Twitch.NotificationChannelId,
  );
  if (!channelId) {
    logger.error("No global Twitch notification channel is configured.");
    return;
  }

  try {
    const channel = await notificationClient.channels.fetch(channelId);

    if (
      !channel ||
      (channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement)
    ) {
      logger.error(`Invalid notifications channel: ${channelId}`);
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
        message: notification.message,
        roleId: notification.roleId,
        title: stream?.title ?? channelInfo?.title ?? "Watch live on Twitch",
        gameName: stream?.gameName ?? channelInfo?.gameName,
        imageUrl: thumbnailUrl?.toString(),
      }),
    );
  } catch (error) {
    logger.error(
      { error },
      `Could not notify channel ${channelId} for ${login}`,
    );
  }
}
