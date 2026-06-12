import { Playlist } from 'halo-infinite-api';
import { after, NextRequest } from 'next/server';
import { setPlaylistAsset } from '@gravllift/halo-helpers';
import { proxyFetch } from '../../../../../../../proxyRoute';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ playlistAssetFilename: string }> }
) {
  const params = await context.params;
  // Proxy request with fetch to the target URL
  const target = new URL(
    `https://gamecms-hacs.svc.halowaypoint.com/hi/multiplayer/file/playlists/assets/${params.playlistAssetFilename}${request.nextUrl.search}`
  );

  const response = await proxyFetch(target, request);

  if (response.ok) {
    const cloneResponse = response.clone();
    after(async () => {
      const body: Playlist = await cloneResponse.json();
      if (body.HasCsr) {
        await setPlaylistAsset(
          params.playlistAssetFilename.replace(/\.json$/i, ''),
          body
        );
      }
    });
  }
  return response;
}
