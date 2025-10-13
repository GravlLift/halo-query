import { Metadata } from 'next';
import Leaderboard from '../../components/leaderboard';

export const metadata: Metadata = {
  title: `Leaderboard | Halo Query`,
  description: `Halo Infinite leaderboards`,
};

export default async function LeaderboardPage(props: {
  searchParams: Promise<{
    playlistAssetId: string | undefined;
    skillProp: 'esr' | 'csr' | undefined;
    gamertag: string | undefined;
    page: string | undefined; // Use 1 start for page numbers
  }>;
}) {
  const searchParams = await props.searchParams;
  return (
    <Leaderboard
      page={searchParams.page}
      gamertag={searchParams.gamertag}
      playlistAssetId={searchParams.playlistAssetId}
      skillProp={searchParams.skillProp}
    />
  );
}
