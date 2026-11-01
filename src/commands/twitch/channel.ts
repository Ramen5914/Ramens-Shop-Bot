import {
  ApplicationCommandOptionType,
  ChannelType,
  type CommandInteraction,
  type GuildTextBasedChannel,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { setNotificationChannel } from "../../services/twitchNotifications.js";

@Discord()
@SlashGroup({
  description: "Manage Twitch streamer notifications",
  name: "twitch",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
export class TwitchChannelCommand {
  @Slash({
    name: "channel",
    description: "Set the global Twitch notification channel",
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
  })
  @SlashGroup("twitch")
  async twitchChannel(
    @SlashOption({
      name: "channel",
      description: "Where all Twitch live notifications should be sent",
      type: ApplicationCommandOptionType.Channel,
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      required: true,
    })
    destination: GuildTextBasedChannel,
    interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Use this command in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = await interaction.client.channels.fetch(destination.id);

    if (
      !channel ||
      (channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement) ||
      channel.guildId !== interaction.guildId
    ) {
      await interaction.reply({
        content: "Choose a text or announcement channel in this server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await setNotificationChannel(channel.id);
      await interaction.reply({
        content: `All Twitch notifications will be sent to <#${channel.id}>.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("Failed to set Twitch notification channel:", error);
      await interaction.reply({
        content: "Couldn't save the notification channel.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
