import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  type CommandInteraction,
  MessageFlags,
  ModalBuilder,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
  type Role,
  type Snowflake,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  Discord,
  ModalComponent,
  Slash,
  SlashGroup,
  SlashOption,
} from "discordx";
import { logger } from "../../logger.js";
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
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
  })
  @SlashGroup("twitch")
  async twitchAdd(
    @SlashOption({
      name: "role",
      description: "Optional role to mention when the streamer goes live",
      type: ApplicationCommandOptionType.Role,
      required: false,
    })
    role: Role | undefined,
    interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Use this command in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`${modalId}:${role?.id ?? "none"}`)
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

  @ModalComponent({ id: new RegExp(`^${modalId}:.+$`) })
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
    const roleId = interaction.customId.split(":")[1];
    const selectedRoleId: Snowflake | null = roleId === "none" ? null : roleId;

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

      if (
        selectedRoleId &&
        !(await interaction.guild?.roles.fetch(selectedRoleId))
      ) {
        await interaction.editReply("The selected Discord role was not found.");
        return;
      }

      const added = await addTwitchNotification({
        displayName: user.displayName,
        message,
        roleId: selectedRoleId,
      });

      await interaction.editReply(
        added
          ? `Notifications for **${user.displayName}** were added.`
          : `Notifications for **${user.displayName}** are already configured.`,
      );
    } catch (error) {
      logger.error(
        { error, command: "twitch add" },
        "Failed to add Twitch notification",
      );
      await interaction.editReply(
        "Couldn't save that notification. Check the bot logs for details.",
      );
    }
  }
}
