import {
  ApplicationCommandOptionType,
  type AutocompleteInteraction,
  ChannelType,
  type CommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { logger } from "../../logger.js";
import { listTrackedStreamers } from "../../services/database.js";
import { twitchApi } from "../../services/twitchApi.js";
import { getConfiguredNotificationChannel } from "../../services/twitchNotifications.js";
import { buildTwitchLiveMessage } from "../../utils/twitchMessage.js";

@Discord()
@SlashGroup({
  description: "Manage Twitch streamer notifications",
  name: "twitch",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
export class TwitchTestCommand {
  @Slash({
    name: "test",
    description: "Send a test Twitch live notification",
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
  })
  @SlashGroup("twitch")
  async twitchTest(
    @SlashOption({
      name: "streamer",
      description: "Tracked Twitch streamer username",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: async (interaction: AutocompleteInteraction) => {
        const query =
          interaction.options.getString("streamer")?.trim().toLowerCase() ?? "";
        const streamers = await listTrackedStreamers();

        await interaction.respond(
          streamers
            .filter((streamer) =>
              streamer.displayName.toLowerCase().includes(query),
            )
            .slice(0, 25)
            .map((streamer) => ({
              name: streamer.displayName,
              value: streamer.displayName,
            })),
        );
      },
    })
    streamer: string,
    interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Use this command in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const login = streamer.trim().toLowerCase();
    const trackedStreamers = await listTrackedStreamers();
    const trackedStreamer = trackedStreamers.find(
      (tracked) => tracked.displayName.toLowerCase() === login,
    );

    if (!trackedStreamer) {
      await interaction.reply({
        content: "Choose a streamer from the tracked streamer suggestions.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const user = await twitchApi.users.getUserByName(login);

      if (!user) {
        await interaction.editReply(`Twitch user "${login}" was not found.`);
        return;
      }

      const stream = await twitchApi.streams.getStreamByUserName(login);
      const imageUrl = stream
        ? stream.getThumbnailUrl(1280, 720)
        : user.profilePictureUrl;
      const channelId = await getConfiguredNotificationChannel();

      if (!channelId) {
        await interaction.editReply(
          "Configure a global channel first with /twitch channel.",
        );
        return;
      }

      const channel = await interaction.client.channels.fetch(channelId);

      if (
        !channel ||
        (channel.type !== ChannelType.GuildText &&
          channel.type !== ChannelType.GuildAnnouncement) ||
        channel.guildId !== interaction.guildId
      ) {
        await interaction.editReply(
          "The configured Twitch channel must be a text or announcement channel in this server.",
        );
        return;
      }

      await channel.send(
        buildTwitchLiveMessage({
          login,
          displayName: user.displayName,
          message: trackedStreamer.message,
          roleId: trackedStreamer.roleId,
          title: "Test stream - checking my Twitch notification!",
          gameName: "Just Chatting",
          imageUrl,
        }),
      );

      await interaction.editReply(
        `Test notification sent to <#${channel.id}>.`,
      );
    } catch (error) {
      logger.error(
        { error, command: "twitch test" },
        "Failed to send Twitch test notification",
      );
      await interaction.editReply(
        "Couldn't send the test. Check that I have View Channel, " +
          "Send Messages, and Embed Links permissions in that channel.",
      );
    }
  }
}
