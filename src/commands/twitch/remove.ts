import {
  ApplicationCommandOptionType,
  type AutocompleteInteraction,
  type CommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { logger } from "../../logger.js";
import { listTrackedStreamers } from "../../services/database.js";
import { removeTwitchNotification } from "../../services/twitchNotifications.js";

@Discord()
@SlashGroup({
  description: "Manage Twitch streamer notifications",
  name: "twitch",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
export class TwitchRemoveCommand {
  @Slash({
    name: "remove",
    description: "Remove a tracked Twitch streamer",
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
  })
  @SlashGroup("twitch")
  async twitchRemove(
    @SlashOption({
      name: "streamer",
      description: "Tracked Twitch streamer to remove",
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

    try {
      const removed = await removeTwitchNotification(streamer);
      await interaction.reply({
        content: removed
          ? `Stopped tracking **${streamer}**.`
          : `**${streamer}** is not currently tracked.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error(
        { error, command: "twitch remove" },
        "Failed to remove Twitch notification",
      );
      await interaction.reply({
        content: "Couldn't remove that streamer.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
