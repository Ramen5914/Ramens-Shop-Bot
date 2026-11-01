import {
	ActionRowBuilder,
	ApplicationCommandOptionType,
	type AutocompleteInteraction,
	type CommandInteraction,
	MessageFlags,
	ModalBuilder,
	type ModalSubmitInteraction,
	PermissionFlagsBits,
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
import { listTwitchNotifications } from "../../services/notificationStore.js";
import { updateTwitchNotification } from "../../services/twitchNotifications.js";

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
		defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
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

		const login = streamer.trim().toLowerCase();
		const tracked = (await listTwitchNotifications()).find(
			(notification) => notification.twitchLogin === login,
		);

		if (!tracked) {
			await interaction.reply({
				content: "Choose a streamer from the tracked streamer suggestions.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const modal = new ModalBuilder()
			.setCustomId(`${modalId}:${login}`)
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

		const login = interaction.customId.slice(`${modalId}:`.length);
		const message = interaction.fields.getTextInputValue("message").trim();

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		try {
			const updated = await updateTwitchNotification(login, message);
			await interaction.editReply(
				updated
					? `Updated the stream start message for **${login}**.`
					: `**${login}** is no longer tracked.`,
			);
		} catch (error) {
			console.error("Failed to update Twitch notification:", error);
			await interaction.editReply(
				"Couldn't update that notification. Check the bot logs for details.",
			);
		}
	}
}
