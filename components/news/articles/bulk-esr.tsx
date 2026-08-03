import { Link, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

export default function BulkEsr() {
  return (
    <>
      <Text>
        There is now a dedicated{' '}
        <Link asChild>
          <NextLink href="/bulk-esr">Bulk ESR page</NextLink>
        </Link>{' '}
        for pulling Ranked Arena ESR-A values for multiple players at once. You
        can add gamertags manually, one per row, or upload a CSV file and let
        Halo Query process it in bulk. CSV uploads support either a single
        column list or a header row that contains a &quot;Gamertag&quot; column.
      </Text>
      <Text>
        The optional &quot;As Of Date&quot; field lets you query historical
        values instead of only the current moment. This makes it easier to
        compare players at a specific point in time, review older events, or
        re-run the same snapshot later.
      </Text>
      <Text>
        Once results come back, you can retry failed rows, remove entries you do
        not need, and export the full table to CSV for sharing or offline
        analysis.
      </Text>
    </>
  );
}
