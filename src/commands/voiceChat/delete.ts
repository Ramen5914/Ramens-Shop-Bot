import {
  ApplicationCommandOptionType,
  type CommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { unregisterVoiceChatGenerator } from "@/services/voiceChat.js";

@Discord()
@SlashGroup({
  description: "Manage temporary voice chat generators",
  name: "voice-chat",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
export class VoiceChatDeleteCommand {
  @Slash({
    name: "delete",
    description: "Delete a temporary voice chat generator",
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
  })
  @SlashGroup("voice-chat")
  async deleteVoiceChatGenerator(
    @SlashOption({
      name: "channel-id",
      description: "Voice chat generator channel ID",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    channelId: string,
    interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Use this command in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const removed = await unregisterVoiceChatGenerator(
      interaction.guildId,
      channelId.trim(),
    );
    await interaction.reply({
      content: removed
        ? "The voice chat generator was deleted."
        : "No voice chat generator was found with that channel ID.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
