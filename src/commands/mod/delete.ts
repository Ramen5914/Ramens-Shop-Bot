import {
  ApplicationCommandOptionType,
  type AutocompleteInteraction,
  type CommandInteraction,
  DiscordAPIError,
  MessageFlags,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
} from "discord.js";
import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { eq } from "drizzle-orm";
import { minecraftModsTable } from "@/db/schema.js";
import { db } from "@/main.js";

@Discord()
@SlashGroup({
  description: "Create base mod channels info message",
  name: "mod",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
export class ModCreateCommand {
  @Slash({
    name: "delete",
    description: "Delete category, channels, and roles for a Minecraft mod",
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
  })
  @SlashGroup("mod")
  async mcModDelete(
    @SlashOption({
      description: "Mod repo name",
      name: "repo",
      required: true,
      type: ApplicationCommandOptionType.String,
      autocomplete: async (interaction: AutocompleteInteraction) => {
        const query = interaction.options.getFocused().toLowerCase();

        const mods = await db
          .select({
            repo: minecraftModsTable.gitRepo,
          })
          .from(minecraftModsTable);

        const choices = mods
          .filter((mod) => mod.repo.toLowerCase().includes(query))
          .slice(0, 25)
          .map((mod) => ({ name: mod.repo, value: mod.repo }));

        await interaction.respond(choices);
      },
    })
    gitRepo: string,
    interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command must be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const guild = interaction.guild;

    try {
      const mod = await db
        .select()
        .from(minecraftModsTable)
        .where(eq(minecraftModsTable.gitRepo, gitRepo))
        .get();

      if (!mod) {
        await interaction.editReply({
          content: `No Minecraft mod found for gitRepo: ${gitRepo}`,
        });
        return;
      }

      const reason = `Deleting Minecraft mod: ${mod.gitRepo}`;

      const deleteChannel = async (channelId: string): Promise<void> => {
        try {
          await guild.channels.delete(channelId, reason);
        } catch (error) {
          if (
            error instanceof DiscordAPIError &&
            error.code === RESTJSONErrorCodes.UnknownChannel
          ) {
            return; // Already deleted.
          }

          throw error;
        }
      };

      const deleteRole = async (roleId: string): Promise<void> => {
        try {
          await guild.roles.delete(roleId, reason);
        } catch (error) {
          if (
            error instanceof DiscordAPIError &&
            error.code === RESTJSONErrorCodes.UnknownRole
          ) {
            return; // Already deleted.
          }

          throw error;
        }
      };

      const channelIds = [
        mod.infoChannel,
        mod.announcementsChannel,
        mod.githubUpdatesChannel,
        mod.collaboratorChannel,
        mod.chatChannel,
        mod.suggestionsChannel,
        mod.supportChannel,
      ];

      const roleIds = [mod.role, mod.updatesRole, mod.collaboratorRole];

      // Delete the individually tracked channels.
      for (const channelId of channelIds) {
        await deleteChannel(channelId);
      }

      // Delete the individually tracked roles.
      for (const roleId of roleIds) {
        await deleteRole(roleId);
      }

      // Delete the category after its tracked channels.
      await deleteChannel(mod.channelCategory);

      // Remove the row only after all Discord deletions succeed
      // (or the resources are confirmed to already be gone).
      await db
        .delete(minecraftModsTable)
        .where(eq(minecraftModsTable.id, mod.id));

      await interaction.editReply({
        content: `Deleted channels, roles, category, and database entry for ${mod.gitRepo}.`,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error(`Failed to delete Minecraft mod ${gitRepo}:`, error);

      await interaction.editReply({
        content:
          `Cleanup for ${gitRepo} failed. Some resources may already have been deleted. ` +
          "Check the bot logs before retrying.",
        allowedMentions: { parse: [] },
      });
    }
  }
}
