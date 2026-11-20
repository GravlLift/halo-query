import type {
  FilmCoordinatesData,
  JsonValue,
} from '@gravllift/halo-helpers/film-data';
import { field, number } from './film-json';

export function normalizedPoint(
  coordinates: FilmCoordinatesData | null,
  value: JsonValue | undefined,
): { x: number; y: number } | undefined {
  const horizontal = number(field(value, 'x'));
  const vertical = number(field(value, 'y'));
  if (
    !coordinates ||
    coordinates.scale_x === 0 ||
    coordinates.scale_y === 0 ||
    horizontal === undefined ||
    vertical === undefined
  )
    return undefined;
  return {
    x: (vertical - coordinates.offset_y) / coordinates.scale_y / 32768,
    y: (coordinates.offset_x - horizontal) / coordinates.scale_x / 32768,
  };
}
