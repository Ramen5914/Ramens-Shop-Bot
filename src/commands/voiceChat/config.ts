import {
  ApplicationCommandOptionType,
  type CommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { eq } from "drizzle-orm/sql";
import { configTable } from "@/db/schema.js";
import { db } from "@/main.js";
import { ConfigStrings } from "@/utils/constants.js";

@Discord()
@SlashGroup({
  description: "Manage temporary voice chat generators",
  name: "voice-chat",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
export class VoiceChatCreateCommand {
  @Slash({
    name: "config",
    description: "Edit category IDs for temporary voice chats",
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
  })
  @SlashGroup("voice-chat")
  async editVoiceChatConfig(
    @SlashOption({
      name: "base-category",
      description: "Category ID where temporary channels will be created",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    baseCategoryId: string,
    @SlashOption({
      name: "sized-category",
      description: "Category ID where sized temporary channels will be created",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    sizedCategoryId: string,
    interaction: CommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    let baseCategory: typeof configTable.$inferSelect | undefined;
    let sizedCategory: typeof configTable.$inferSelect | undefined;

    if (baseCategoryId) {
      baseCategory = await db
        .insert(configTable)
        .values({
          key: ConfigStrings.Voice.BaseChannelId,
          value: baseCategoryId,
        })
        .returning()
        .get();
    } else {
      baseCategory = await db
        .select()
        .from(configTable)
        .where(eq(configTable.key, ConfigStrings.Voice.BaseChannelId))
        .get();
    }

    if (sizedCategoryId) {
      sizedCategory = await db
        .insert(configTable)
        .values({
          key: ConfigStrings.Voice.SizedChannelId,
          value: sizedCategoryId,
        })
        .returning()
        .get();
    } else {
      sizedCategory = await db
        .select()
        .from(configTable)
        .where(eq(configTable.key, ConfigStrings.Voice.SizedChannelId))
        .get();
    }

    await interaction.editReply({
      content: `Base Category: ${baseCategory ? baseCategory.value : "None"}\nSized Category: ${sizedCategory ? sizedCategory.value : "None"}`,
    });
  }
}
