import { ApiClient } from "@twurple/api";
import { RefreshingAuthProvider } from "@twurple/auth";
import { EventSubWsListener } from "@twurple/eventsub-ws";
import { ChannelType } from "discord.js";
import type { Client } from "discordx";
import { buildTwitchLiveMessage } from "../utils/twitchMessage.js";
import {
  removeTwitchNotification as deleteTwitchNotification,
  getConfigValue,
  listTwitchNotifications,
  addTwitchNotification as saveTwitchNotification,
  updateTwitchNotification as saveUpdatedTwitchNotification,
  setConfigValue,
  type TwitchNotification,
} from "./database.js";

let started = false;
let api: ApiClient;
let listener: EventSubWsListener;
let notificationClient: Client;
const notifications = new Map<
  string,
  { message: string; roleId: string | null }
>();
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
    roleId: notification.roleId,
  });

  if (!saved) return false;

  notifications.set(login, {
    message: notification.message,
    roleId: notification.roleId,
  });

  if (started) {
    await registerSubscription(login, notification);
  }

  return true;
}

export async function setNotificationChannel(channelId: string): Promise<void> {
  await setConfigValue("twitch.notification_channel_id", channelId);
}

export async function updateTwitchNotification(
  login: string,
  message: string,
  roleId: string | null,
): Promise<boolean> {
  const normalizedLogin = login.trim().toLowerCase();
  const updated = await saveUpdatedTwitchNotification(
    normalizedLogin,
    message,
    roleId,
  );

  if (updated) {
    notifications.set(normalizedLogin, { message, roleId });
  }

  return updated;
}

export async function removeTwitchNotification(
  login: string,
): Promise<boolean> {
  const normalizedLogin = login.trim().toLowerCase();
  const removed = await deleteTwitchNotification(normalizedLogin);

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
  return getConfigValue("twitch.notification_channel_id");
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
    notifications.set(login, {
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
      await registerSubscription(login, {
        twitchLogin: login,
        ...notification,
      });
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
  notification: TwitchNotification,
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
    void sendNotification(
      login,
      event.broadcasterDisplayName,
      {
        twitchLogin: login,
        ...(notifications.get(login) ?? notification),
      },
      event,
    );
  });
  subscribedLogins.add(login);
  subscriptions.set(login, subscription);
  console.log(`Watching Twitch stream.online events for ${login}.`);
}

async function sendNotification(
  login: string,
  displayName: string,
  notification: TwitchNotification,
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

  const channelId = await getConfigValue("twitch.notification_channel_id");
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
        message: notification.message,
        roleId: notification.roleId,
        title: stream?.title ?? channelInfo?.title ?? "Watch live on Twitch",
        gameName: stream?.gameName ?? channelInfo?.gameName,
        imageUrl: thumbnailUrl?.toString(),
      }),
    );
  } catch (error) {
    console.error(`Could not notify channel ${channelId} for ${login}:`, error);
  }
}
