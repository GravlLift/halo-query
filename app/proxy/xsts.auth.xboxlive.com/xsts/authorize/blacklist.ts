import { BlobServiceClient } from '@azure/storage-blob';
/**
 * Simple in-memory cache
 */
let cachedData: unknown = null;
let lastFetched: number | null = null;

// Fetch the blob from Azure Blob Storage
async function fetchFromAzure(): Promise<unknown> {
  if (
    !process.env.AZURE_STORAGE_CONNECTION_STRING ||
    !process.env.AZURE_STORAGE_CONTAINER_NAME
  ) {
    return null;
  }

  const downloadBlockBlobResponse =
    await BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING
    )
      .getContainerClient(process.env.AZURE_STORAGE_CONTAINER_NAME)
      .getBlobClient('black-list.json')
      .download();
  const text = await streamToString(
    downloadBlockBlobResponse.readableStreamBody!
  );
  return JSON.parse(text);
}

// Utility to convert a stream to text
async function streamToString(
  readableStream: NodeJS.ReadableStream
): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of readableStream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Main function: returns the cached data if it's less than 24h old,
 * otherwise refreshes it from Azure Blob.
 */
async function getJsonData(): Promise<unknown> {
  const oneDayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (cachedData && lastFetched && now - lastFetched < oneDayMs) {
    return cachedData;
  }

  const data = await fetchFromAzure();
  cachedData = data;
  lastFetched = now;
  return data;
}

export async function getBlackListEntry(xuid: string): Promise<{
  gamertag?: string;
  matchId?: string;
  reason?: string;
} | null> {
  const data = await getJsonData();
  if (data == null || typeof data !== 'object') {
    return null;
  }

  const entry = (
    data as Record<
      string,
      | {
          gamertag?: string;
          matchId?: string;
          reason?: string;
        }
      | undefined
    >
  )[xuid];

  return entry || null;
}
