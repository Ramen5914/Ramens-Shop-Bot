# Copilot instructions

## Project commands

- Install dependencies with `bun install`.
- Run the bot from TypeScript during development with `bun run dev`.
- Build TypeScript into `build/` with `bun run build`.
- Run the compiled bot with `bun run start`.
- Start the production container with `docker compose up -d`; stop it with `docker compose down`; inspect logs with `docker compose logs`.
- Run the repository formatter/linter with `bunx @biomejs/biome check --no-errors-on-unmatched --files-ignore-unknown=true .`. Lefthook runs the same check on staged files before commits (and can write fixes) and on pushed files before pushes.
- There is currently no test runner, test script, or test suite, so there is no single-test command. Do not invent a test command unless a test framework is added.

## Architecture

- This is an ESM TypeScript Discord bot built with `discord.js` and `discordx`. `src/main.ts` constructs the Discord client, configures intents and the `!` simple-command prefix, dynamically imports `src/events` and `src/commands`, synchronizes application commands on `ClientReady`, and routes interactions/messages to discordx.
- Decorators are the registration mechanism. New command/event modules under `src/commands` or `src/events` are discovered by the `importx` glob; they do not need a central registry or manual import. Existing starter/example modules also register real Discord commands, so account for or remove them when changing the command surface.
- Twitch integration has two paths. `src/services/twitchApi.ts` exports a shared Twurple `ApiClient` used by the Twitch test command; `src/services/twitchNotifications.ts` creates the EventSub client and manages SQLite-backed streamer subscriptions and the global notification channel.
- `src/utils/twitchMessage.ts` is the shared presentation boundary for Twitch notifications. Both the background notifier and `/twitch-test` should use `buildTwitchLiveMessage` rather than duplicating embed/content construction.
- `BOT_TOKEN`, `TWITCH_CLIENT_ID`, and `TWITCH_CLIENT_SECRET` are required at runtime. Missing credentials fail startup/module initialization; Docker passes them through from the host environment.

## Repository conventions

- Keep source imports ESM-compatible and include `.js` extensions in local imports; this is required by the `NodeNext` module configuration and works with both `tsx` and compiled output.
- Use `discordx` decorators (`@Discord`, `@Slash`, `@SlashOption`, `@On`, etc.) and Discord.js interaction types for handlers. Slash handlers generally validate context, defer when calling external APIs, then edit or follow up the response.
- Use tabs and double-quoted JavaScript/TypeScript strings. Biome is the formatter and linter, with the recommended lint preset and import organization enabled.
- Keep external API access behind service modules and keep Discord message formatting in the Twitch message utility. Normalize Twitch logins with trim/lowercase before API calls or map keys, and avoid allowing user input to become a Discord mention (`allowedMentions` is disabled for Twitch notifications).
- Application commands are synchronized to the bot's single guild in `ClientReady`; avoid adding separate registration code unless the deployment model is intentionally changed.
