import {
  ApplicationCommandOptionType,
  type AutocompleteInteraction,
  ChannelType,
  type CommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { minecraftModsTable } from "../../db/schema.js";
import { logger } from "../../logger.js";
import { db } from "../../main.js";
import { listInstallationRepos } from "../../services/githubApi.js";

@Discord()
@SlashGroup({
  description: "Create base mod channels info message",
  name: "mod",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
export class ModCreateCommand {
  @Slash({
    name: "create",
    description:
      "Create category, channels, and info message for a Minecraft mod",
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
  })
  @SlashGroup("mod")
  async mcModCreate(
    @SlashOption({
      description: "Repo name",
      name: "repo",
      required: true,
      type: ApplicationCommandOptionType.String,
      autocomplete: async (interaction: AutocompleteInteraction) => {
        const query = interaction.options.getFocused().toLowerCase();

        const repos = await listInstallationRepos(true);

        const choices = repos
          .filter((repo) => repo.toLowerCase().includes(query))
          .slice(0, 25)
          .map((repo) => ({ name: repo, value: repo }));

        await interaction.respond(choices);
      },
    })
    repo: string,
    @SlashOption({
      description: "Role name for channel permissions",
      name: "role-name",
      required: false,
      type: ApplicationCommandOptionType.String,
    })
    roleName: string | undefined,
    interaction: CommandInteraction,
  ): Promise<void> {
    const guild = interaction.guild;

    if (!interaction.inGuild() || !guild) {
      interaction.reply({
        content: "Try this command in a server instead.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    if (!roleName) {
      roleName = repo;
    }

    const role = await guild.roles.create({ name: roleName });
    const collaboratorRole = await guild.roles.create({
      name: `${roleName} Collaborator`,
    });
    const updatesRole = await guild.roles.create({
      name: `${roleName} Updates`,
    });

    const category = await guild.channels.create({
      name: roleName,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
          ],
        },
        {
          id: role.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });

    const infoChannel = await guild.channels.create({
      name: "info",
      type: ChannelType.GuildText,
      parent: category.id,
    });
    await infoChannel.lockPermissions();

    const announcementsChannel = await guild.channels.create({
      name: "announcements",
      type: ChannelType.GuildAnnouncement,
      parent: category.id,
    });
    await announcementsChannel.lockPermissions();
    await announcementsChannel.permissionOverwrites.edit(collaboratorRole, {
      ViewChannel: true,
      ReadMessageHistory: true,
      SendMessages: true,
    });

    const githubUpdatesChannel = await guild.channels.create({
      name: "github-updates",
      type: ChannelType.GuildText,
      parent: category.id,
    });
    await githubUpdatesChannel.lockPermissions();

    const collaboratorChannel = await guild.channels.create({
      name: "collaborator-chat",
      type: ChannelType.GuildText,
      parent: category.id,
    });
    await collaboratorChannel.lockPermissions();
    await collaboratorChannel.permissionOverwrites.edit(collaboratorRole, {
      ViewChannel: true,
      ReadMessageHistory: true,
      SendMessages: true,
    });

    const chatChannel = await guild.channels.create({
      name: "chat",
      type: ChannelType.GuildText,
      parent: category.id,
    });
    await chatChannel.lockPermissions();
    await chatChannel.permissionOverwrites.edit(role, {
      SendMessages: true,
    });

    const suggestionsChannel = await guild.channels.create({
      name: "suggestions",
      type: ChannelType.GuildForum,
      parent: category.id,
    });
    await suggestionsChannel.lockPermissions();
    await suggestionsChannel.permissionOverwrites.edit(role, {
      SendMessages: true,
      SendMessagesInThreads: true,
    });

    const supportChannel = await guild.channels.create({
      name: "support",
      type: ChannelType.GuildForum,
      parent: category.id,
    });
    await supportChannel.lockPermissions();
    await supportChannel.permissionOverwrites.edit(role, {
      SendMessages: true,
      SendMessagesInThreads: true,
    });

    const orderedChannels = [
      infoChannel,
      announcementsChannel,
      githubUpdatesChannel,
      collaboratorChannel,
      chatChannel,
      suggestionsChannel,
      supportChannel,
    ];

    await guild.channels.setPositions(
      orderedChannels.map((channel, position) => ({
        channel: channel.id,
        position,
      })),
    );

    const mod: typeof minecraftModsTable.$inferInsert = {
      homepageUrlType: "github",
      gitRepo: repo,
      channelCategory: category.id,
      infoChannel: infoChannel.id,
      announcementsChannel: announcementsChannel.id,
      updatesRole: updatesRole.id,
      githubUpdatesChannel: githubUpdatesChannel.id,
      collaboratorChannel: collaboratorChannel.id,
      collaboratorRole: collaboratorRole.id,
      chatChannel: chatChannel.id,
      suggestionsChannel: suggestionsChannel.id,
      supportChannel: supportChannel.id,
      role: role.id,
    };

    try {
      const t = await db.insert(minecraftModsTable).values(mod);

      interaction.editReply({
        content: `\`\`\`json\n${JSON.stringify(t)}\n\`\`\``,
      });
    } catch (error) {
      console.dir(error, { depth: null });

      if (error instanceof Error) {
        logger.error(
          { error, command: "drizzle insert" },
          `Underlying cause: ${error.cause}`,
        );
      }

      throw error;
    }
  }
}
