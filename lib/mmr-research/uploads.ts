import isEqual from 'lodash/isEqual';

export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_BATCH_FILES = 100;

type Field = { accepts: (value: unknown) => boolean; optional?: boolean };
const text = (value: unknown) => typeof value === 'string';
const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value);
const uint = (value: unknown) =>
  number(value) &&
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 4294967295;
const boolean = (value: unknown) => typeof value === 'boolean';
const timestamp = (value: unknown) =>
  text(value) &&
  typeof value === 'string' &&
  (value === '' ||
    (/^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))));
const nullable = (accepts: Field['accepts']) => (value: unknown) =>
  value === null || accepts(value);

function fields(value: unknown, schema: Record<string, Field>, path: string) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  const entries = Object.entries(value);
  for (const [name] of entries) {
    if (!Object.hasOwn(schema, name))
      throw new Error(`${path}.${name} is not an export field.`);
  }
  for (const [name, field] of Object.entries(schema)) {
    const entry = entries.find(([key]) => key === name);
    if (!entry && field.optional) continue;
    if (!entry || !field.accepts(entry[1]))
      throw new Error(`${path}.${name} is missing or invalid.`);
  }
  return true;
}

function history(value: unknown, accepts: Field['accepts'], path: string) {
  if (!Array.isArray(value)) return false;
  return value.every((mark, index) =>
    fields(
      mark,
      {
        at: { accepts: timestamp },
        state: { accepts: uint },
        value: { accepts: nullable(accepts) },
      },
      `${path}[${index}]`,
    ),
  );
}

function players(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  return Object.entries(value).every(([xuid, player]) => {
    if (!/^\d+$/.test(xuid) || BigInt(xuid) > 18446744073709551615n)
      throw new Error('players must be keyed by Xbox user IDs.');
    const path = `players.${xuid}`;
    return fields(
      player,
      {
        gamertag: { accepts: nullable(text) },
        mmr: { accepts: (value) => history(value, number, `${path}.mmr`) },
        team: {
          accepts: (value) =>
            history(
              value,
              (value) =>
                uint(value) && typeof value === 'number' && value <= 65535,
              `${path}.team`,
            ),
        },
        mmr_when_teamed: { accepts: nullable(number) },
        party: { accepts: nullable(text) },
        leader: { accepts: boolean },
        first_state: { accepts: nullable(uint) },
        last_state: { accepts: nullable(uint) },
        states: { accepts: uint },
        xbox: {
          accepts: (value) =>
            value === null ||
            fields(
              value,
              {
                mmr: { accepts: nullable(number) },
                team_balance_mmr: { accepts: nullable(number) },
                initial_team: { accepts: nullable(text) },
              },
              `${path}.xbox`,
            ),
        },
        left_at: { accepts: nullable(timestamp), optional: true },
      },
      path,
    );
  });
}

export function validateExport(contents: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  fields(
    value,
    {
      key: { accepts: (value) => text(value) && value !== '' },
      match_id: { accepts: nullable(text) },
      game_session: { accepts: nullable(text) },
      owner: {
        accepts: nullable(
          (value) =>
            typeof value === 'number' &&
            Number.isInteger(value) &&
            value >= 0 &&
            value < 18446744073709551616,
        ),
      },
      first_seen: { accepts: timestamp },
      last_seen: { accepts: timestamp },
      states: { accepts: uint },
      players: { accepts: players },
      setup: {
        optional: true,
        accepts: (value) =>
          fields(
            value,
            {
              experience: { accepts: nullable(text), optional: true },
              ranked: { accepts: nullable(boolean), optional: true },
              playlist: { accepts: nullable(text), optional: true },
              mode: { accepts: nullable(text), optional: true },
              map: { accepts: nullable(text), optional: true },
              pair: { accepts: nullable(text), optional: true },
              named: {
                optional: true,
                accepts: (value) =>
                  fields(
                    value,
                    {
                      playlist: { accepts: nullable(text), optional: true },
                      mode: { accepts: nullable(text), optional: true },
                      map: { accepts: nullable(text), optional: true },
                    },
                    'setup.named',
                  ),
              },
            },
            'setup',
          ),
      },
    },
    'match',
  );
  return value;
}

export function validateFilename(filename: string) {
  if (
    filename.length > 160 ||
    !/^[a-zA-Z0-9_-]+(?: \([1-9]\d*\))?\.json$/i.test(filename)
  ) {
    throw new Error(
      'Use an export filename ending in .json, without paths or special characters.',
    );
  }
}

export interface ExportStore {
  read: (filename: string) => Promise<string | undefined>;
  create: (filename: string, contents: string) => Promise<boolean>;
}

export async function storeExport(
  store: ExportStore,
  filename: string,
  contents: string,
) {
  validateFilename(filename);
  const parsed = validateExport(contents);
  const stem = filename.slice(0, -5).replace(/ \(\d+\)$/, '');
  for (let version = 1; version <= 1000; version++) {
    const candidate = version === 1 ? filename : `${stem} (${version}).json`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await store.read(candidate);
      if (existing !== undefined) {
        let matches = existing === contents;
        if (!matches) {
          try {
            matches = isEqual(JSON.parse(existing), parsed);
          } catch {
            matches = false;
          }
        }
        if (matches) return { status: 'skipped', filename: candidate };
        break;
      }
      if (await store.create(candidate, contents))
        return { status: 'uploaded', filename: candidate };
      if (attempt === 2) throw new Error('Upload collision; please retry.');
    }
  }
  throw new Error('Too many versions of this filename.');
}
