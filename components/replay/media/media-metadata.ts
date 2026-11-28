import { parseMediaInfoDate } from './media-timing';

/** Reads the embedded recording date of a media file, if it has one. */
export async function readEmbeddedDateMs(file: File) {
  const { default: mediaInfoFactory } = await import('mediainfo.js');
  const mediaInfo = await mediaInfoFactory({
    format: 'object',
    locateFile: () => '/mediainfo/MediaInfoModule.wasm',
  });
  try {
    const result = await mediaInfo.analyzeData(
      file.size,
      async (size, offset) =>
        new Uint8Array(await file.slice(offset, offset + size).arrayBuffer()),
    );
    const general = result.media?.track.find(
      (track) => track['@type'] === 'General',
    );
    if (!general || general['@type'] !== 'General') return undefined;
    return (
      parseMediaInfoDate(general.Recorded_Date) ??
      parseMediaInfoDate(general.Encoded_Date) ??
      parseMediaInfoDate(general.Tagged_Date)
    );
  } finally {
    mediaInfo.close();
  }
}
