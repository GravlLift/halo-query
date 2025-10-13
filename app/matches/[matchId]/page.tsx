import Match from '../../../components/match/match';

/* eslint-disable-next-line */
export interface MatchPageProps {
  params: Promise<{
    matchId: string;
  }>;
  searchParams: Promise<{
    gamertag: string | string[] | undefined;
    filters: string | undefined;
  }>;
}

export default async function MatchPage(props: MatchPageProps) {
  return (
    <Match
      matchId={(await props.params).matchId}
      filters={(await props.searchParams).filters}
    />
  );
}
