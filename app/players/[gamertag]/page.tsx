import { redirect } from 'next/navigation';
import PlayerProfile from '../../../components/player-profile/player-profile';

export interface PlayerPageProps {
  params: Promise<{
    gamertag: string | string[] | undefined;
  }>;
}

export default async function PlayerProfilePage(props: PlayerPageProps) {
  const params = await props.params;
  const gamerTag = decodeURIComponent(
    typeof params.gamertag === 'string'
      ? params.gamertag
      : params.gamertag?.[0] ?? ''
  );
  if (gamerTag === undefined) {
    redirect('/');
  }
  return <PlayerProfile gamerTag={gamerTag} />;
}
