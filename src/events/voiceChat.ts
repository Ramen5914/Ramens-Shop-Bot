import { Events } from "discord.js";
import { type ArgsOf, type Client, Discord, On } from "discordx";

@Discord()
export class VoiceChat {
  @On({ event: Events.VoiceStateUpdate })
  joinVoiceChat(
    [oldState, newState]: ArgsOf<Events.VoiceStateUpdate>,
    _client: Client,
  ) {
    if (oldState.channelId === null && newState.channelId !== null) {
      console.log(
        `${newState.member?.user.tag ?? newState.id} joined a voice channel`,
      );
    }
  }
}
