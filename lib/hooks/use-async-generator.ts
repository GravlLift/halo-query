import { DependencyList, useEffect, useMemo, useState } from 'react';

export function useAsyncGenerator<T, TGenerator extends AsyncGenerator<T>>(
  factory: () => TGenerator,
  deps: DependencyList
) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<T[]>([]);
  const [error, setError] = useState<unknown | undefined>();
  const generator = useMemo(factory, [...deps, factory]);
  useEffect(() => {
    async function run() {
      setLoading(true);
      setResults([]);
      try {
        for await (const result of generator) {
          setResults((r) => [...r, result]);
        }
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [generator]);
  return { loading, results, error };
}
