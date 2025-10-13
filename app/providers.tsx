'use client';
import LeaderboardProvider from '../components/leaderboard-provider';
import { ChakraProvider } from '../components/ui/chakra-provider';
import { ApiClientsProvider } from '../lib/contexts/api-client-contexts';
import { AuthenticationProvider } from '../lib/contexts/authentication-contexts';
import { FocusPlayerProvider } from '../lib/contexts/focus-player-context';
import { HaloCachesProvider } from '../lib/contexts/halo-caches-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthenticationProvider>
      <ApiClientsProvider>
        <LeaderboardProvider>
          <HaloCachesProvider>
            <FocusPlayerProvider>
              <ChakraProvider>{children}</ChakraProvider>
            </FocusPlayerProvider>
          </HaloCachesProvider>
        </LeaderboardProvider>
      </ApiClientsProvider>
    </AuthenticationProvider>
  );
}
