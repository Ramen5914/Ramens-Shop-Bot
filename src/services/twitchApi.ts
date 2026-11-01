import { ApiClient } from "@twurple/api";
import { AppTokenAuthProvider } from "@twurple/auth";

const clientId = process.env.TWITCH_CLIENT_ID;
const clientSecret = process.env.TWITCH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  throw new Error("Missing Twitch API credentials");
}

export const twitchApi = new ApiClient({
  authProvider: new AppTokenAuthProvider(clientId, clientSecret),
});
