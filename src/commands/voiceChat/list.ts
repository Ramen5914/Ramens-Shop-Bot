import {
  type CommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Discord, Slash, SlashGroup } from "discordx";
import { listVoiceChatGenerators as GetVoiceChatGenerators } from "@/services/database.js";

@Discord()
@SlashGroup({
  description: "Manage temporary voice chat generators",
  name: "voice-chat",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
export class VoiceChatListCommand {
  @Slash({
    name: "list",
    description: "List temporary voice chat generators",
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
  })
  @SlashGroup("voice-chat")
  async listVoiceChatGenerators(
    interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Use this command in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const generators = await GetVoiceChatGenerators();
    const content =
      generators.length > 0
        ? generators
            .map(
              (generator) =>
                `- <#${generator.channelId}> in <#${generator.categoryId}>`,
            )
            .join("\n")
        : "No voice chat generators are configured.";

    await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral,
    });
  }
}
