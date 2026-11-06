import { ChannelType, type VoiceChannel, type VoiceState } from "discord.js";
import type { Client } from "discordx";
import { logger } from "@/logger.js";
import {
  addVoiceChatGenerator,
  listVoiceChatGenerators,
  removeVoiceChatGenerator,
  type VoiceChatGenerator,
} from "./database.js";

const generators = new Map<string, VoiceChatGenerator>();
const temporaryChannels = new Map<string, { generator: VoiceChatGenerator }>();
let client: Client | undefined;

export async function startVoiceChatService(bot: Client): Promise<void> {
  client = bot;
  generators.clear();

  for (const generator of await listVoiceChatGenerators()) {
    generators.set(generator.channelId, generator);
  }
}

export async function registerVoiceChatGenerator(
  generator: VoiceChatGenerator,
): Promise<boolean> {
  const added = await addVoiceChatGenerator(generator);
  if (added) {
    generators.set(generator.channelId, generator);
  }
  return added;
}

export async function unregisterVoiceChatGenerator(
  guildId: string,
  channelId: string,
): Promise<boolean> {
  const removed = await removeVoiceChatGenerator(channelId);
  if (!removed) return false;

  generators.delete(channelId);

  if (client) {
    const guild = client.guilds.cache.get(guildId);
    const generatorChannel = guild?.channels.cache.get(channelId);
    if (generatorChannel?.isVoiceBased()) {
      await generatorChannel.delete("Voice chat generator removed");
    }

    for (const [temporaryChannelId, generatorConfig] of temporaryChannels) {
      if (generatorConfig.generator.channelId !== channelId) continue;
      await deleteTemporaryChannel(
        temporaryChannelId,
        "Voice chat generator removed",
      );
    }
  }

  return true;
}

export async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  await deleteEmptyTemporaryChannel(oldState);

  const generator = generators.get(newState.channelId ?? "");
  if (!generator || !newState.guild) return;

  const member =
    newState.member ?? (await newState.guild.members.fetch(newState.id));
  if (member.user.bot) return;

  try {
    const channel: VoiceChannel = await newState.guild.channels.create({
      name: `${member.displayName}'s voice chat`,
      type: ChannelType.GuildVoice,
      parent: generator.categoryId,
    });

    temporaryChannels.set(channel.id, { generator });

    try {
      await member.voice.setChannel(channel);
    } catch (error) {
      logger.error(
        { error },
        "Failed to move member into temporary voice channel",
      );
      await deleteTemporaryChannel(
        channel.id,
        "Could not move member into temporary voice channel",
      );
    }
  } catch (error) {
    logger.error({ error }, "Failed to create temporary voice channel");
  }
}

async function deleteTemporaryChannel(
  channelId: string,
  reason: string,
): Promise<void> {
  const temporaryChannel = temporaryChannels.get(channelId);
  if (!temporaryChannel) return;

  temporaryChannels.delete(channelId);
  try {
    const channel = client?.channels.cache.get(channelId);
    if (channel?.isVoiceBased()) {
      await channel.delete(reason);
    }
  } catch (error) {
    logger.error(
      { error },
      `Failed to delete temporary voice channel ${channelId}`,
    );
  }
}

async function deleteEmptyTemporaryChannel(
  voiceState: VoiceState,
): Promise<void> {
  const channelId = voiceState.channelId;
  if (!channelId || !temporaryChannels.has(channelId)) return;

  const channel = voiceState.guild.channels.cache.get(channelId);
  if (!channel?.isVoiceBased() || channel.members.size > 0) return;

  await deleteTemporaryChannel(channelId, "Temporary voice channel is empty");
}
