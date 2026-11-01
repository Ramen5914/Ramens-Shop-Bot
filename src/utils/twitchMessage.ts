import { EmbedBuilder } from "discord.js";

export interface TwitchLiveMessageData {
	login: string;
	displayName: string;
	message?: string;
	title: string;
	gameName?: string;
	imageUrl?: string;
}

export function buildTwitchLiveMessage(data: TwitchLiveMessageData) {
	const streamUrl = `https://www.twitch.tv/${data.login}`;

	const embed = new EmbedBuilder()
		.setColor(0x9146ff)
		.setAuthor({ name: `${data.displayName} is live!` })
		.setTitle((data.title || "Watch live on Twitch").slice(0, 256))
		.setURL(streamUrl)
		.addFields({
			name: "Category",
			value: data.gameName || "Not specified",
			inline: true,
		})
		.setTimestamp();

	if (data.imageUrl) {
		embed.setImage(data.imageUrl);
	}

	return {
		content: data.message || `${data.displayName} just went live! ${streamUrl}`,
		embeds: [embed],
		allowedMentions: { parse: [] as never[] },
	};
}
