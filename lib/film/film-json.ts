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

export function tagNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === 'string' && /^[\da-f]{8}$/i.test(value)
    ? Number.parseInt(value, 16)
    : undefined;
}

export function eventOfType(
  value: JsonValue | undefined,
  type: string,
): JsonValue | undefined {
  return field(value, 'type') === type ? value : undefined;
}

export function items(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}
