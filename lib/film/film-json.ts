import type { JsonValue } from '@gravllift/halo-helpers/film-data';

export function field(
  value: JsonValue | undefined,
  key: string,
): JsonValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value[key]
    : undefined;
}

export function number(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

export function items(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}
