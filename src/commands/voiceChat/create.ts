import {
  ApplicationCommandOptionType,
  ChannelType,
  type CommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { registerVoiceChatGenerator } from "@/services/voiceChat.js";

@Discord()
@SlashGroup({
  description: "Manage temporary voice chat generators",
  name: "voice-chat",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
export class VoiceChatCreateCommand {
  @Slash({
    name: "create",
    description: "Create a temporary voice chat generator",
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
  })
  @SlashGroup("voice-chat")
  async createVoiceChatGenerator(
    @SlashOption({
      name: "category-id",
      description: "Category ID where temporary channels will be created",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    categoryId: string,
    interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Use this command in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: "Use this command in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const category = await guild.channels.fetch(categoryId.trim());
    if (!category || category.type !== ChannelType.GuildCategory) {
      await interaction.reply({
        content: "That ID does not belong to a category in this server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const generator = await guild.channels.create({
      name: "Voice chat",
      type: ChannelType.GuildVoice,
      parent: category.id,
    });

    const added = await registerVoiceChatGenerator({
      channelId: generator.id,
      categoryId: category.id,
    });

    if (!added) {
      await generator.delete("Duplicate voice chat generator");
      await interaction.reply({
        content: "That voice chat generator is already configured.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: `Created a voice chat generator <#${generator.id}> in <#${category.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
