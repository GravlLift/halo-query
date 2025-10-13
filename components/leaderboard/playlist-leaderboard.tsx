import { Box, Tabs } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import ListView from './list-view';
import PlayerCount from './player-count';
import SkillBucketChart from './skill-bucket-chart';

export default function PlaylistLeaderboard({
  playlistAssetId,
  page,
  gamertag,
  skillProp,
}: {
  playlistAssetId: string;
  page: string | undefined;
  gamertag: string | undefined;
  skillProp: 'esr' | 'csr' | undefined;
}) {
  const router = useRouter();
  return (
    <Suspense>
      <Box>
        <PlayerCount playlistAssetId={playlistAssetId} />
      </Box>
      <Tabs.Root
        lazyMount
        variant={'line'}
        fitted
        onValueChange={(e) => {
          const search = new URLSearchParams(window.location.search);
          search.delete('page');
          search.set('skillProp', e.value);
          router.replace(`/leaderboard?${search.toString()}`);
        }}
        defaultValue={skillProp || 'esr'}
      >
        <Tabs.List>
          <Tabs.Trigger value="esr">ESR</Tabs.Trigger>
          <Tabs.Trigger value="csr">CSR</Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>
      <Box mt={4}>
        <SkillBucketChart
          playlistAssetId={playlistAssetId}
          skillProp={skillProp || 'esr'}
        />
      </Box>
      <ListView
        playlistAssetId={playlistAssetId}
        page={page}
        gamertag={gamertag}
        skillProp={skillProp || 'esr'}
      />
    </Suspense>
  );
}
