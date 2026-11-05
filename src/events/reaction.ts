import type { MessageReaction } from "discord.js";
import { Discord, Reaction } from "discordx";

@Discord()
export class Reactions {
  @Reaction({ emoji: "pushpin", remove: true })
  async pin(reaction: MessageReaction): Promise<void> {
    await reaction.message.pin();
  }
}
