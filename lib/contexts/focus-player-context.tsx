'use client';
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

interface FocusPlayerContextValue {
  focusPlayer: string | null | undefined;
  setFocusPlayer: (player: string | null) => void;
}

const FocusPlayerContext = createContext<FocusPlayerContextValue | null>(null);

export function useFocusPlayer() {
  const context = useContext(FocusPlayerContext);
  if (!context) {
    throw new Error('useFocusPlayer must be used within a FocusPlayerProvider');
  }
  return context;
}

/**
 * FocusPlayerProvider semantics:
 * 1. On initial application load, if a focus player exists in localStorage it is used immediately (no flash of null).
 * 2. Any page-level component (player-profile / leaderboard / matches) calling setFocusPlayer(gamertag) overrides the stored value.
 * 3. Home page clears the focus player by calling setFocusPlayer(null).
 *
 * Previous implementation used a generic useLocalStorage hook which initialized with the default value (null)
 * and then hydrated asynchronously in an effect. That allowed a brief window where children could see null
 * (or overwrite) before the stored value was applied, causing confusing flicker / races.
 *
 * We now synchronously read localStorage during the first render (when on the client) using a lazy initializer,
 * so children always receive the stored value on first paint. We also persist every explicit update.
 */
export function FocusPlayerProvider({ children }: { children: ReactNode }) {
  // undefined => not yet hydrated (server render / pre-hydration). null|string => actual value.
  const [focusPlayer, setFocusPlayerState] = useState<
    string | null | undefined
  >(() => {
    if (typeof window === 'undefined') return undefined; // SSR / RSC pre-hydration
    try {
      const raw = window.localStorage.getItem('focusPlayer');
      return raw ? (JSON.parse(raw) as string | null) : null;
    } catch {
      return null;
    }
  });

  // Track if we've performed post-mount hydration (in case first render was on server and value was undefined)
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (focusPlayer !== undefined) return; // already had value
    try {
      const raw = window.localStorage.getItem('focusPlayer');
      setFocusPlayerState(raw ? (JSON.parse(raw) as string | null) : null);
    } catch {
      setFocusPlayerState(null);
    }
  }, [focusPlayer]);

  const setFocusPlayer = (player: string | null) => {
    setFocusPlayerState(player);
    try {
      window.localStorage.setItem('focusPlayer', JSON.stringify(player));
    } catch {
      // ignore quota / availability errors
    }
  };

  return (
    <FocusPlayerContext.Provider value={{ focusPlayer, setFocusPlayer }}>
      {children}
    </FocusPlayerContext.Provider>
  );
}
