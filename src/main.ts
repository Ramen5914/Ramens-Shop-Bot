import { dirname, importx } from "@discordx/importer";
import { createClient } from "@libsql/client";
import {
  Events,
  IntentsBitField,
  type Interaction,
  MessageFlags,
  Partials,
  PermissionFlagsBits,
} from "discord.js";
import { Client } from "discordx";
import { startGithubWebhookServer } from "./services/githubWebhook.js";
import { startMinecraftModsScheduler } from "./services/minecraftModsScheduler.js";
import { startTwitchNotifications } from "./services/twitchNotifications.js";
import { startVoiceChatService } from "./services/voiceChat.js";
import "dotenv/config";
import { drizzle } from "drizzle-orm/libsql";
import { logger } from "./logger.js";

if (!process.env.DB_FILE_NAME) {
  throw new Error("Must set DB_FILE_NAME in .env");
}

const client = createClient({ url: process.env.DB_FILE_NAME });
export const db = drizzle({ client });

export const bot = new Client({
  botGuilds: [(client) => client.guilds.cache.map((guild) => guild.id)],
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildMessageReactions,
    IntentsBitField.Flags.DirectMessages,
    IntentsBitField.Flags.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  silent: false,
});

bot.once(Events.ClientReady, async () => {
  // Make sure all guilds are cached
  // await bot.guilds.fetch();

  // Synchronize applications commands with Discord
  try {
    await bot.initApplicationCommands();
  } catch (error) {
    logger.error(
      { error, command: "command sync" },
      `Failed to synchronize application commands`,
    );
  }

  await startTwitchNotifications(bot);
  await startVoiceChatService(bot);
  startMinecraftModsScheduler();

  // To clear all guild commands, uncomment this line,
  // This is useful when moving from guild commands to global commands
  // It must only be executed once
  //
  // await bot.clearApplicationCommands(...bot.guilds.cache.map((g) => g.id));

  logger.info("Bot started");
});

bot.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    logger.info(`Reaction Emoji Name: ${reaction.emoji.name}`);
    await bot.executeReaction(reaction, user);
  } catch (error) {
    logger.error(
      { error, command: "reaction event" },
      "Failed to handle message reaction",
    );
  }
});

bot.on("interactionCreate", async (interaction: Interaction) => {
  const isTwitchCommand =
    (interaction.isChatInputCommand() || interaction.isAutocomplete()) &&
    interaction.commandName === "twitch";
  const isTwitchModal =
    interaction.isModalSubmit() && interaction.customId.startsWith("twitch-");

  if (
    (isTwitchCommand || isTwitchModal) &&
    (!interaction.inGuild() ||
      !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))
  ) {
    if (interaction.isAutocomplete()) {
      await interaction.respond([]);
    } else {
      await interaction.reply({
        content: "You need Administrator permission to use Twitch commands.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  await bot.executeInteraction(interaction);
});

async function run() {
  // The following syntax should be used in the commonjs environment
  //
  // await importx(__dirname + "/{events,commands}/**/*.{ts,js}");

  // The following syntax should be used in the ECMAScript environment
  await importx(`${dirname(import.meta.url)}/{events,commands}/**/*.{ts,js}`);
  startGithubWebhookServer();

  // Let's start the bot
  if (!process.env.BOT_TOKEN) {
    throw Error("Could not find BOT_TOKEN in your environment");
  }

  // Log in with your bot token
  await bot.login(process.env.BOT_TOKEN);
}

void run();
