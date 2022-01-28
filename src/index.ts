import fastify, { FastifyInstance, RouteShorthandOptions } from "fastify";
import { Server, IncomingMessage, ServerResponse } from "http";
import { config } from "dotenv";
import SpotifyWebApi from "spotify-web-api-node";

config();
if (
  !process.env.SPOTIFY_CLIENT_ID ||
  !process.env.SPOTIFY_CLIENT_SECRET ||
  !process.env.BASE_URL
) {
  console.error(
    "SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and BASE_URL must be set in .env"
  );
  process.exit(1);
}

const spotifyConfig = {
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: `${process.env.BASE_URL}/callback`,
};
const spotify = new SpotifyWebApi(spotifyConfig);

const server: FastifyInstance<Server, IncomingMessage, ServerResponse> =
  fastify({ logger: true });

interface CallBackQuery {
  code: string;
}

const opts: RouteShorthandOptions = {
  schema: {
    querystring: {
      type: "object",
      properties: {
        code: {
          type: "string",
        },
      },
    },
  },
};

server.get<{ Querystring: CallBackQuery }>("/", opts, async (req, res) => {
  res.redirect(
    spotify.createAuthorizeURL(
      [
        "user-read-private",
        "user-follow-modify",
        "user-follow-read",
        "user-library-modify",
        "user-library-read",
        "user-read-playback-position",
        "user-top-read",
        "user-read-recently-played",
        "playlist-modify-private",
        "playlist-read-collaborative",
        "playlist-read-private",
        "playlist-modify-public",
      ],
      "hi"
    )
  );
});

server.get<{ Querystring: CallBackQuery }>(
  "/callback",
  opts,
  async (req, res) => {
    try {
      // Creating new Spotify API instance just in case two users try at once. I am not sure if this is an issue, but I am too lazy to test it.
      const userSpotify = new SpotifyWebApi(spotifyConfig);

      const token = await userSpotify.authorizationCodeGrant(req.query.code);
      userSpotify.setAccessToken(token.body.access_token);

      const albums = await userSpotify.getMySavedAlbums();
      const artists = await userSpotify.getFollowedArtists();
      const shows = await userSpotify.getMySavedShows();
      const tracks = await userSpotify.getMySavedTracks();
      const playlists = await userSpotify.getUserPlaylists();

      if (albums.body.items.length > 0)
        await userSpotify.removeFromMySavedAlbums(
          albums.body.items.map((a) => a.album.id)
        );
      if (artists.body.artists.items.length > 0)
        await userSpotify.unfollowArtists(
          artists.body.artists.items.map((a) => a.id)
        );
      if (shows.body.items.length > 0)
        await userSpotify.removeFromMySavedShows(
          shows.body.items.map((a) => a.show.id)
        );
      if (tracks.body.items.length > 0)
        await userSpotify.removeFromMySavedTracks(
          tracks.body.items.map((a) => a.track.id)
        );
      for (const p of playlists.body.items) {
        await userSpotify.unfollowPlaylist(p.id);
      }

      res.send({
        status: `Spotify account cleaned! Removed: ${albums.body.items.length} albums, ${artists.body.artists.items.length} artists, ${shows.body.items.length} shows, ${tracks.body.items.length} tracks, ${playlists.body.items.length} playlists.`,
      });
    } catch (err) {
      console.log(err);
      res
        .code(500)
        .send({ status: "An error occurred while cleaning Spotify account." });
    }
  }
);

server.listen(8080, "0.0.0.0", (err) => {
  if (err) {
    console.log(err);
    process.exit(1);
  }
});
