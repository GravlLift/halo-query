// Lifted from https://github.com/juliencrn/usehooks-ts
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react';

import { useEventListener } from 'usehooks-ts';
import { localStorageEvent } from '../local-storage/event-based-localstorage';

export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [isReady, setIsReady] = useState(false);
  // Get from local storage then
  // parse stored json or return initialValue
  const readValue = useCallback((): T => {
    setIsReady(true);
    // Prevent build error "window is undefined" but keeps working
    if (typeof window === 'undefined') {
      return defaultValue;
    }

    try {
      const item = localStorageEvent.getItem(key);
      return item ? (parseJSON(item) as T) : defaultValue;
    } catch (error) {
      console.warn(`Error reading localStorage key “${key}”:`, error);
      return defaultValue;
    }
  }, [defaultValue, key]);

  const [stateValue, setStateValue] = useState<T>(defaultValue);

  // Read value from local storage on hook mount
  useEffect(() => {
    setStateValue(readValue);
  }, [readValue]);

  const setValue = useCallback(
    (v: SetStateAction<T>) => {
      if (v instanceof Function) {
        const oldValue = readValue();
        const newValue = v(oldValue);
        localStorageEvent.setItem(key, JSON.stringify(newValue));
      } else {
        localStorageEvent.setItem(key, JSON.stringify(v));
      }

      setStateValue(v);
    },
    [key, readValue]
  );

  return [stateValue, setValue, isReady];
}

// A wrapper for "JSON.parse()"" to support "undefined" value
function parseJSON<T>(value: string | null): T | undefined {
  try {
    return value === 'undefined' ? undefined : JSON.parse(value ?? '');
  } catch {
    console.log('parsing error on', { value });
    return undefined;
  }
}

type Value<T> = T | null | undefined;
// undefined means not loaded yet
// null means no value
export function useReadLocalStorage<T>(key: string): Value<T> {
  // Get from local storage then
  // parse stored json or return initialValue
  const readValue = useCallback((): Value<T> => {
    // Prevent build error "window is undefined" but keep keep working
    if (typeof window === 'undefined') {
      return undefined;
    }

    try {
      const item = localStorageEvent.getItem(key);
      return item ? (JSON.parse(item) as T) : null;
    } catch (error) {
      console.warn(`Error reading localStorage key “${key}”:`, error);
      return null;
    }
  }, [key]);

  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState<Value<T>>(undefined);

  useEffect(() => {
    // Load initial value from local storage
    setStoredValue(readValue());
  }, [readValue]);

  // Listen if localStorage changes
  const handleStorageChange = useCallback(
    (event: StorageEvent | CustomEvent) => {
      if ((event as StorageEvent)?.key && (event as StorageEvent).key !== key) {
        return;
      }
      setStoredValue(readValue());
    },
    [key, readValue]
  );

  // this only works for other documents, not the current one
  useEventListener('storage', handleStorageChange);

  // this is a custom event, triggered by the wrapped "setItem" method
  // at the head of this file
  useEventListener('local-storage', handleStorageChange);

  return storedValue;
}
