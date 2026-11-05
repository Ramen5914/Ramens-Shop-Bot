import { ChannelType } from "discord.js";
import { eq } from "drizzle-orm";
import { minecraftModsTable } from "../db/schema.js";
import { logger } from "../logger.js";
import { bot, db } from "../main.js";
import { buildModInfoMessage } from "../utils/modMessage.js";

let timer: ReturnType<typeof setTimeout> | undefined;
const halfHourMs = 30 * 60 * 1000;

export async function refreshMinecraftModsMessage(): Promise<void> {
  const mods = await db.select().from(minecraftModsTable);

  for (const mod of mods) {
    await refreshSingleModMessage(mod);
  }

  logger.info(
    { minecraftMods: mods.length },
    "Refreshing Minecraft mods message",
  );
}

export async function refreshSingleModMessage(
  mod: typeof minecraftModsTable.$inferSelect,
): Promise<void> {
  const embed = await buildModInfoMessage(mod);
  const channel = await bot.channels.fetch(mod.infoChannel);

  if (
    !channel ||
    (channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement)
  ) {
    throw new Error(`Invalid Minecraft mod info channel: ${mod.infoChannel}`);
  }

  if (mod.infoMessageId) {
    const message = await channel.messages.fetch(mod.infoMessageId);
    await message.edit({ embeds: [embed] });
    return;
  }

  const message = await channel.send({ embeds: [embed] });

  await db
    .update(minecraftModsTable)
    .set({ infoMessageId: message.id })
    .where(eq(minecraftModsTable.id, mod.id));
}

export function startMinecraftModsScheduler(): void {
  if (timer) return;

  scheduleNextRefresh();
}

function scheduleNextRefresh(): void {
  const now = new Date();
  const nextRefresh = new Date(now);
  nextRefresh.setSeconds(0, 0);
  nextRefresh.setMinutes(now.getMinutes() < 30 ? 30 : 60);

  timer = setTimeout(
    async () => {
      timer = undefined;

      try {
        await refreshMinecraftModsMessage();
      } catch (error) {
        logger.error({ error }, "Failed to refresh Minecraft mods message");
      } finally {
        scheduleNextRefresh();
      }
    },
    nextRefresh.getTime() - now.getTime() || halfHourMs,
  );
}
