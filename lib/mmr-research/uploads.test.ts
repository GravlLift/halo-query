/** @jest-environment node */
import {
  storeExport,
  validateExport,
  validateFilename,
  ExportStore,
} from './uploads';
import { POST } from '../../app/api/mmr-research/route';

const mockBlobs = new Map<string, string>();
let mockStorageFailure = false;
let mockDetailedErrors = true;
const mockConditions: unknown[] = [];
function mockStorageError(code: string) {
  return mockDetailedErrors ? { details: { errorCode: code } } : { code };
}
jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: () => ({
      getContainerClient: () => ({
        createIfNotExists: async () => {
          if (mockStorageFailure) throw new Error('Unavailable');
        },
        getBlockBlobClient: (name: string) => ({
          getProperties: async () => {
            const contents = mockBlobs.get(name);
            if (contents === undefined) throw mockStorageError('BlobNotFound');
            return { contentLength: Buffer.byteLength(contents) };
          },
          downloadToBuffer: async () => Buffer.from(mockBlobs.get(name) ?? ''),
          uploadData: async (contents: Buffer, options: unknown) => {
            if (mockBlobs.has(name))
              throw mockStorageError('BlobAlreadyExists');
            mockConditions.push(options);
            mockBlobs.set(name, contents.toString('utf8'));
          },
        }),
      }),
    }),
  },
}));

const match = {
  key: 'match',
  match_id: 'match',
  game_session: null,
  owner: null,
  first_seen: '2026-11-18T04:15:38.263Z',
  last_seen: '2026-11-18T04:21:44.198Z',
  states: 1,
  players: {
    '2533274806397442': {
      gamertag: null,
      mmr: [{ at: '2026-11-18T04:15:38.263Z', state: 0, value: null }],
      team: [],
      mmr_when_teamed: null,
      party: null,
      leader: false,
      first_state: 0,
      last_state: 0,
      states: 1,
      xbox: null,
    },
  },
};

function memoryStore() {
  const blobs = new Map<string, string>();
  const store: ExportStore = {
    read: async (filename) => blobs.get(filename),
    create: async (filename, contents) => {
      if (blobs.has(filename)) return false;
      blobs.set(filename, contents);
      return true;
    },
  };
  return { store, blobs };
}

test('accepts nullable export data and optional setup', () => {
  expect(validateExport(JSON.stringify(match))).toEqual(match);
});

test('rejects malformed JSON, unrelated data and invalid nested values', () => {
  expect(() => validateExport('{')).toThrow('valid JSON');
  expect(() => validateExport('{}')).toThrow('match.key');
  const player = match.players['2533274806397442'];
  expect(() =>
    validateExport(
      JSON.stringify({
        ...match,
        players: {
          '1': {
            ...player,
            mmr: [{ at: match.first_seen, state: 0, value: 'bad' }],
          },
        },
      }),
    ),
  ).toThrow('value');
  expect(() =>
    validateExport(JSON.stringify({ ...match, token: 'not an export' })),
  ).toThrow('not an export field');
});

test('rejects unsafe filenames', () => {
  for (const filename of ['../match.json', 'match.txt', 'a/b.json'])
    expect(() => validateFilename(filename)).toThrow();
});

test('uploads, skips equivalent JSON and versions changed contents', async () => {
  const { store, blobs } = memoryStore();
  const contents = JSON.stringify(match);
  expect(await storeExport(store, 'match.json', contents)).toEqual({
    status: 'uploaded',
    filename: 'match.json',
  });
  expect(
    await storeExport(store, 'match.json', JSON.stringify(match, null, 2)),
  ).toEqual({ status: 'skipped', filename: 'match.json' });
  const changed = JSON.stringify({ ...match, states: 2 });
  expect(await storeExport(store, 'match.json', changed)).toEqual({
    status: 'uploaded',
    filename: 'match (2).json',
  });
  expect(await storeExport(store, 'match.json', changed)).toEqual({
    status: 'skipped',
    filename: 'match (2).json',
  });
  expect(
    await storeExport(
      store,
      'match.json',
      JSON.stringify({ ...match, states: 3 }),
    ),
  ).toEqual({ status: 'uploaded', filename: 'match (3).json' });
  expect(blobs.get('match.json')).toBe(contents);
});

