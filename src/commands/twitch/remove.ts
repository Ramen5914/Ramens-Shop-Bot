import {
  ApplicationCommandOptionType,
  type AutocompleteInteraction,
  type CommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { listTwitchNotifications } from "../../services/notificationStore.js";
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
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
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
        const streamers = await listTwitchNotifications();

        await interaction.respond(
          streamers
            .filter((streamer) => streamer.twitchLogin.includes(query))
            .slice(0, 25)
            .map((streamer) => ({
              name: streamer.twitchLogin,
              value: streamer.twitchLogin,
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
      console.error("Failed to remove Twitch notification:", error);
      await interaction.reply({
        content: "Couldn't remove that streamer.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
