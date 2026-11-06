import { Events } from "discord.js";
import { type ArgsOf, Discord, On } from "discordx";
import { handleVoiceStateUpdate } from "@/services/voiceChat.js";

@Discord()
export class VoiceChat {
  @On({ event: Events.VoiceStateUpdate })
  async handleVoiceChat([
    oldState,
    newState,
  ]: ArgsOf<Events.VoiceStateUpdate>): Promise<void> {
    await handleVoiceStateUpdate(oldState, newState);
  }
}
