import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  type AutocompleteInteraction,
  type CommandInteraction,
  MessageFlags,
  ModalBuilder,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
  type Role,
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
import { logger } from "@/logger.js";
import { listTrackedStreamers } from "@/services/database.js";
import { updateTwitchNotification } from "@/services/twitchNotifications.js";

const modalId = "twitch-edit-modal";

@Discord()
@SlashGroup({
  description: "Manage Twitch streamer notifications",
  name: "twitch",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
export class TwitchEditCommand {
  @Slash({
    name: "edit",
    description: "Edit a Twitch stream start message",
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
  })
  @SlashGroup("twitch")
  async twitchEdit(
    @SlashOption({
      name: "streamer",
      description: "Tracked Twitch streamer",
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
    @SlashOption({
      name: "role",
      description: "Optional replacement role to mention when live",
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

    const login = streamer.trim().toLowerCase();
    const tracked = (await listTrackedStreamers()).find(
      (notification) => notification.displayName.toLowerCase() === login,
    );

    if (!tracked) {
      await interaction.reply({
        content: "Choose a streamer from the tracked streamer suggestions.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(
        `${modalId}:${login}:${role?.id ?? tracked.roleId ?? "none"}`,
      )
      .setTitle(`Edit ${login} message`)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("message")
            .setLabel("Stream start message")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(2000)
            .setValue(tracked.message),
        ),
      );

    await interaction.showModal(modal);
  }

  @ModalComponent({ id: /^twitch-edit-modal:.+$/ })
  async submitTwitchEdit(interaction: ModalSubmitInteraction): Promise<void> {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Use this command in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const [, login, selectedRole] = interaction.customId.split(":");
    const message = interaction.fields.getTextInputValue("message").trim();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const roleId = selectedRole === "none" ? null : selectedRole;

      if (roleId && !(await interaction.guild?.roles.fetch(roleId))) {
        await interaction.editReply("The selected Discord role was not found.");
        return;
      }

      const updated = await updateTwitchNotification(login, message, roleId);
      await interaction.editReply(
        updated
          ? `Updated the stream start message for **${login}**.`
          : `**${login}** is no longer tracked.`,
      );
    } catch (error) {
      logger.error(
        { error, command: "twitch edit" },
        "Failed to update Twitch notification",
      );
      await interaction.editReply(
        "Couldn't update that notification. Check the bot logs for details.",
      );
    }
  }
}
