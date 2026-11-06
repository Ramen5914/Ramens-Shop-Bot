import {
  ApplicationCommandOptionType,
  type AutocompleteInteraction,
  type CommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Discord, Slash, SlashChoice, SlashGroup, SlashOption } from "discordx";
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
    name: "edit",
    description: "Edit links, modrinth/cf project IDs and slugs, and color",
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
    @SlashChoice(
      { name: "GitHub", value: "github" },
      { name: "CurseForge", value: "curseforge" },
      { name: "Modrinth", value: "modrinth" },
      { name: "Other", value: "other" },
    )
    @SlashOption({
      description: "Homepage Link Type",
      name: "homepage-link-type",
      required: false,
      type: ApplicationCommandOptionType.String,
    })
    homepageUrlType: "github" | "curseforge" | "modrinth" | "other" | undefined,
    @SlashOption({
      description: "Modrinth Slug",
      name: "modrinth-slug",
      required: false,
      type: ApplicationCommandOptionType.String,
    })
    modrinthSlug: string | undefined,
    @SlashOption({
      description: "Curseforge Slug",
      name: "curseforge-slug",
      required: false,
      type: ApplicationCommandOptionType.String,
    })
    curseForgeSlug: string | undefined,
    @SlashOption({
      description: "Modrinth Project ID",
      name: "modrinth-id",
      required: false,
      type: ApplicationCommandOptionType.String,
    })
    modrinthProjectId: string | undefined,
    @SlashOption({
      description: "Curseforge Project ID",
      name: "curseforge-id",
      required: false,
      type: ApplicationCommandOptionType.Integer,
    })
    curseForgeProjectId: number | undefined,
    @SlashOption({
      description: "Wiki Link",
      name: "wiki-url",
      required: false,
      type: ApplicationCommandOptionType.String,
    })
    wikiUrl: string | undefined,
    @SlashOption({
      description: "Issues Link",
      name: "issues-url",
      required: false,
      type: ApplicationCommandOptionType.String,
    })
    issuesUrl: string | undefined,
    @SlashOption({
      description: "Project Board Link",
      name: "project-board-url",
      required: false,
      type: ApplicationCommandOptionType.String,
    })
    projectBoardUrl: string | undefined,
    @SlashOption({
      description: "Other Project Link",
      name: "other-url",
      required: false,
      type: ApplicationCommandOptionType.String,
    })
    otherUrl: string | undefined,
    @SlashOption({
      description: "Maven Link",
      name: "maven-url",
      required: false,
      type: ApplicationCommandOptionType.String,
    })
    mavenUrl: string | undefined,
    @SlashOption({
      description: "Embed color as a decimal integer",
      name: "color",
      required: false,
      type: ApplicationCommandOptionType.Integer,
    })
    color: number | undefined,
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

    const updates = Object.fromEntries(
      Object.entries({
        homepageUrlType,
        modrinthSlug,
        curseForgeSlug,
        modrinthProjectId,
        curseForgeProjectId,
        wikiUrl,
        issuesUrl,
        projectBoardUrl,
        otherUrl,
        mavenUrl,
        color,
      }).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(updates).length > 0) {
      await db
        .update(minecraftModsTable)
        .set(updates)
        .where(eq(minecraftModsTable.id, mod.id));

      Object.assign(mod, updates);
    }

    await refreshSingleModMessage(mod);

    await interaction.editReply({
      content: `\`\`\`json\n${JSON.stringify(mod, null, 2)}\n\`\`\``,
    });
  }
}
