import {
  ApplicationCommandOptionType,
  type AutocompleteInteraction,
  type CommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { eq } from "drizzle-orm";
import { minecraftModsTable } from "@/db/schema.js";
import { db } from "@/main.js";
import { refreshSingleModMessage } from "@/services/minecraftModsScheduler.js";

@Discord()
@SlashGroup({
  description: "Create base mod channels info message",
  name: "mod",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
export class ModCreateCommand {
  @Slash({
    name: "update",
    description:
      "Immediately update the mod's info message in it's respective channel",
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
  })
  @SlashGroup("mod")
  async mcModEdit(
    @SlashOption({
      description: "Mod repo name",
      name: "repo",
      required: true,
      type: ApplicationCommandOptionType.String,
      autocomplete: async (interaction: AutocompleteInteraction) => {
        const query = interaction.options.getFocused().toLowerCase();

        const mods = await db
          .select({
            gitRepo: minecraftModsTable.gitRepo,
          })
          .from(minecraftModsTable);

        const choices = mods
          .filter((mod) => mod.gitRepo.toLowerCase().includes(query))
          .slice(0, 25)
          .map((mod) => ({ name: mod.gitRepo, value: mod.gitRepo }));

        await interaction.respond(choices);
      },
    })
    gitRepo: string,
    interaction: CommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const mod = await db
      .select()
      .from(minecraftModsTable)
      .where(eq(minecraftModsTable.gitRepo, gitRepo))
      .get();

    if (!mod) {
      await interaction.editReply({
        content: `No mod found with name ${gitRepo}`,
      });

      return;
    }

    refreshSingleModMessage(mod);

    await interaction.editReply({
      content: `Updated mod info message`,
    });
  }
}
