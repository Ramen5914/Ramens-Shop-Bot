import {
  type CommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Discord, Slash, SlashGroup } from "discordx";
import { listTwitchNotifications } from "../../services/notificationStore.js";

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
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
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
      const notifications = await listTwitchNotifications();
      const content =
        notifications.length > 0
          ? `Tracked Twitch streamers:\n${notifications
              .map(
                (notification) =>
                  `- **${notification.twitchLogin}**${
                    notification.message ? ` — ${notification.message}` : ""
                  }`,
              )
              .join("\n")}`
          : "No Twitch streamers are currently tracked.";

      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error("Failed to list Twitch notifications:", error);
      await interaction.reply({
        content: "Couldn't load the tracked streamers.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
