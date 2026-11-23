export const runtime = 'nodejs';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const VIDEOS_URL = 'https://api.twitch.tv/helix/videos';

let appToken: { value: string; expiresAt: number } | undefined;

async function getAppToken(clientId: string, clientSecret: string) {
  if (appToken && appToken.expiresAt > Date.now()) return appToken.value;
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  if (!response.ok) throw new Error(`Twitch auth failed (${response.status})`);
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('access_token' in body) ||
    typeof body.access_token !== 'string' ||
    !('expires_in' in body) ||
    typeof body.expires_in !== 'number'
  )
    throw new Error('Unexpected Twitch auth response');
  // Refresh a minute early so in-flight requests don't use an expiring token.
  appToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in - 60) * 1000,
  };
  return appToken.value;
}

function readVideo(body: unknown) {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('data' in body) ||
    !Array.isArray(body.data)
  )
    return undefined;
  const video: unknown = body.data[0];
  if (
    typeof video !== 'object' ||
    video === null ||
    !('created_at' in video) ||
    typeof video.created_at !== 'string' ||
    !('duration' in video) ||
    typeof video.duration !== 'string' ||
    !('type' in video) ||
    typeof video.type !== 'string'
  )
    return undefined;
  return {
    createdAt: video.created_at,
    duration: video.duration,
    type: video.type,
    title:
      'title' in video && typeof video.title === 'string'
        ? video.title
        : undefined,
    userName:
      'user_name' in video && typeof video.user_name === 'string'
        ? video.user_name
        : undefined,
  };
}

/** Returns Helix metadata for a Twitch VOD so the client can align it by broadcast time. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^\d{1,20}$/.test(id))
    return Response.json({ error: 'Invalid video id.' }, { status: 400 });
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return Response.json(
      { error: 'Twitch lookups are not configured.' },
      { status: 503 },
    );
  try {
    const lookup = async () =>
      fetch(`${VIDEOS_URL}?id=${id}`, {
        headers: {
          'Client-Id': clientId,
          Authorization: `Bearer ${await getAppToken(clientId, clientSecret)}`,
        },
      });
    let response = await lookup();
    if (response.status === 401) {
      appToken = undefined;
      response = await lookup();
    }
    if (response.status === 404 || response.status === 400)
      return Response.json({ error: 'Video not found.' }, { status: 404 });
    if (!response.ok)
      return Response.json(
        { error: `Twitch lookup failed (${response.status}).` },
        { status: 502 },
      );
    const video = readVideo(await response.json());
    if (!video)
      return Response.json({ error: 'Video not found.' }, { status: 404 });
    return Response.json(video, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return Response.json({ error: 'Twitch lookup failed.' }, { status: 502 });
  }
}
