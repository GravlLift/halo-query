import { useCallback, useEffect, useState } from 'react';

const roundOffset = (value: number) => Math.round(value * 100) / 100;

export const offsetStorageKey = (matchId: string, sourceKey: string) =>
  `halo-query:media-offset:${matchId}:${sourceKey}`;

export function readSavedOffset(key: string) {
  try {
    const saved = localStorage.getItem(key);
    if (saved === null) return undefined;
    const value = Number(saved);
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Offset state for one media item, persisted to localStorage under `storageKey`. */
export function useMediaOffset(storageKey: string) {
  const [offset, setOffset] = useState<number>();
  const [offsetText, setOffsetText] = useState('');

  const applyOffset = useCallback((next: number) => {
    const rounded = roundOffset(next);
    setOffset(rounded);
    setOffsetText(rounded.toFixed(2));
  }, []);

  /** Applies the saved offset if one exists, otherwise the computed fallback. */
  const restoreOrApply = useCallback(
    async (fallback: () => number | Promise<number>) => {
      const saved = readSavedOffset(storageKey);
      applyOffset(saved ?? (await fallback()));
    },
    [storageKey, applyOffset],
  );

  const onOffsetInput = useCallback(
    ({ value, valueAsNumber }: { value: string; valueAsNumber: number }) => {
      setOffsetText(value);
      if (Number.isFinite(valueAsNumber)) setOffset(roundOffset(valueAsNumber));
    },
    [],
  );

  useEffect(() => {
    if (offset === undefined) return;
    try {
      localStorage.setItem(storageKey, String(offset));
    } catch {
      // Storage may be full or disabled; the offset still works for this session.
    }
  }, [storageKey, offset]);

  return { offset, offsetText, applyOffset, restoreOrApply, onOffsetInput };
}