test('concurrent identical uploads do not overwrite or create versions', async () => {
  const { store, blobs } = memoryStore();
  const results = await Promise.all([
    storeExport(store, 'match.json', JSON.stringify(match)),
    storeExport(store, 'match.json', JSON.stringify(match)),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([
    'skipped',
    'uploaded',
  ]);
  expect(blobs.size).toBe(1);
});

test('concurrent different uploads are both preserved', async () => {
  const { store, blobs } = memoryStore();
  await Promise.all([
    storeExport(store, 'match.json', JSON.stringify(match)),
    storeExport(store, 'match.json', JSON.stringify({ ...match, states: 2 })),
  ]);
  expect([...blobs.keys()]).toEqual(['match.json', 'match (2).json']);
});

test('storage errors propagate and invalid files never write', async () => {
  const { store, blobs } = memoryStore();
  await expect(storeExport(store, 'match.json', '{}')).rejects.toThrow();
  expect(blobs.size).toBe(0);
  await expect(
    storeExport(
      {
        ...store,
        read: async () => {
          throw new Error('Unavailable');
        },
      },
      'match.json',
      JSON.stringify(match),
    ),
  ).rejects.toThrow('Unavailable');
});

describe('upload endpoint', () => {
  const originalConnection = process.env.AZURE_STORAGE_CONNECTION_STRING;
  beforeEach(() => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'test-connection';
    mockBlobs.clear();
    mockConditions.length = 0;
    mockStorageFailure = false;
    mockDetailedErrors = true;
  });
  afterAll(() => {
    if (originalConnection === undefined)
      delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    else process.env.AZURE_STORAGE_CONNECTION_STRING = originalConnection;
  });

  function request(
    contents = JSON.stringify(match),
    headers: Record<string, string> = {},
  ) {
    return new Request('http://localhost/api/mmr-research', {
      method: 'POST',
      body: contents,
      headers: {
        'content-type': 'application/json',
        'x-upload-filename': 'match.json',
        'x-research-consent': 'true',
        ...headers,
      },
    });
  }

  test.each([true, false])(
    'uploads and skips duplicates with detailed Azure errors: %s',
    async (detailed) => {
      mockDetailedErrors = detailed;
      const contents = JSON.stringify(match, null, 2);
      expect(await (await POST(request(contents))).json()).toEqual({
        status: 'uploaded',
        filename: 'match.json',
      });
      expect(mockBlobs.get('match.json')).toBe(contents);
      expect(mockConditions).toEqual([
        {
          conditions: { ifNoneMatch: '*' },
          blobHTTPHeaders: {
            blobContentType: 'application/json; charset=utf-8',
          },
        },
      ]);
      expect(await (await POST(request())).json()).toEqual({
        status: 'skipped',
        filename: 'match.json',
      });
      expect(
        await (
          await POST(request(JSON.stringify({ ...match, states: 2 })))
        ).json(),
      ).toEqual({ status: 'uploaded', filename: 'match (2).json' });
    },
  );

  test.each([true, false])(
    'handles simultaneous writes with detailed Azure errors: %s',
    async (detailed) => {
      mockDetailedErrors = detailed;
      const responses = await Promise.all([POST(request()), POST(request())]);
      const results = await Promise.all(
        responses.map((response) => response.json()),
      );
      expect(results.map((result) => result.status).sort()).toEqual([
        'skipped',
        'uploaded',
      ]);
      expect(mockBlobs.size).toBe(1);
    },
  );

  test('rejects malformed exports, unsafe filenames, missing consent and cross-origin requests', async () => {
    expect((await POST(request('{}'))).status).toBe(400);
    expect((await POST(request('bad json'))).status).toBe(400);
    expect(
      (await POST(request(undefined, { 'x-upload-filename': '../match.json' })))
        .status,
    ).toBe(400);
    expect(
      (await POST(request(undefined, { 'x-research-consent': '' }))).status,
    ).toBe(400);
    expect(
      (await POST(request(undefined, { origin: 'https://other.example' })))
        .status,
    ).toBe(403);
    expect(
      (await POST(request(undefined, { 'content-type': 'text/plain' }))).status,
    ).toBe(415);
    expect(mockBlobs.size).toBe(0);
  });

  test('enforces file size with and without content-length', async () => {
    expect((await POST(request(' '.repeat(1024 * 1024 + 1)))).status).toBe(413);
    expect(
      (await POST(request(undefined, { 'content-length': '1048577' }))).status,
    ).toBe(413);
    expect(mockBlobs.size).toBe(0);
  });

  test('reports unavailable storage without leaking credentials', async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    expect((await POST(request())).status).toBe(503);
    process.env.AZURE_STORAGE_CONNECTION_STRING = 'test-connection';
    mockStorageFailure = true;
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await POST(request());
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('test-connection');
    } finally {
      log.mockRestore();
    }
  });
});
