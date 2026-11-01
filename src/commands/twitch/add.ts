import {
  ActionRowBuilder,
  type CommandInteraction,
  MessageFlags,
  ModalBuilder,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { Discord, ModalComponent, Slash, SlashGroup } from "discordx";
import { twitchApi } from "../../services/twitchApi.js";
import { addTwitchNotification } from "../../services/twitchNotifications.js";

const modalId = "twitch-add-modal";

@Discord()
@SlashGroup({
  description: "Manage Twitch streamer notifications",
  name: "twitch",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
export class TwitchAddCommand {
  @Slash({
    name: "add",
    description: "Add a Twitch streamer notification",
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
  })
  @SlashGroup("twitch")
  async twitchAdd(interaction: CommandInteraction): Promise<void> {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Use this command in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle("Add Twitch notification")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("streamer")
            .setLabel("Twitch streamer username")
            .setPlaceholder("ramen5914")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(25),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("message")
            .setLabel("Notification message")
            .setPlaceholder("A streamer you follow is live!")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(2000),
        ),
      );

    await interaction.showModal(modal);
  }

  @ModalComponent({ id: modalId })
  async submitTwitchAdd(interaction: ModalSubmitInteraction): Promise<void> {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Use this command in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const login = interaction.fields
      .getTextInputValue("streamer")
      .trim()
      .toLowerCase();
    const message = interaction.fields.getTextInputValue("message").trim();

    if (!/^[a-z0-9_]{1,25}$/.test(login)) {
      await interaction.reply({
        content: "Enter a Twitch username, not a full URL.",
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

      const added = await addTwitchNotification({
        twitchLogin: login,
        message,
      });

      await interaction.editReply(
        added
          ? `Notifications for **${user.displayName}** were added.`
          : `Notifications for **${user.displayName}** are already configured.`,
      );
    } catch (error) {
      console.error("Failed to add Twitch notification:", error);
      await interaction.editReply(
        "Couldn't save that notification. Check the bot logs for details.",
      );
    }
  }
}
