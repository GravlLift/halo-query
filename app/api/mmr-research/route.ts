import { BlobServiceClient } from '@azure/storage-blob';
import {
  MAX_FILE_BYTES,
  storeExport,
  validateExport,
  validateFilename,
} from '../../../lib/mmr-research/uploads';

export const runtime = 'nodejs';

function storageErrorCode(error: unknown) {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  if (
    'details' in error &&
    typeof error.details === 'object' &&
    error.details !== null &&
    'errorCode' in error.details &&
    typeof error.details.errorCode === 'string'
  ) {
    return error.details.errorCode;
  }
  return undefined;
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json(
      { error: 'Cross-origin uploads are not allowed.' },
      { status: 403 },
    );
  }
  if (request.headers.get('x-research-consent') !== 'true') {
    return Response.json(
      { error: 'Research contribution consent is required.' },
      { status: 400 },
    );
  }
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  ) {
    return Response.json({ error: 'Upload a JSON file.' }, { status: 415 });
  }
  const filename = request.headers.get('x-upload-filename') ?? '';
  let contents: string;
  try {
    validateFilename(filename);
    if (Number(request.headers.get('content-length')) > MAX_FILE_BYTES) {
      return Response.json(
        { error: 'Files must be no larger than 1 MB.' },
        { status: 413 },
      );
    }
    const reader = request.body?.getReader();
    if (!reader) throw new Error('File is empty.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_FILE_BYTES) {
          await reader.cancel();
          return Response.json(
            { error: 'Files must be no larger than 1 MB.' },
            { status: 413 },
          );
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    contents = new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    validateExport(contents);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Invalid export.' },
      { status: 400 },
    );
  }

  const connection = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connection) {
    return Response.json(
      { error: 'Research storage is not configured. Please try again later.' },
      { status: 503 },
    );
  }
  try {
    const container = BlobServiceClient.fromConnectionString(
      connection,
    ).getContainerClient(
      process.env.AZURE_MMR_STORAGE_CONTAINER_NAME || 'mmr-research',
    );
    await container.createIfNotExists();
    const result = await storeExport(
      {
        read: async (name) => {
          const blob = container.getBlockBlobClient(name);
          try {
            const properties = await blob.getProperties();
            if ((properties.contentLength ?? 0) > MAX_FILE_BYTES) return '';
            return (await blob.downloadToBuffer()).toString('utf8');
          } catch (error) {
            if (storageErrorCode(error) === 'BlobNotFound') return undefined;
            throw error;
          }
        },
        create: async (name, data) => {
          try {
            await container
              .getBlockBlobClient(name)
              .uploadData(Buffer.from(data, 'utf8'), {
                conditions: { ifNoneMatch: '*' },
                blobHTTPHeaders: {
                  blobContentType: 'application/json; charset=utf-8',
                },
              });
            return true;
          } catch (error) {
            const code = storageErrorCode(error);
            if (code === 'BlobAlreadyExists' || code === 'ConditionNotMet')
              return false;
            throw error;
          }
        },
      },
      filename,
      contents,
    );
    return Response.json(result);
  } catch (error) {
    console.error(
      'MMR research upload failed',
      error instanceof Error ? error.name : 'StorageError',
    );
    return Response.json(
      { error: 'Storage upload failed. Please retry this file.' },
      { status: 503 },
    );
  }
}
