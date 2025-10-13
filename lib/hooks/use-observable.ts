import { useState, useEffect } from 'react';
import { EMPTY, Observable } from 'rxjs';

export function useObservable<T>(
  observable: Observable<T> | undefined,
  initialValue: T
) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    const subscription = (observable ?? EMPTY).subscribe((value) => {
      setValue(value);
    });
    return () => subscription.unsubscribe();
  }, [observable]);
  return value;
}
