import { SeverityLevel } from '@microsoft/applicationinsights-web';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Preset } from '../../components/columns';
import Matches from '../../components/matches';
import { appInsights } from '../../lib/application-insights/client';

export const dynamic = 'force-dynamic';

/* eslint-disable-next-line */
export interface MatchesPageProps {
  searchParams: Promise<{
    gamertag?: string | string[];
    page?: string; // Use 1 start for page numbers
    filters?: string;
    columns?: string;
    pageSize?: string;
  }>;
}

export const metadata: Metadata = {
  title: `Matches | Halo Query`,
  description: `Halo Infinite match data`,
};

export default async function MatchesPage(props: MatchesPageProps) {
  const searchParams = await props.searchParams;
  const gamerTags = (
    typeof searchParams.gamertag === 'string'
      ? searchParams.gamertag.split(',')
      : searchParams.gamertag
  )?.map((g) => g.trim());

  if (!gamerTags || gamerTags.length === 0) {
    return redirect('/');
  }

  const page: number = Math.max(
    1,
    typeof searchParams.page === 'string' ? parseInt(searchParams.page) : 1
  );

  let columns: bigint | Preset | undefined = undefined;
  if (searchParams.columns) {
    if (Object.values(Preset).includes(searchParams.columns as Preset)) {
      columns = searchParams.columns as Preset;
    } else {
      try {
        columns = BigInt(searchParams.columns);
      } catch (e) {
        appInsights.trackTrace({
          severityLevel: SeverityLevel.Warning,
          message: 'Invalid columns query parameter',
          properties: {
            columns: searchParams.columns,
          },
        });
      }
    }
  }

  let pageSize: number | undefined = undefined;
  if (searchParams.pageSize) {
    try {
      pageSize = parseInt(searchParams.pageSize);
    } catch (e) {
      appInsights.trackTrace({
        severityLevel: SeverityLevel.Warning,
        message: 'Invalid pageSize query parameter',
        properties: {
          pageSize: searchParams.pageSize,
        },
      });
    }
  }

  return (
    <Matches
      gamerTags={gamerTags.join(',')}
      page={page}
      filters={searchParams.filters}
      columns={columns}
      pageSize={pageSize}
    />
  );
}
