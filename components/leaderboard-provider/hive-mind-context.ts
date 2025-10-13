import { createContext, useContext } from 'react';
import { Observable } from 'rxjs';

export const HiveMindContext = createContext<
  | {
      selfId: string | undefined;
      peerStatus$: Observable<Record<string, number | null>> | undefined;
    }
  | undefined
>(undefined);

export const useHiveMind = () => useContext(HiveMindContext);
