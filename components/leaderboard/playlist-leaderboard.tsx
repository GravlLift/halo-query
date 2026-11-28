import { Box, Tabs } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import ListView from './list-view';
import PlayerCount from './player-count';
import SkillBucketChart from './skill-bucket-chart';
import { SkillProp } from '@gravllift/halo-helpers';

export default function PlaylistLeaderboard({
  playlistAssetId,
  page,
  gamertag,
  skillProp,
}: {
  playlistAssetId: string;
  page: string | undefined;
  gamertag: string | undefined;
  skillProp: SkillProp | undefined;
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
        defaultValue={skillProp || SkillProp.Esr}
      >
        <Tabs.List>
          <Tabs.Trigger value={SkillProp.Esr}>ESR</Tabs.Trigger>
          <Tabs.Trigger value={SkillProp.Csr}>CSR</Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>
      <Box mt={4}>
        <SkillBucketChart
          playlistAssetId={playlistAssetId}
          skillProp={skillProp || SkillProp.Esr}
        />
      </Box>
      <ListView
        playlistAssetId={playlistAssetId}
        page={page}
        gamertag={gamertag}
        skillProp={skillProp || SkillProp.Esr}
      />
    </Suspense>
  );
}
