import { dirname, importx } from "@discordx/importer";
import {
  Events,
  IntentsBitField,
  type Interaction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Client } from "discordx";
import { startTwitchNotifications } from "./services/twitchNotifications.js";

export const bot = new Client({
  // This bot is deployed to one server, so keep commands guild-scoped.
  botGuilds: [(client) => client.guilds.cache.map((guild) => guild.id)],

  // Discord intents
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildVoiceStates,
  ],

  // Debug logs are disabled in silent mode
  silent: false,
});

bot.once(Events.ClientReady, async () => {
  // Make sure all guilds are cached
  // await bot.guilds.fetch();

  // Synchronize applications commands with Discord
  const guildIds = bot.guilds.cache.map((guild) => guild.id);
  await bot.clearApplicationCommands(...guildIds);
  await bot.clearApplicationCommands();
  await bot.initApplicationCommands();

  await startTwitchNotifications(bot);

  // To clear all guild commands, uncomment this line,
  // This is useful when moving from guild commands to global commands
  // It must only be executed once
  //
  // await bot.clearApplicationCommands(...bot.guilds.cache.map((g) => g.id));

  console.log("Bot started");
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

  // Let's start the bot
  if (!process.env.BOT_TOKEN) {
    throw Error("Could not find BOT_TOKEN in your environment");
  }

  // Log in with your bot token
  await bot.login(process.env.BOT_TOKEN);
}

void run();
