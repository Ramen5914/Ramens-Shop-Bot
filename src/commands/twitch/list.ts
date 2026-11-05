import {
  type CommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Discord, Slash, SlashGroup } from "discordx";
import { logger } from "../../logger.js";
import { listTrackedStreamers } from "../../services/database.js";

@Discord()
@SlashGroup({
  description: "Manage Twitch streamer notifications",
  name: "twitch",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
export class TwitchListCommand {
  @Slash({
    name: "list",
    description: "List tracked Twitch streamers",
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
  })
  @SlashGroup("twitch")
  async twitchList(interaction: CommandInteraction): Promise<void> {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Use this command in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const notifications = await listTrackedStreamers();
      const content =
        notifications.length > 0
          ? `Tracked Twitch streamers:\n${notifications
              .map(
                (notification) =>
                  `- **${notification.displayName}**${
                    notification.message ? ` — ${notification.message}` : ""
                  }`,
              )
              .join("\n")}`
          : "No Twitch streamers are currently tracked.";

      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch (error) {
      logger.error(
        { error, command: "twitch list" },
        "Failed to list Twitch notifications",
      );
      await interaction.reply({
        content: "Couldn't load the tracked streamers.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
